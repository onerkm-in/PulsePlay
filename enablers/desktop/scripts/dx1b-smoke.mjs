#!/usr/bin/env node
// enablers/desktop/scripts/dx1b-smoke.mjs
//
// End-to-end smoke for the DX1b launcher. Boots
// runtime/launcher.mjs --dev --no-browser, waits for the app server
// to come up, then exercises every /runtime/* contract endpoint plus
// the /api/* reverse proxy round-trip. Tears down and asserts the
// lock file is released.
//
// A second invocation (with --check-persistence) re-boots the
// launcher, fetches /runtime/state, and asserts the patch written by
// the first run survived - the contract section 16 acceptance signal.
//
// Exit code 0 on success, 1 on failure. Prints a JSON report.

import { spawn } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const enablerRoot = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const persistenceMode = args.includes("--check-persistence");
const cleanFirst = args.includes("--clean") || !persistenceMode;
const launcherArg = readArgValue("--launcher") || readArgValue("--packaged-binary");

function readArgValue(name) {
    const prefixed = args.find((arg) => arg.startsWith(`${name}=`));
    if (prefixed) return prefixed.slice(name.length + 1);
    const idx = args.indexOf(name);
    return idx >= 0 ? args[idx + 1] : null;
}

function buildLauncherTarget() {
    if (!launcherArg) {
        return {
            mode: "source",
            command: process.execPath,
            args: [path.join(enablerRoot, "runtime", "launcher.mjs"), "--dev", "--no-browser"],
            cwd: enablerRoot,
            dataDir: path.join(enablerRoot, "PulsePlayData"),
        };
    }

    const launcherPath = path.resolve(launcherArg);
    const ext = path.extname(launcherPath).toLowerCase();
    const packaged = ext === ".exe";
    return {
        mode: packaged ? "packaged-binary" : "source-file",
        command: packaged ? launcherPath : process.execPath,
        args: packaged ? ["--no-browser"] : [launcherPath, "--dev", "--no-browser"],
        cwd: path.dirname(launcherPath),
        dataDir: path.join(path.dirname(launcherPath), "PulsePlayData"),
    };
}

const launcherTarget = buildLauncherTarget();
const dataDir = launcherTarget.dataDir;
const lockFile = path.join(dataDir, "runtime", "lock.json");

const report = {
    mode: persistenceMode ? "persistence-check" : "full",
    launcherMode: launcherTarget.mode,
    launcherCommand: launcherTarget.command,
    startedAt: new Date().toISOString(),
    steps: [],
    failures: [],
};

function step(name, ok, detail) {
    report.steps.push({ name, ok, detail });
    if (!ok) report.failures.push({ name, detail });
    const tag = ok ? "PASS" : "FAIL";
    process.stdout.write(`[smoke] ${tag} ${name}${detail ? ` :: ${detail}` : ""}\n`);
}

function bootLauncher() {
    return new Promise((resolve, reject) => {
        const child = spawn(launcherTarget.command, launcherTarget.args, {
            cwd: launcherTarget.cwd,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdoutBuf = "";
        let resolved = false;
        const onLine = (chunk) => {
            stdoutBuf += String(chunk);
            const lines = stdoutBuf.split(/\r?\n/);
            stdoutBuf = lines.pop() || "";
            for (const line of lines) {
                process.stdout.write(`  > ${line}\n`);
                if (!resolved && line.includes("--no-browser set")) {
                    const tokenMatch = line.match(/token=([A-Za-z0-9_-]+)/);
                    const portMatch = line.match(/127\.0\.0\.1:(\d+)/);
                    if (tokenMatch && portMatch) {
                        resolved = true;
                        resolve({ child, token: tokenMatch[1], appPort: Number(portMatch[1]) });
                    }
                }
            }
        };
        child.stdout.on("data", onLine);
        child.stderr.on("data", (chunk) => {
            const lines = String(chunk).split(/\r?\n/);
            for (const line of lines) if (line) process.stdout.write(`  ! ${line}\n`);
        });
        child.on("exit", (code, sig) => {
            if (!resolved) {
                reject(new Error(`launcher exited before readiness (code=${code} signal=${sig})`));
            }
        });
        // Failsafe in case the launcher hangs.
        setTimeout(() => {
            if (!resolved) {
                child.kill("SIGTERM");
                reject(new Error("launcher did not become ready within 30s"));
            }
        }, 30_000).unref();
    });
}

function waitForExit(child) {
    return new Promise((resolve) => {
        if (child.exitCode !== null) { resolve({ code: child.exitCode, signal: null }); return; }
        child.on("exit", (code, signal) => resolve({ code, signal }));
    });
}

async function withTimeout(promise, ms, label) {
    let timer;
    const result = await Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms); }),
    ]);
    if (timer) clearTimeout(timer);
    return result;
}

async function fetchJson(url, init) {
    const res = await fetch(url, init);
    let body = null;
    const text = await res.text();
    try { body = text.length > 0 ? JSON.parse(text) : null; } catch { body = text; }
    return { status: res.status, ok: res.ok, body };
}

