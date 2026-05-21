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
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
    TOKEN_BYTES,
    LAUNCH_PATH,
    LAUNCHER_VERSION_FALLBACK,
    HEARTBEAT_TIMEOUT_MS,
} from "./config.mjs";
import { findFreePorts } from "./portDiscovery.mjs";
import { tryLaunchPrivateBrowser } from "./browserLaunch.mjs";
import { createAppServer } from "./appServer.mjs";
import { ensureDataDir } from "./dataStore.mjs";
import { createWatchdog } from "./watchdog.mjs";
import {
    inspectLock,
    writeLock,
    releaseLock,
    writeLastError,
} from "./lockFile.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARG_DEV = "--dev";
const ARG_NO_BROWSER = "--no-browser";
const ARG_DESKTOP_PROXY_CHILD = "--desktop-proxy-child";

function parseArgs(argv) {
    const args = argv.slice(2);
    return {
        dev: args.includes(ARG_DEV),
        noBrowser: args.includes(ARG_NO_BROWSER),
        proxyChild: args.includes(ARG_DESKTOP_PROXY_CHILD),
    };
}

function isPackagedRuntime(execPath = process.execPath, argv0 = process.argv0) {
    // @yao-pkg/pkg sets process.pkg. The execPath/argv0 fallback keeps
    // tests and future packagers from depending on that exact implementation.
    if (Boolean(process.pkg)) return true;
    const execBase = path.basename(execPath || "").toLowerCase();
    return Boolean(execBase) && execBase !== "node.exe" && execBase !== "node";
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
//   proxyEntry = baseDir/proxy/server.js
//   staticDir  = baseDir/playground/dist
async function resolvePaths(opts, runtime = {}) {
    const execPath = runtime.execPath || process.execPath;
    const argv0 = runtime.argv0 || process.argv0;
    const packaged = typeof runtime.isPackaged === "boolean"
        ? runtime.isPackaged
        : isPackagedRuntime(execPath, argv0);
    const enablerRoot = path.resolve(__dirname, "..");
    const repoRoot = path.resolve(enablerRoot, "..", "..");

    if (packaged && !opts.dev) {
        const baseDir = path.dirname(execPath);
        return {
            repoRoot: baseDir,
            enablerRoot: baseDir,
            baseDir,
            proxyEntry: path.join(baseDir, "proxy", "server.js"),
            staticDir: path.join(baseDir, "playground", "dist"),
            isPackaged: true,
        };
    }

    return {
        repoRoot,
        enablerRoot,
        baseDir: enablerRoot,
        proxyEntry: path.join(repoRoot, "proxy", "server.js"),
        staticDir: path.join(repoRoot, "playground", "dist"),
        isPackaged: false,
    };
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

function buildProxyChildSpawnPlan(proxyEntry, packaged = isPackagedRuntime()) {
    return {
        command: process.execPath,
        args: packaged ? [ARG_DESKTOP_PROXY_CHILD] : [path.join(__dirname, "proxyEntry.cjs")],
        cwd: path.dirname(proxyEntry),
    };
}

function spawnProxyChild(proxyEntry, port, dataLogPath, packaged) {
    // We spawn our own loopback-binding wrapper (proxyEntry.cjs) instead
    // of proxy/server.js directly. The proxy's own startup banner uses
    // `runAsDatabricksApp = Boolean(env.PORT || env.DATABRICKS_APP_PORT)`
    // and would bind 0.0.0.0 if we set PORT. The wrapper imports the
    // express app (server.js exports it but only auto-starts under
    // require.main) and binds 127.0.0.1:PULSEPLAY_DESKTOP_PROXY_PORT.
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
    const plan = buildProxyChildSpawnPlan(proxyEntry, packaged);
    const child = spawn(plan.command, plan.args, {
        env,
        cwd: plan.cwd,
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

function runProxyChildFromEnv() {
    const port = Number(process.env.PULSEPLAY_DESKTOP_PROXY_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        console.error("[proxy-wrap] PULSEPLAY_DESKTOP_PROXY_PORT must be a valid TCP port; got", process.env.PULSEPLAY_DESKTOP_PROXY_PORT);
        process.exit(1);
    }

    const proxyEntry = process.env.PULSEPLAY_DESKTOP_PROXY_ENTRY;
    if (!proxyEntry) {
        console.error("[proxy-wrap] PULSEPLAY_DESKTOP_PROXY_ENTRY is required");
        process.exit(1);
    }

    let mod;
    try {
        const requireFromProxy = createRequire(path.join(path.dirname(proxyEntry), "desktop-proxy-child.cjs"));
        mod = requireFromProxy(proxyEntry);
    } catch (err) {
        console.error(`[proxy-wrap] failed to require ${proxyEntry}: ${err && err.message ? err.message : err}`);
        process.exit(1);
    }

    if (!mod || typeof mod.app !== "function") {
        console.error(`[proxy-wrap] ${proxyEntry} did not export an 'app' (express handler). Got keys: ${Object.keys(mod || {}).join(", ")}`);
        process.exit(1);
    }

    const server = http.createServer(mod.app);
    server.on("error", (err) => {
        console.error(`[proxy-wrap] listen error: ${err && err.message ? err.message : err}`);
        process.exit(1);
    });
    server.listen(port, "127.0.0.1", () => {
        console.log(`[proxy-wrap] bound 127.0.0.1:${port} (desktop packaged child, no Databricks-Apps mode)`);
    });

    function shutdown(signal) {
        console.log(`[proxy-wrap] ${signal} received, closing...`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 5_000).unref();
    }
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGHUP", () => shutdown("SIGHUP"));
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
        try { if (state.watchdog) state.watchdog.stop(); } catch {}
        try { if (state.appServer) await new Promise((r) => state.appServer.close(r)); } catch {}
        try {
            if (state.proxyChild && !state.proxyChild.killed) {
                state.proxyChild.kill("SIGTERM");
                // give it 1s to die, then SIGKILL
                await new Promise((r) => setTimeout(r, 1_000));
                if (!state.proxyChild.killed) state.proxyChild.kill("SIGKILL");
            }
        } catch {}
        try { if (state.dataDir) await releaseLock(state.dataDir); } catch {}
        process.exit(code);
    };
    process.on("SIGINT", () => exit(0, "SIGINT"));
    process.on("SIGTERM", () => exit(0, "SIGTERM"));
    process.on("SIGHUP", () => exit(0, "SIGHUP"));
    // 'beforeExit' fires when the event loop drains - belt-and-braces
    // for the case where the process exits without a signal (e.g. unhandled
    // promise rejection in older Node configs). exit() is idempotent.
    process.on("beforeExit", (code) => { exit(code ?? 0, "beforeExit").catch(() => {}); });
    return { exit };
}

// Top-level entry. Exported for tests / smoke runner; the script
// invocation at the bottom of the file calls run() when imported as
// the main module.
export async function run(argv = process.argv) {
    const opts = parseArgs(argv);
    const { enablerRoot, baseDir, proxyEntry, staticDir, isPackaged } = await resolvePaths(opts);
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

    // 0) Inspect any prior lock. Stale (dead pid) is fine - reap on
    //    fresh launch. Live (other launcher running) is also fine for
    //    DX1b - we coexist on different ports. Contract §10 explicitly
    //    says the lock is for crash-recovery and port reuse, NOT
    //    single-instance enforcement.
    const prior = await inspectLock(dataDir);
    if (prior.state === "stale") {
        process.stdout.write(`[launcher] reaping stale lock from pid ${prior.lock.pid}\n`);
        await releaseLock(dataDir).catch(() => {});
    } else if (prior.state === "live") {
        process.stdout.write(`[launcher] another launcher is alive (pid ${prior.lock.pid}, app=${prior.lock.appPort}); starting a parallel session\n`);
    }

    const [appPort, proxyPort] = await findFreePorts(2);
    const launchToken = generateLaunchToken();

    process.stdout.write(`[launcher] picked ports: app=${appPort}  proxy=${proxyPort}\n`);
    await fs.appendFile(runtimeLogPath, `[launcher] ports app=${appPort} proxy=${proxyPort}\n`).catch(() => {});

    // 1) Spawn bundled proxy child.
    const proxyChild = spawnProxyChild(proxyEntry, proxyPort, proxyLogPath, isPackaged);
    const state = { proxyChild, appServer: null, dataDir, watchdog: null };
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

    // 3) Build + listen on the app server. Wire the heartbeat watchdog
    //    so the React app's /runtime/heartbeat pings keep the launcher
    //    alive; absence triggers shutdown after HEARTBEAT_TIMEOUT_MS.
    //    The watchdog starts "warm" - the user has the full timeout to
    //    open the browser and ship the first beat before we time out.
    const watchdog = createWatchdog({
        timeoutMs: HEARTBEAT_TIMEOUT_MS,
        onTimeout: () => {
            process.stdout.write("[launcher] no heartbeat for HEARTBEAT_TIMEOUT_MS; assuming session ended\n");
            shutdown.exit(0, "heartbeat-timeout");
        },
    });
    state.watchdog = watchdog;

    const { app } = await createAppServer({
        dataDir,
        staticDir,
        proxyPort,
        launchToken,
        version,
        onHeartbeat: () => watchdog.kick(),
        onQuit: () => shutdown.exit(0, "runtime-quit"),
    });
    const appServer = http.createServer(app);
    state.appServer = appServer;
    await new Promise((resolve, reject) => {
        appServer.once("error", reject);
        appServer.listen(appPort, "127.0.0.1", resolve);
    });
    process.stdout.write(`[launcher] app server ready on http://127.0.0.1:${appPort}\n`);

    // 3b) Write the per-session lock file now that BOTH ports are bound.
    //     If anything above failed we never wrote it - the launcher
    //     bails early via ensureProxyEntryOrFail / ensureStaticDirOrFail
    //     / waitForProxyReady before this point.
    try {
        await writeLock(dataDir, { pid: process.pid, appPort, proxyPort });
    } catch (err) {
        process.stderr.write(`[launcher] could not write lock file: ${err.message}\n`);
        // Non-fatal; lock is informational. Continue.
    }

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
        return argvPath === __filename || isPackagedRuntime();
    } catch {
        return false;
    }
})();

if (invokedDirectly) {
    const opts = parseArgs(process.argv);
    const entryPromise = opts.proxyChild
        ? Promise.resolve(runProxyChildFromEnv())
        : run(process.argv);
    entryPromise.catch(async (err) => {
        const msg = err && err.stack ? err.stack : String(err);
        process.stderr.write(`[launcher] fatal: ${msg}\n`);
        // Best-effort error trace into PulsePlayData/runtime/last-error.txt
        // so the operator can recover the message after the console window
        // closes. The base directory is the enabler root in dev mode;
        // packaged mode is dirname(process.execPath) (slice 6).
        try {
            const { enablerRoot, baseDir } = await resolvePaths(opts);
            await writeLastError(baseDir || enablerRoot, msg);
        } catch { /* swallow */ }
        process.exit(1);
    });
}

export const __forTests = {
    parseArgs,
    isPackagedRuntime,
    generateLaunchToken,
    resolvePaths,
    buildProxyChildSpawnPlan,
    readLauncherVersion,
    waitForProxyReady,
};
