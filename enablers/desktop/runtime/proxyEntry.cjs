// enablers/desktop/runtime/proxyEntry.cjs
//
// Tiny wrapper around proxy/server.js used by the desktop launcher.
//
// Why this exists. proxy/server.js's built-in startup banner branches
// on `runAsDatabricksApp = Boolean(env.PORT || env.DATABRICKS_APP_PORT)`
// to bind 0.0.0.0 vs 127.0.0.1. Setting PORT to our random ephemeral
// port would flip the proxy into Databricks-Apps mode and bind
// 0.0.0.0 - exactly the behavior the desktop contract §11 forbids.
//
// This wrapper imports the proxy's express `app` (server.js exports
// it but only runs the built-in start logic under
// `require.main === module`, which is false when we import) and binds
// a fresh http server to 127.0.0.1:PULSEPLAY_DESKTOP_PROXY_PORT.
//
// CommonJS on purpose: proxy/server.js is CommonJS (it uses
// require.main / module.exports).

const path = require("node:path");
const http = require("node:http");

const port = Number(process.env.PULSEPLAY_DESKTOP_PROXY_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("[proxy-wrap] PULSEPLAY_DESKTOP_PROXY_PORT must be a valid TCP port; got", process.env.PULSEPLAY_DESKTOP_PROXY_PORT);
    process.exit(1);
}

// Resolve the proxy entry. In dev mode it sits at <repoRoot>/proxy/server.js.
// In packaged mode slice 6 will pin this via PULSEPLAY_DESKTOP_PROXY_ENTRY env.
const proxyEntry = process.env.PULSEPLAY_DESKTOP_PROXY_ENTRY
    || path.resolve(__dirname, "..", "..", "..", "proxy", "server.js");

let mod;
try {
    mod = require(proxyEntry);
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
    console.log(`[proxy-wrap] bound 127.0.0.1:${port} (desktop wrapper, no Databricks-Apps mode)`);
});

// Honor SIGTERM/SIGINT so the launcher's shutdown sequence reaches us.
function shutdown(signal) {
    console.log(`[proxy-wrap] ${signal} received, closing...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGHUP", () => shutdown("SIGHUP"));