async function runFullSmoke() {
    if (cleanFirst) {
        await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
    }

    const { child, token, appPort } = await bootLauncher();
    const base = `http://127.0.0.1:${appPort}`;
    const headers = { "X-PulsePlay-Launch-Token": token, "content-type": "application/json" };

    try {
        // S1 - /runtime/version unauthenticated
        const v = await fetchJson(`${base}/runtime/version`);
        step("S1 /runtime/version", v.status === 200 && v.body?.client === "pulseplay-desktop", JSON.stringify(v.body));

        // S2 - /runtime/state without token rejected
        const noTok = await fetchJson(`${base}/runtime/state`);
        step("S2 /runtime/state without token rejected", noTok.status === 401, `status=${noTok.status}`);

        // S3 - /runtime/state with token
        const state = await fetchJson(`${base}/runtime/state`, { headers });
        step("S3 /runtime/state with token", state.status === 200 && state.body?.profile === "default", JSON.stringify(state.body));

        // S4 - /api/health proxied to the bundled proxy
        const apiHealth = await fetchJson(`${base}/api/health`);
        step("S4 /api/health proxy hop", apiHealth.status === 200 && apiHealth.body?.ok === true, `client=${apiHealth.body?.client}`);

        // S5 - PUT /runtime/state with a smoke-test patch
        const patch = { scope: "settings", patch: { localStorage: { "pulseplay:dx1b-smoke": String(Date.now()) } } };
        const put = await fetchJson(`${base}/runtime/state`, { method: "PUT", headers, body: JSON.stringify(patch) });
        step("S5 PUT /runtime/state", put.status === 200, JSON.stringify(put.body));

        // S6 - GET /runtime/state again, confirm patch landed
        const stateAfter = await fetchJson(`${base}/runtime/state`, { headers });
        const persistedValue = stateAfter.body?.state?.settings?.localStorage?.["pulseplay:dx1b-smoke"];
        step("S6 patch round-trips via GET", typeof persistedValue === "string" && persistedValue.length > 0, `value=${persistedValue}`);

        // S7 - Lock file is present and matches the launcher pid
        const lockBody = JSON.parse(await fs.readFile(lockFile, { encoding: "utf8" }));
        step("S7 lock.json present", Number.isInteger(lockBody?.pid) && lockBody.appPort === appPort, JSON.stringify(lockBody));

        // S8 - POST /runtime/heartbeat returns 204
        const hb = await fetchJson(`${base}/runtime/heartbeat`, { method: "POST", headers });
        step("S8 /runtime/heartbeat 204", hb.status === 204, `status=${hb.status}`);

        // S9 - POST /runtime/quit, wait for launcher to exit
        const quit = await fetchJson(`${base}/runtime/quit`, { method: "POST", headers });
        step("S9 /runtime/quit accepted", quit.status === 202 && quit.body?.status === "quitting", JSON.stringify(quit.body));

        const exit = await withTimeout(waitForExit(child), 10_000, "launcher exit");
        step("S10 launcher exited cleanly", (exit.code === 0 || exit.signal === "SIGTERM"), `code=${exit.code} signal=${exit.signal}`);

        // S11 - Lock file released
        let lockAfter = "absent";
        try { await fs.access(lockFile); lockAfter = "still-present"; } catch { lockAfter = "absent"; }
        step("S11 lock.json released after quit", lockAfter === "absent", `state=${lockAfter}`);
    } finally {
        if (child.exitCode === null) {
            try { child.kill("SIGTERM"); } catch {}
            await new Promise((r) => setTimeout(r, 1_500));
            if (child.exitCode === null) { try { child.kill("SIGKILL"); } catch {} }
        }
    }

    // Persistence assertion lives in S13 of the --check-persistence run.
    return report.failures.length === 0;
}

async function runPersistenceCheck() {
    // Do NOT clean - we want the previous run's state to be present.
    if (!await exists(path.dirname(lockFile)) && !await exists(path.join(dataDir, "profiles", "default", "state.json"))) {
        step("P0 prior state exists", false, "no state.json found from prior run - cannot test persistence");
        return false;
    }

    const { child, token, appPort } = await bootLauncher();
    const base = `http://127.0.0.1:${appPort}`;
    const headers = { "X-PulsePlay-Launch-Token": token };

    try {
        const state = await fetchJson(`${base}/runtime/state`, { headers });
        const persistedValue = state.body?.state?.settings?.localStorage?.["pulseplay:dx1b-smoke"];
        step("P1 prior patch survived relaunch", typeof persistedValue === "string" && persistedValue.length > 0, `value=${persistedValue}`);
        await fetchJson(`${base}/runtime/quit`, { method: "POST", headers });
        await withTimeout(waitForExit(child), 10_000, "launcher exit");
    } finally {
        if (child.exitCode === null) {
            try { child.kill("SIGTERM"); } catch {}
        }
    }
    return report.failures.length === 0;
}

async function exists(p) {
    try { await fs.access(p); return true; } catch { return false; }
}

(async () => {
    let ok = false;
    try {
        ok = persistenceMode ? await runPersistenceCheck() : await runFullSmoke();
    } catch (err) {
        step("SMOKE crashed", false, err && err.message ? err.message : String(err));
        ok = false;
    }
    report.completedAt = new Date().toISOString();
    report.ok = ok;
    process.stdout.write(`\n${JSON.stringify(report, null, 2)}\n`);
    process.exit(ok ? 0 : 1);
})();
