// enablers/desktop/runtime/launcher.mjs
//
// DX1b launcher entry. Orchestrates:
//   1. PulsePlayData/ ensure
//   2. Two random 127.0.0.1 ports (app server + bundled proxy)
//   3. 256-bit launch token via crypto.randomBytes
//   4. Spawn `node proxy/server.js` child with PORT=<proxy-port>
//   5. Wait for the proxy to be reachable via /health
//   6. Create app server, listen on the app port
//   7. Open the launch URL in a private/incognito browser (with fallback)
//   8. Sit on SIGINT/SIGTERM to clean up children
//
// DX1b-4 (next slice) wires the heartbeat watchdog and crash-recovery
// lock file. This slice keeps the launcher single-shot and trusts the
// user to ^C to exit.
//
// Contract: docs/DX1_LAUNCHER_CONTRACT.md §1-§7 + §10 (partial).

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

import {
    TOKEN_BYTES,
    LAUNCH_PATH,
    LAUNCHER_VERSION_FALLBACK,
} from "./config.mjs";
import { findFreePorts } from "./portDiscovery.mjs";
import { tryLaunchPrivateBrowser } from "./browserLaunch.mjs";
import { createAppServer } from "./appServer.mjs";
import { ensureDataDir } from "./dataStore.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARG_DEV = "--dev";
const ARG_NO_BROWSER = "--no-browser";

function parseArgs(argv) {
    const args = argv.slice(2);
    return {
        dev: args.includes(ARG_DEV),
        noBrowser: args.includes(ARG_NO_BROWSER),
    };
}

// Resolve runtime paths based on where the launcher was invoked from.
// Dev mode (default when launched via `npm run dev` from enablers/desktop):
//   repoRoot     = ../../ relative to runtime/launcher.mjs
//   proxyEntry   = repoRoot/proxy/server.js
//   staticDir    = repoRoot/playground/dist
//   baseDir      = enablers/desktop/  (so PulsePlayData/ lands here under dev,
//                  beside the launcher binary under packaging)
// Packaged mode (`process.execPath` !== node binary):
//   The packaged tool sits beside its sidecar files; baseDir = dirname(execPath).
//   Slice 6 (packaging proof) fills in this branch's path resolution.
async function resolvePaths(opts) {
    const isPackaged = typeof process.pkg !== "undefined" || process.execPath !== process.argv0;
    const enablerRoot = path.resolve(__dirname, "..");
    const repoRoot = path.resolve(enablerRoot, "..", "..");

    // For DX1b proof we use the dev-mode resolution unless flag overrides.
    // Slice 6 introduces a packaging manifest that lets the packaged tool
    // ship its proxy + static assets in a known location.
    const baseDir = isPackaged && !opts.dev
        ? path.dirname(process.execPath)
        : enablerRoot;

    const proxyEntry = path.join(repoRoot, "proxy", "server.js");
    const staticDir = path.join(repoRoot, "playground", "dist");

    return { repoRoot, enablerRoot, baseDir, proxyEntry, staticDir, isPackaged };
}

async function readLauncherVersion(enablerRoot) {
    try {
        const pkg = JSON.parse(await fs.readFile(path.join(enablerRoot, "package.json"), { encoding: "utf8" }));
        return typeof pkg.version === "string" && pkg.version.length > 0 ? pkg.version : LAUNCHER_VERSION_FALLBACK;
    } catch {
        return LAUNCHER_VERSION_FALLBACK;
    }
}

