// enablers/desktop/runtime/lockFile.mjs
//
// PulsePlayData/runtime/lock.json - per-session port pair + pid record.
// Contract §4 and §10 require:
//   - the launcher writes it at startup
//   - clears it on clean exit
//   - on a fresh launch, detects a stale lock and either coexists or reaps
//
// "Coexists or reaps" rule: two simultaneous EXE launches succeed and
// get their own ports (lock isn't a single-instance mutex). The lock
// is purely for crash recovery + future "where did I leave my session"
// reads.

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
    DATA_DIRNAME,
    RUNTIME_LOCK_FILENAME,
    RUNTIME_LAST_ERROR_FILENAME,
} from "./config.mjs";

function lockFilePath(baseDir) {
    const dir = path.basename(baseDir) === DATA_DIRNAME ? baseDir : path.join(baseDir, DATA_DIRNAME);
    return path.join(dir, RUNTIME_LOCK_FILENAME);
}

function lastErrorFilePath(baseDir) {
    const dir = path.basename(baseDir) === DATA_DIRNAME ? baseDir : path.join(baseDir, DATA_DIRNAME);
    return path.join(dir, RUNTIME_LAST_ERROR_FILENAME);
}

async function atomicWriteJson(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp.${crypto.randomBytes(6).toString("hex")}`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), { encoding: "utf8" });
    try {
        await fs.rename(tmp, filePath);
    } catch (err) {
        await fs.unlink(tmp).catch(() => {});
        throw err;
    }
}

async function readJsonOr(filePath, fallback) {
    try {
        const body = await fs.readFile(filePath, { encoding: "utf8" });
        return JSON.parse(body);
    } catch (err) {
        if (err && err.code === "ENOENT") return fallback;
        throw err;
    }
}

/**
 * Returns true if the given pid is currently alive on this OS. Uses
 * the standard `process.kill(pid, 0)` trick: signal 0 is a no-op that
 * still triggers the same EPERM/ESRCH error semantics as a real signal.
 */
export function isPidAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    if (pid === process.pid) return true;
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        // EPERM means the process exists but we can't signal it - still alive.
        if (err && err.code === "EPERM") return true;
        return false;
    }
}

/**
 * Read the current lock (if any). Returns null when no file exists.
 */
export async function readLock(baseDir) {
    return readJsonOr(lockFilePath(baseDir), null);
}

/**
 * Write a fresh lock file. Returns the lock contents.
 *
 * @param {string} baseDir
 * @param {object} payload
 * @param {number} payload.pid
 * @param {number} payload.appPort
 * @param {number} payload.proxyPort
 * @returns {Promise<object>}
 */
export async function writeLock(baseDir, payload) {
    if (!Number.isInteger(payload?.pid)) throw new Error("writeLock: pid required");
    if (!Number.isInteger(payload?.appPort)) throw new Error("writeLock: appPort required");
    if (!Number.isInteger(payload?.proxyPort)) throw new Error("writeLock: proxyPort required");
    const lock = {
        pid: payload.pid,
        appPort: payload.appPort,
        proxyPort: payload.proxyPort,
        startedAt: new Date().toISOString(),
    };
    await atomicWriteJson(lockFilePath(baseDir), lock);
    return lock;
}

/**
 * Best-effort delete of the lock file. Silent on ENOENT.
 */
export async function releaseLock(baseDir) {
    try {
        await fs.unlink(lockFilePath(baseDir));
    } catch (err) {
        if (!(err && err.code === "ENOENT")) throw err;
    }
}

/**
 * Inspect a possibly-stale lock. Returns:
 *   { state: 'absent' }                        no lock file
 *   { state: 'stale', lock }                   pid in lock is no longer alive; safe to reap
 *   { state: 'live',  lock, samePort?: bool }  pid in lock is alive; the new session can
 *                                               coexist (it gets its own ports), so the launcher
 *                                               should write a fresh lock OVER the live one only
 *                                               after confirming the live launcher is fine with
 *                                               it (out of scope for DX1b - we just record).
 */
export async function inspectLock(baseDir) {
    const lock = await readLock(baseDir);
    if (!lock) return { state: "absent" };
    return isPidAlive(lock.pid)
        ? { state: "live", lock }
        : { state: "stale", lock };
}

/**
 * Write a short crash trace to PulsePlayData/runtime/last-error.txt.
 * Best-effort; swallows write errors so an error-during-error-handling
 * doesn't mask the original fault.
 */
export async function writeLastError(baseDir, message) {
    try {
        const target = lastErrorFilePath(baseDir);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(
            target,
            `[${new Date().toISOString()}] ${message}\n`,
            { encoding: "utf8" },
        );
    } catch { /* swallow */ }
}
