// enablers/desktop/runtime/browserLaunch.mjs
//
// Browser-launch preference matrix from docs/DX1_LAUNCHER_CONTRACT.md
// §6. Order: Chrome incognito -> Edge InPrivate -> Firefox private ->
// Brave incognito -> default browser (with a contract-mandated warning).
//
// Pure logic so tests can mock the spawn step. The launcher calls
// `tryLaunchPrivateBrowser(url)` which walks the preference list,
// returns { browser, pid, warningDefaultBrowser? } on first success or
// throws if every attempt failed.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Each entry: { id, displayName, detect(platform, env): string|null,
//               command(detectedExe, url, platform): { cmd, args, shell? },
//               privateMode: boolean }
//
// detect() returns the path to the browser binary if found, or null.
// command() builds the spawn call for that platform.

function envProgramFiles(env, key) {
    const v = env[key];
    return typeof v === "string" && v.length > 0 ? v : null;
}

function existsAny(paths) {
    for (const p of paths) {
        if (p && existsSync(p)) return p;
    }
    return null;
}

const WINDOWS_PROGRAM_FILES_VARS = ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"];

function joinAll(prefixes, suffix) {
    const out = [];
    for (const p of prefixes) {
        if (p) out.push(path.join(p, suffix));
    }
    return out;
}

export const BROWSER_MATRIX = [
    {
        id: "chrome",
        displayName: "Google Chrome",
        privateFlag: "--incognito",
        detect(platform, env) {
            if (platform === "win32") {
                const prefixes = WINDOWS_PROGRAM_FILES_VARS.map((k) => envProgramFiles(env, k));
                return existsAny([
                    ...joinAll(prefixes, "Google\\Chrome\\Application\\chrome.exe"),
                    ...joinAll(prefixes.map((p) => p && path.join(p, "Google\\Chrome SxS\\Application")), "chrome.exe"),
                ]);
            }
            if (platform === "darwin") {
                return existsAny([
                    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                    path.join(env.HOME || "", "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
                ]);
            }
            // linux
            return existsAny(["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/snap/bin/google-chrome"]);
        },
        command(exe, url) {
            return { cmd: exe, args: ["--incognito", "--new-window", url] };
        },
    },
    {
        id: "edge",
        displayName: "Microsoft Edge",
        privateFlag: "--inprivate",
        detect(platform, env) {
            if (platform === "win32") {
                const prefixes = WINDOWS_PROGRAM_FILES_VARS.map((k) => envProgramFiles(env, k));
                return existsAny(joinAll(prefixes, "Microsoft\\Edge\\Application\\msedge.exe"));
            }
            if (platform === "darwin") {
                return existsAny(["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]);
            }
            return existsAny(["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable"]);
        },
        command(exe, url) {
            return { cmd: exe, args: ["--inprivate", "--new-window", url] };
        },
    },
    {
        id: "firefox",
        displayName: "Firefox",
        privateFlag: "-private-window",
        detect(platform, env) {
            if (platform === "win32") {
                const prefixes = WINDOWS_PROGRAM_FILES_VARS.map((k) => envProgramFiles(env, k));
                return existsAny(joinAll(prefixes, "Mozilla Firefox\\firefox.exe"));
            }
            if (platform === "darwin") {
                return existsAny(["/Applications/Firefox.app/Contents/MacOS/firefox"]);
            }
            return existsAny(["/usr/bin/firefox", "/snap/bin/firefox"]);
        },
        command(exe, url) {
            return { cmd: exe, args: ["-private-window", url] };
        },
    },
    {
        id: "brave",
        displayName: "Brave",
        privateFlag: "--incognito",
        detect(platform, env) {
            if (platform === "win32") {
                const prefixes = WINDOWS_PROGRAM_FILES_VARS.map((k) => envProgramFiles(env, k));
                return existsAny(joinAll(prefixes, "BraveSoftware\\Brave-Browser\\Application\\brave.exe"));
            }
            if (platform === "darwin") {
                return existsAny(["/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"]);
            }
            return existsAny(["/usr/bin/brave-browser", "/snap/bin/brave"]);
        },
        command(exe, url) {
            return { cmd: exe, args: ["--incognito", "--new-window", url] };
        },
    },
];

// "Default browser" entry is special: detection always succeeds; the
// command is the OS-level "open this URL with whatever the user picked".
// Contract requires the launcher to emit a warning when this entry wins.
export const DEFAULT_BROWSER_ENTRY = {
    id: "default",
    displayName: "default browser",
    privateFlag: null,
    detect: () => "default",
    command(_exe, url, platform) {
        if (platform === "win32") return { cmd: "cmd", args: ["/c", "start", "", url], shell: false };
        if (platform === "darwin") return { cmd: "open", args: [url] };
        return { cmd: "xdg-open", args: [url] };
    },
};

/**
 * Walk BROWSER_MATRIX in order, returning the first browser whose
 * detect() returns a path. Returns null when none of the private
 * browsers are installed; the launcher should then fall back to
 * DEFAULT_BROWSER_ENTRY and emit the contract-mandated warning.
 */
export function pickPrivateBrowser(platform = process.platform, env = process.env) {
    for (const entry of BROWSER_MATRIX) {
        const detected = entry.detect(platform, env);
        if (detected) return { entry, detected };
    }
    return null;
}

/**
 * Spawn the chosen browser. Returns a Promise that resolves with the
 * child PID on successful spawn, or rejects if spawn fails. Does NOT
 * wait for the browser to exit - the launcher's lifecycle is governed
 * by the heartbeat, not by the browser process.
 */
export function spawnBrowser(entry, detected, url, platform = process.platform) {
    const { cmd, args, shell } = entry.command(detected, url, platform);
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            detached: true,
            stdio: "ignore",
            shell: shell === true,
        });
        let settled = false;
        const settleResolve = (pid) => {
            if (!settled) { settled = true; resolve(pid); }
        };
        const settleReject = (err) => {
            if (!settled) { settled = true; reject(err); }
        };
        child.on("error", settleReject);
        child.on("spawn", () => {
            child.unref();
            settleResolve(child.pid);
        });
        // Defensive timeout: if neither 'spawn' nor 'error' fires inside
        // 2s, assume spawn-ish failure. Most child processes settle within
        // tens of ms.
        setTimeout(() => settleReject(new Error(`spawnBrowser: ${cmd} did not signal spawn within 2s`)), 2000).unref();
    });
}

