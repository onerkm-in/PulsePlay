// enablers/desktop/runtime/appServer.mjs
//
// The bundled app server. Two responsibilities, kept apart:
//
//   1) Serve the built PulsePlay React app from staticDir.
//   2) Mount the /runtime/* Save Changes endpoints + the /api/* reverse
//      proxy to the bundled proxy. Validate the launch token on every
//      /runtime/* call except /runtime/version (intentionally open for
//      diagnostics + the React-side mode detector).
//
// Pure factory: no port choice, no process management, no browser
// launch. The launcher passes everything in via createAppServer().
//
// Contract: docs/DX1_LAUNCHER_CONTRACT.md §3, §5, §7, §8, §11, §12.

import express from "express";
import path from "node:path";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import { createProxyMiddleware } from "http-proxy-middleware";

import {
    LAUNCH_TOKEN_HEADER,
    DESKTOP_CLIENT_HEADER,
    DESKTOP_CLIENT_VALUE,
    DESKTOP_CLIENT_VERSION_HEADER,
    DESKTOP_REQUEST_ID_HEADER,
    RUNTIME_PREFIX,
    API_PREFIX,
    LAUNCH_PATH,
    HEARTBEAT_PATH,
    LOGS_RUNTIME_FILENAME,
    LOGS_PROXY_FILENAME,
    DEFAULT_PROFILE_NAME,
} from "./config.mjs";
import {
    ensureDataDir,
    ensureDefaultProfile,
    readState,
    writeState,
    listProfiles,
    getActiveProfile,
    setActiveProfile,
    createProfile,
    deleteProfile,
    readSecrets,
    writeSecret,
    readLogTail,
} from "./dataStore.mjs";

const HOST_HEADER_LOOPBACK_RE = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

// Hard rule from contract §11: reject requests whose Host header is
// anything other than loopback. Protects against DNS-rebinding attacks
// where a malicious page on the same machine resolves a name to
// 127.0.0.1 and tries to talk to our port. Also documented in
// PULSE_SYNC.md Tier 3.5.
function rejectNonLoopbackHost(req, res, next) {
    const host = req.headers.host || "";
    if (!HOST_HEADER_LOOPBACK_RE.test(host)) {
        res.status(403).json({ error: "non-loopback host header rejected" });
        return;
    }
    next();
}

function makeTokenGuard(launchTokenRef) {
    return function tokenGuard(req, res, next) {
        const provided = req.headers[LAUNCH_TOKEN_HEADER.toLowerCase()];
        const expected = launchTokenRef.token;
        if (!expected) {
            res.status(503).json({ error: "launch token not initialized" });
            return;
        }
        if (typeof provided !== "string" || provided.length !== expected.length) {
            res.status(401).json({ error: "missing or malformed launch token" });
            return;
        }
        // Constant-time comparison to avoid timing side-channels.
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
            res.status(401).json({ error: "invalid launch token" });
            return;
        }
        next();
    };
}