function generateLaunchToken() {
    return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

async function ensureStaticDirOrFail(staticDir) {
    try {
        const stat = await fs.stat(staticDir);
        if (!stat.isDirectory()) {
            throw new Error(`${staticDir} is not a directory`);
        }
        await fs.access(path.join(staticDir, "index.html"));
    } catch {
        throw new Error(
            `staticDir not ready at ${staticDir}\n` +
            "Run `cd playground && npm run build` first so the launcher has something to serve.",
        );
    }
}

async function ensureProxyEntryOrFail(proxyEntry) {
    try {
        const stat = await fs.stat(proxyEntry);
        if (!stat.isFile()) throw new Error(`${proxyEntry} is not a file`);
    } catch {
        throw new Error(`bundled proxy not found at ${proxyEntry}`);
    }
}

function spawnProxyChild(proxyEntry, port, dataLogPath) {
    // We spawn our own loopback-binding wrapper (proxyEntry.cjs) instead
    // of proxy/server.js directly. The proxy's own startup banner uses
    // `runAsDatabricksApp = Boolean(env.PORT || env.DATABRICKS_APP_PORT)`
    // and would bind 0.0.0.0 if we set PORT. The wrapper imports the
    // express app (server.js exports it but only auto-starts under
    // require.main) and binds 127.0.0.1:PULSEPLAY_DESKTOP_PROXY_PORT.
    const wrapper = path.join(__dirname, "proxyEntry.cjs");
    const env = {
        ...process.env,
        PULSEPLAY_DESKTOP_PROXY_PORT: String(port),
        PULSEPLAY_DESKTOP_PROXY_ENTRY: proxyEntry,
        // Do NOT set PORT or DATABRICKS_APP_PORT - those trigger the
        // proxy's Databricks-Apps branch and bind 0.0.0.0 (contract §11
        // forbids that).
        //
        // Default NODE_ENV=development for local recon. The proxy's
        // production-mode guards (strict allowlist, CORS pinning, etc.)
        // are deployment safety nets and would block a clean DX1 launch
        // on a config.json that's perfectly fine for local use. The
        // operator can still override by setting NODE_ENV upstream.
        NODE_ENV: process.env.NODE_ENV || "development",
    };
    const cwd = path.dirname(proxyEntry);
    const child = spawn(process.execPath, [wrapper], {
        env,
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
    });
    // Mirror proxy stdio into PulsePlayData/logs/proxy.log AND surface
    // a short prefix to the launcher console so the user sees progress.
    const tag = (label) => (chunk) => {
        const text = String(chunk).trimEnd();
        if (text.length === 0) return;
        process.stdout.write(`[proxy:${label}] ${text}\n`);
        fs.appendFile(dataLogPath, `[proxy:${label}] ${text}\n`).catch(() => {});
    };
    child.stdout.on("data", tag("out"));
    child.stderr.on("data", tag("err"));
    return child;
}

async function waitForProxyReady(port, { timeoutMs = 10_000, intervalMs = 250 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const ok = await new Promise((resolve) => {
            const req = http.request({ host: "127.0.0.1", port, path: "/health", method: "GET", timeout: 1_000 }, (res) => {
                res.resume();
                resolve(res.statusCode === 200);
            });
            req.on("error", () => resolve(false));
            req.on("timeout", () => { req.destroy(); resolve(false); });
            req.end();
        });
        if (ok) return true;
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
}

function attachShutdown(state) {
    let exiting = false;
    const exit = async (code, reason) => {
        if (exiting) return;
        exiting = true;
        process.stdout.write(`\n[launcher] shutting down (${reason})...\n`);
        try { if (state.appServer) await new Promise((r) => state.appServer.close(r)); } catch {}
        try {
            if (state.proxyChild && !state.proxyChild.killed) {
                state.proxyChild.kill("SIGTERM");
                // give it 1s to die, then SIGKILL
                await new Promise((r) => setTimeout(r, 1_000));
                if (!state.proxyChild.killed) state.proxyChild.kill("SIGKILL");
            }
        } catch {}
        process.exit(code);
    };
    process.on("SIGINT", () => exit(0, "SIGINT"));
    process.on("SIGTERM", () => exit(0, "SIGTERM"));
    process.on("SIGHUP", () => exit(0, "SIGHUP"));
    return { exit };
}

// Top-level entry. Exported for tests / smoke runner; the script
// invocation at the bottom of the file calls run() when imported as
// the main module.
export async function run(argv = process.argv) {
    const opts = parseArgs(argv);
    const { enablerRoot, baseDir, proxyEntry, staticDir } = await resolvePaths(opts);
    const version = await readLauncherVersion(enablerRoot);

    await ensureProxyEntryOrFail(proxyEntry);
    await ensureStaticDirOrFail(staticDir);

    const dataDir = await ensureDataDir(baseDir);
    const launchLogPath = path.join(dataDir, "logs", "launch.log");
    const runtimeLogPath = path.join(dataDir, "logs", "runtime.log");
    const proxyLogPath = path.join(dataDir, "logs", "proxy.log");

    process.stdout.write(`\nPulsePlay desktop launcher (v${version})\n`);
    process.stdout.write(`  dataDir   ${dataDir}\n`);
    process.stdout.write(`  staticDir ${staticDir}\n`);
    process.stdout.write(`  proxy     ${proxyEntry}\n\n`);

    const [appPort, proxyPort] = await findFreePorts(2);
    const launchToken = generateLaunchToken();

    process.stdout.write(`[launcher] picked ports: app=${appPort}  proxy=${proxyPort}\n`);
    await fs.appendFile(runtimeLogPath, `[launcher] ports app=${appPort} proxy=${proxyPort}\n`).catch(() => {});

    // 1) Spawn bundled proxy child.
    const proxyChild = spawnProxyChild(proxyEntry, proxyPort, proxyLogPath);
    const state = { proxyChild, appServer: null };
    const shutdown = attachShutdown(state);

    proxyChild.on("exit", (code, signal) => {
        process.stdout.write(`[launcher] proxy child exited (code=${code} signal=${signal})\n`);
        shutdown.exit(code ?? 1, `proxy-exited-${signal || code}`);
    });

    // 2) Wait for the proxy to be ready.
    const ready = await waitForProxyReady(proxyPort, { timeoutMs: 15_000 });
    if (!ready) {
        process.stdout.write("[launcher] proxy did not become ready within 15s; aborting\n");
        shutdown.exit(1, "proxy-not-ready");
        return;
    }
    process.stdout.write(`[launcher] proxy ready on http://127.0.0.1:${proxyPort}\n`);

    // 3) Build + listen on the app server.
    const { app } = await createAppServer({
        dataDir,
        staticDir,
        proxyPort,
        launchToken,
        version,
        onQuit: () => shutdown.exit(0, "runtime-quit"),
    });
    const appServer = http.createServer(app);
    state.appServer = appServer;
    await new Promise((resolve, reject) => {
        appServer.once("error", reject);
        appServer.listen(appPort, "127.0.0.1", resolve);
    });
    process.stdout.write(`[launcher] app server ready on http://127.0.0.1:${appPort}\n`);

    // 4) Open a private/incognito browser.
    const launchUrl = `http://127.0.0.1:${appPort}${LAUNCH_PATH}#token=${launchToken}`;
    if (opts.noBrowser) {
        process.stdout.write(`[launcher] --no-browser set; open ${launchUrl} manually\n`);
        return { appPort, proxyPort, launchToken, launchUrl, version };
    }
    try {
        const audit = (line) => {
            process.stdout.write(`${line}\n`);
            fs.appendFile(launchLogPath, `${line}\n`).catch(() => {});
        };
        const result = await tryLaunchPrivateBrowser(launchUrl, { audit });
        if (result.warningDefaultBrowser) {
            process.stdout.write("[launcher] WARNING: no private-capable browser detected; used default browser. Private mode is NOT guaranteed.\n");
        }
    } catch (err) {
        process.stdout.write(`[launcher] could not open any browser: ${err.message}\nOpen this URL manually:\n  ${launchUrl}\n`);
    }

    process.stdout.write("[launcher] press Ctrl+C to quit\n");
    return { appPort, proxyPort, launchToken, launchUrl, version };
}

// When invoked as the main module (npm run start / dev), kick off run().
// import.meta.url ends with launcher.mjs; process.argv[1] is the file.
const invokedDirectly = (() => {
    try {
        const argvPath = path.resolve(process.argv[1] || "");
        return argvPath === __filename;
    } catch {
        return false;
    }
})();

if (invokedDirectly) {
    run(process.argv).catch((err) => {
        process.stderr.write(`[launcher] fatal: ${err && err.stack ? err.stack : err}\n`);
        process.exit(1);
    });
}

export const __forTests = {
    parseArgs,
    generateLaunchToken,
    resolvePaths,
    readLauncherVersion,
    waitForProxyReady,
};