/**
 * Top-level launch helper used by launcher.mjs. Returns:
 *   { browser: 'chrome'|'edge'|'firefox'|'brave', pid }   on private-mode success
 *   { browser: 'default', pid, warningDefaultBrowser: true } on default-browser fallback
 *
 * Throws if every option failed - the launcher then writes
 * runtime/last-error.txt and exits.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {(line: string) => void} [opts.audit]  emits one line per attempt
 * @param {string} [opts.platform]  override (tests)
 * @param {NodeJS.ProcessEnv} [opts.env]  override (tests)
 * @returns {Promise<{browser:string, pid:number, warningDefaultBrowser?:boolean}>}
 */
export async function tryLaunchPrivateBrowser(url, opts = {}) {
    const platform = opts.platform || process.platform;
    const env = opts.env || process.env;
    const audit = typeof opts.audit === "function" ? opts.audit : () => {};

    for (const entry of BROWSER_MATRIX) {
        const detected = entry.detect(platform, env);
        if (!detected) {
            audit(`[launch] tried=${entry.id}  outcome=not-found`);
            continue;
        }
        try {
            const pid = await spawnBrowser(entry, detected, url, platform);
            audit(`[launch] tried=${entry.id}  outcome=spawned  pid=${pid}`);
            return { browser: entry.id, pid };
        } catch (err) {
            audit(`[launch] tried=${entry.id}  outcome=spawn-failed  reason=${err && err.message ? err.message : err}`);
        }
    }

    // Default browser fallback - contract mandates a clear warning.
    try {
        const pid = await spawnBrowser(DEFAULT_BROWSER_ENTRY, "default", url, platform);
        audit("[launch] tried=default  outcome=spawned  WARNING=private-mode-not-guaranteed");
        return { browser: "default", pid, warningDefaultBrowser: true };
    } catch (err) {
        audit(`[launch] tried=default  outcome=spawn-failed  reason=${err && err.message ? err.message : err}`);
        throw new Error("tryLaunchPrivateBrowser: no browser could be launched (private or default).");
    }
}

export const __forTests = {
    BROWSER_MATRIX,
    DEFAULT_BROWSER_ENTRY,
    joinAll,
    existsAny,
    envProgramFiles,
    osDetect: () => os.platform(),
};