// /launch shim. Serves a tiny HTML page that moves the URL fragment
// token into sessionStorage then redirects to "/". The token rides in
// the fragment (window.location.hash) so it is NOT in URL history nor
// in any server log. The React app reads sessionStorage on mount to
// know it's running in EXE mode (presence of the key) and to send the
// token on /runtime/* requests.
function launchHtml() {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>PulsePlay (Desktop)</title>
<meta name="robots" content="noindex,nofollow" />
</head>
<body>
<script>
(function () {
    try {
        var hash = window.location.hash || "";
        var m = hash.match(/token=([A-Za-z0-9_-]+)/);
        if (m && m[1]) {
            window.sessionStorage.setItem("pulseplay:desktop-launch-token", m[1]);
        }
        window.history.replaceState(null, "", "/");
    } catch (e) {
        // sessionStorage may be unavailable in some private modes.
        // The React app's Settings save path falls back to a visible
        // recon banner in that case (DX1b-5).
    }
    window.location.replace("/");
})();
</script>
<noscript>
Open this page with JavaScript enabled. The desktop launcher relies on
script-level token forwarding; it never sets a cookie.
</noscript>
</body>
</html>`;
}

// Resolve a per-request id for the proxy hop. Prefers an inbound
// X-Pulse-Request-Id (if the React app supplied one) so audit logs in
// the bundled proxy can correlate.
function pickRequestId(req) {
    const inbound = req.headers[DESKTOP_REQUEST_ID_HEADER.toLowerCase()];
    if (typeof inbound === "string" && inbound.length > 0 && inbound.length <= 128) {
        return inbound;
    }
    return crypto.randomUUID();
}

/**
 * @typedef {object} CreateAppServerOptions
 * @property {string} dataDir            base directory that contains PulsePlayData/
 * @property {string} staticDir          path to playground/dist (or equivalent)
 * @property {number} proxyPort          127.0.0.1 port the bundled proxy is listening on
 * @property {string} launchToken        per-session 256-bit base64url token
 * @property {string} version            launcher build version string
 * @property {() => void} [onHeartbeat]  invoked by /runtime/heartbeat
 * @property {() => void} [onQuit]       invoked by /runtime/quit
 */

/**
 * Build the express app. Does NOT bind to a port; the launcher owns
 * port discovery.
 *
 * @param {CreateAppServerOptions} options
 * @returns {Promise<{ app: import('express').Express, getLaunchToken: () => string, rotateLaunchToken: (next: string) => void }>}
 */
export async function createAppServer(options) {
    const {
        dataDir,
        staticDir,
        proxyPort,
        launchToken,
        version,
        onHeartbeat,
        onQuit,
    } = options || {};
    if (typeof dataDir !== "string" || dataDir.length === 0) {
        throw new Error("createAppServer: dataDir required");
    }
    if (typeof staticDir !== "string" || staticDir.length === 0) {
        throw new Error("createAppServer: staticDir required");
    }
    if (!Number.isInteger(proxyPort) || proxyPort < 1 || proxyPort > 65535) {
        throw new Error("createAppServer: proxyPort must be a valid TCP port");
    }
    if (typeof launchToken !== "string" || launchToken.length < 32) {
        throw new Error("createAppServer: launchToken must be a sufficiently long string");
    }
    if (typeof version !== "string" || version.length === 0) {
        throw new Error("createAppServer: version required");
    }

    await ensureDataDir(dataDir);
    await ensureDefaultProfile(dataDir);

    // Mutable token ref so a future cycle can rotate without re-creating
    // the express app (not used in DX1b but cheap to expose).
    const launchTokenRef = { token: launchToken };

    const app = express();

    // Disable the X-Powered-By: Express header. Tiny attack-surface
    // reduction; standard practice.
    app.disable("x-powered-by");

    // Reject non-loopback Host headers immediately - applied before
    // any other middleware so it cannot be bypassed by a chained route.
    app.use(rejectNonLoopbackHost);

    // Parse JSON bodies for /runtime/* endpoints.
    app.use(express.json({ limit: "1mb" }));

    // /launch shim. Public on purpose - it serves a static HTML page
    // that contains no secrets; the token rides in the fragment which
    // is never sent to the server.
    app.get(LAUNCH_PATH, (_req, res) => {
        res.type("html").send(launchHtml());
    });

    // /runtime/version - intentionally open. The React-side mode detector
    // hits this to confirm it's running inside the desktop launcher.
    app.get(`${RUNTIME_PREFIX}/version`, (_req, res) => {
        res.json({
            client: DESKTOP_CLIENT_VALUE,
            version,
            launcher: "DX1b",
        });
    });

    // All other /runtime/* endpoints behind the token guard.
    const guarded = express.Router();
    guarded.use(makeTokenGuard(launchTokenRef));

    // GET /runtime/state - returns merged state for the active profile.
    guarded.get("/state", async (_req, res, next) => {
        try {
            const active = await getActiveProfile(dataDir);
            const state = await readState(dataDir, active);
            res.json({ profile: active, state });
        } catch (err) { next(err); }
    });

    // PUT /runtime/state - { scope, patch } -> merged state.
    guarded.put("/state", async (req, res, next) => {
        try {
            const active = await getActiveProfile(dataDir);
            const next = await writeState(dataDir, active, req.body);
            res.json({ profile: active, state: next });
        } catch (err) {
            res.status(400).json({ error: err && err.message ? err.message : "writeState failed" });
        }
    });

    // GET /runtime/profiles - list of profile names + active.
    guarded.get("/profiles", async (_req, res, next) => {
        try {
            const [profiles, active] = await Promise.all([listProfiles(dataDir), getActiveProfile(dataDir)]);
            res.json({ profiles, active });
        } catch (err) { next(err); }
    });

    // GET /runtime/profile/active - current active profile name.
    guarded.get("/profile/active", async (_req, res, next) => {
        try {
            res.json({ name: await getActiveProfile(dataDir) });
        } catch (err) { next(err); }
    });

    // PUT /runtime/profile/active - { name }.
    guarded.put("/profile/active", async (req, res) => {
        try {
            const name = await setActiveProfile(dataDir, req.body && req.body.name);
            res.json({ name });
        } catch (err) {
            res.status(400).json({ error: err && err.message ? err.message : "setActiveProfile failed" });
        }
    });

    // POST /runtime/profile - { name, copyFrom? } -> created profile.
    guarded.post("/profile", async (req, res) => {
        try {
            const name = await createProfile(
                dataDir,
                req.body && req.body.name,
                req.body && req.body.copyFrom,
            );
            res.status(201).json({ name });
        } catch (err) {
            res.status(400).json({ error: err && err.message ? err.message : "createProfile failed" });
        }
    });

    // DELETE /runtime/profile/:name - two-step confirm-token protocol.
    // First DELETE without X-Confirm-Token returns 202 + a one-shot token.
    // Second DELETE with X-Confirm-Token deletes.
    const pendingDeleteTokens = new Map(); // profileName -> { token, expiresAt }
    const CONFIRM_TOKEN_TTL_MS = 60_000;
    guarded.delete("/profile/:name", async (req, res) => {
        const name = req.params.name;
        const confirm = req.headers["x-confirm-token"];
        const pending = pendingDeleteTokens.get(name);
        const now = Date.now();
        // First-shot: mint a confirm token, do not delete yet.
        if (!confirm) {
            const token = crypto.randomBytes(16).toString("base64url");
            pendingDeleteTokens.set(name, { token, expiresAt: now + CONFIRM_TOKEN_TTL_MS });
            res.status(202).json({ confirmToken: token, ttlMs: CONFIRM_TOKEN_TTL_MS });
            return;
        }
        // Second-shot: verify token + delete.
        if (!pending || pending.expiresAt < now || pending.token !== confirm) {
            pendingDeleteTokens.delete(name);
            res.status(409).json({ error: "confirm token missing, expired, or mismatched" });
            return;
        }
        pendingDeleteTokens.delete(name);
        try {
            await deleteProfile(dataDir, name);
            res.status(204).end();
        } catch (err) {
            res.status(400).json({ error: err && err.message ? err.message : "deleteProfile failed" });
        }
    });

    // GET /runtime/secrets - returns key list ONLY (no values).
    guarded.get("/secrets", async (_req, res, next) => {
        try {
            const all = await readSecrets(dataDir);
            res.json({ keys: Object.keys(all).sort(), encrypted: false, warning: "plaintext storage; DX2 encrypts" });
        } catch (err) { next(err); }
    });

    // PUT /runtime/secrets - { key, value }.
    guarded.put("/secrets", async (req, res) => {
        try {
            const { key, value } = req.body || {};
            await writeSecret(dataDir, key, value === null ? null : String(value));
            res.status(204).end();
        } catch (err) {
            res.status(400).json({ error: err && err.message ? err.message : "writeSecret failed" });
        }
    });

    // GET /runtime/logs/recent - merged tail of runtime + proxy logs.
    guarded.get("/logs/recent", async (_req, res, next) => {
        try {
            const [runtimeTail, proxyTail] = await Promise.all([
                readLogTail(dataDir, LOGS_RUNTIME_FILENAME),
                readLogTail(dataDir, LOGS_PROXY_FILENAME),
            ]);
            res.json({
                runtime: runtimeTail.split("\n").slice(-1000).join("\n"),
                proxy: proxyTail.split("\n").slice(-1000).join("\n"),
            });
        } catch (err) { next(err); }
    });

    // POST /runtime/heartbeat - the React app pings every 15s while alive.
    guarded.post(HEARTBEAT_PATH, (_req, res) => {
        if (typeof onHeartbeat === "function") onHeartbeat();
        res.status(204).end();
    });

    // POST /runtime/quit - Settings -> System -> "Quit PulsePlay" button.
    guarded.post("/quit", (_req, res) => {
        res.status(202).json({ status: "quitting" });
        if (typeof onQuit === "function") {
            // Defer so the response actually flushes before the launcher
            // sends SIGTERM to itself / children.
            setImmediate(() => { try { onQuit(); } catch { /* swallow */ } });
        }
    });

    app.use(RUNTIME_PREFIX, guarded);

    // /api/* reverse proxy to the bundled proxy. Same prefix-strip the
    // Vite dev server uses (vite.config.ts server.proxy['/api']).
    app.use(
        API_PREFIX,
        createProxyMiddleware({
            target: `http://127.0.0.1:${proxyPort}`,
            changeOrigin: true,
            pathRewrite: { [`^${API_PREFIX}`]: "" },
            on: {
                proxyReq: (proxyReq, req) => {
                    // PX1 client identity. proxy/lib/pulseClientContext.js
                    // already normalizes 'pulseplay-desktop' to the same
                    // canonical form so audit logs see one client per request.
                    proxyReq.setHeader(DESKTOP_CLIENT_HEADER, DESKTOP_CLIENT_VALUE);
                    proxyReq.setHeader(DESKTOP_CLIENT_VERSION_HEADER, version);
                    proxyReq.setHeader(DESKTOP_REQUEST_ID_HEADER, pickRequestId(req));
                },
            },
        }),
    );

    // Static React app last so /api and /runtime always win the route
    // table. express.static handles ETag + range; the launcher's static
    // dir is the built playground/dist.
    app.use(express.static(staticDir, { etag: true, index: ["index.html"] }));

    // SPA fallback. Any unmatched GET (that isn't /api or /runtime,
    // because those handlers already responded) gets index.html so the
    // React Router routes work after the /launch shim redirects.
    app.get(/^(?!\/(api|runtime|launch)).*/, async (_req, res, next) => {
        try {
            const index = await fs.readFile(path.join(staticDir, "index.html"), { encoding: "utf8" });
            res.type("html").send(index);
        } catch (err) {
            next(err);
        }
    });

    // Final error handler - never leak err.stack to a browser; log to the
    // runtime log (DX1b uses stderr; DX2 ships file rotation).
    // eslint-disable-next-line no-unused-vars
    app.use((err, _req, res, _next) => {
        console.error("[app-server]", err && err.message ? err.message : err);
        res.status(500).json({ error: "internal server error" });
    });

    return {
        app,
        getLaunchToken: () => launchTokenRef.token,
        rotateLaunchToken: (next) => { launchTokenRef.token = next; },
    };
}

export const __forTests = {
    HOST_HEADER_LOOPBACK_RE,
    pickRequestId,
    launchHtml,
};
