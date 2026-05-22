// enablers/desktop/runtime/dataStore.mjs
//
// Atomic file I/O for PulsePlayData/. Pure: no express, no http, no
// network. Every write uses the write-tmp-then-rename pattern so a
// launcher crash mid-write cannot leave a half-written state.json on
// disk.
//
// Contract reference: docs/DX1_LAUNCHER_CONTRACT.md §8 (Save Changes
// endpoints), §9 (PulsePlayData/ layout).

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
    DATA_DIRNAME,
    PROFILES_DIRNAME,
    DEFAULT_PROFILE_NAME,
    PROFILE_STATE_FILENAME,
    SECRETS_FILENAME_PLAINTEXT,
} from "./config.mjs";

const ACTIVE_PROFILE_FILENAME = "active-profile.json";

// Profile names: lowercase letters / digits / hyphen / underscore, 1-64
// chars. Anything else is rejected by createProfile / setActiveProfile /
// deleteProfile so a hostile or buggy caller cannot escape PulsePlayData/
// via "../" segments.
const PROFILE_NAME_RE = /^[a-z0-9_-]{1,64}$/;

function assertProfileName(name) {
    if (typeof name !== "string" || !PROFILE_NAME_RE.test(name)) {
        throw new Error(`invalid profile name: ${JSON.stringify(name)}`);
    }
}

// Resolve PulsePlayData/ alongside whatever the launcher passed in. The
// launcher decides the base path (process.execPath dir in packaged mode,
// repo root in dev). dataStore.mjs never reads process.execPath itself.
function dataDirPath(baseDir) {
    if (typeof baseDir !== "string" || baseDir.length === 0) {
        throw new Error("dataStore: baseDir must be a non-empty string");
    }
    if (path.basename(baseDir) === DATA_DIRNAME) {
        // Caller already pointed at PulsePlayData/.
        return baseDir;
    }
    return path.join(baseDir, DATA_DIRNAME);
}

function profileDir(baseDir, name) {
    assertProfileName(name);
    return path.join(dataDirPath(baseDir), PROFILES_DIRNAME, name);
}

function profileStateFile(baseDir, name) {
    return path.join(profileDir(baseDir, name), PROFILE_STATE_FILENAME);
}

function activeProfileFile(baseDir) {
    return path.join(dataDirPath(baseDir), ACTIVE_PROFILE_FILENAME);
}

function secretsFile(baseDir) {
    return path.join(dataDirPath(baseDir), SECRETS_FILENAME_PLAINTEXT);
}

async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
}

// Atomic write: write to <path>.tmp.<rand> then rename over <path>.
// rename() is atomic on a single filesystem, so readers either see the
// previous contents or the new contents, never a half-written file.
async function atomicWriteJson(filePath, value) {
    const dir = path.dirname(filePath);
    await ensureDir(dir);
    const tmp = `${filePath}.tmp.${crypto.randomBytes(6).toString("hex")}`;
    const body = JSON.stringify(value, null, 2);
    await fs.writeFile(tmp, body, { encoding: "utf8" });
    try {
        await fs.rename(tmp, filePath);
    } catch (err) {
        // Best-effort cleanup; the rename failure is the real error.
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

export async function ensureDataDir(baseDir) {
    const dir = dataDirPath(baseDir);
    await ensureDir(dir);
    await ensureDir(path.join(dir, PROFILES_DIRNAME));
    await ensureDir(path.join(dir, "logs"));
    await ensureDir(path.join(dir, "runtime"));
    return dir;
}

export async function ensureDefaultProfile(baseDir) {
    const dir = profileDir(baseDir, DEFAULT_PROFILE_NAME);
    await ensureDir(dir);
    await ensureDir(path.join(dir, "packs"));
    await ensureDir(path.join(dir, "cache"));
    const stateFile = profileStateFile(baseDir, DEFAULT_PROFILE_NAME);
    try {
        await fs.access(stateFile);
    } catch {
        await atomicWriteJson(stateFile, {});
    }
    return DEFAULT_PROFILE_NAME;
}

export async function readState(baseDir, profileName) {
    assertProfileName(profileName);
    return readJsonOr(profileStateFile(baseDir, profileName), {});
}

// Patch shape: { scope: 'settings'|'layout'|'wizard'|'desktop', patch: <object> }
// Applied as a shallow merge under state[scope]. Returns the merged state.
const ALLOWED_SCOPES = new Set(["settings", "layout", "wizard", "desktop"]);

export async function writeState(baseDir, profileName, patchEnvelope) {
    assertProfileName(profileName);
    if (!patchEnvelope || typeof patchEnvelope !== "object") {
        throw new Error("writeState: patch envelope required");
    }
    const { scope, patch } = patchEnvelope;
    if (!ALLOWED_SCOPES.has(scope)) {
        throw new Error(`writeState: unsupported scope ${JSON.stringify(scope)}`);
    }
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        throw new Error("writeState: patch must be a plain object");
    }
    const current = await readState(baseDir, profileName);
    const next = {
        ...current,
        [scope]: { ...(current[scope] && typeof current[scope] === "object" ? current[scope] : {}), ...patch },
    };
    await atomicWriteJson(profileStateFile(baseDir, profileName), next);
    return next;
}

export async function listProfiles(baseDir) {
    const profilesDir = path.join(dataDirPath(baseDir), PROFILES_DIRNAME);
    try {
        const entries = await fs.readdir(profilesDir, { withFileTypes: true });
        return entries
            .filter((e) => e.isDirectory() && PROFILE_NAME_RE.test(e.name))
            .map((e) => e.name)
            .sort();
    } catch (err) {
        if (err && err.code === "ENOENT") return [];
        throw err;
    }
}

export async function getActiveProfile(baseDir) {
    const v = await readJsonOr(activeProfileFile(baseDir), null);
    if (v && typeof v === "object" && typeof v.name === "string" && PROFILE_NAME_RE.test(v.name)) {
        return v.name;
    }
    return DEFAULT_PROFILE_NAME;
}

export async function setActiveProfile(baseDir, name) {
    assertProfileName(name);
    const profiles = await listProfiles(baseDir);
    if (!profiles.includes(name)) {
        throw new Error(`setActiveProfile: ${name} does not exist`);
    }
    await atomicWriteJson(activeProfileFile(baseDir), { name });
    return name;
}

export async function createProfile(baseDir, name, copyFrom) {
    assertProfileName(name);
    const existing = await listProfiles(baseDir);
    if (existing.includes(name)) {
        throw new Error(`createProfile: ${name} already exists`);
    }
    // Validate copyFrom BEFORE touching the filesystem so a failed copy
    // doesn't leave an orphan directory.
    let initialState = {};
    if (typeof copyFrom === "string" && copyFrom.length > 0) {
        assertProfileName(copyFrom);
        if (!existing.includes(copyFrom)) {
            throw new Error(`createProfile: copyFrom ${copyFrom} does not exist`);
        }
        initialState = await readState(baseDir, copyFrom);
    }
    const target = profileDir(baseDir, name);
    await ensureDir(target);
    await ensureDir(path.join(target, "packs"));
    await ensureDir(path.join(target, "cache"));
    await atomicWriteJson(profileStateFile(baseDir, name), initialState);
    return name;
}

export async function deleteProfile(baseDir, name) {
    assertProfileName(name);
    if (name === DEFAULT_PROFILE_NAME) {
        throw new Error("deleteProfile: cannot delete the default profile");
    }
    const target = profileDir(baseDir, name);
    await fs.rm(target, { recursive: true, force: true });
    // If the deleted profile was active, fall back to default.
    const active = await getActiveProfile(baseDir);
    if (active === name) {
        await atomicWriteJson(activeProfileFile(baseDir), { name: DEFAULT_PROFILE_NAME });
    }
}

// Secrets - DX1b: plaintext JSON. DX2 replaces with secrets.enc.
// readSecrets returns an object; writeSecret patches by key.
export async function readSecrets(baseDir) {
    return readJsonOr(secretsFile(baseDir), {});
}

export async function writeSecret(baseDir, key, value) {
    if (typeof key !== "string" || key.length === 0 || key.length > 256) {
        throw new Error("writeSecret: key must be a non-empty string <=256 chars");
    }
    if (value !== null && typeof value !== "string") {
        throw new Error("writeSecret: value must be a string or null (to clear)");
    }
    const current = await readSecrets(baseDir);
    const next = { ...current };
    if (value === null) delete next[key];
    else next[key] = value;
    await atomicWriteJson(secretsFile(baseDir), next);
    return next;
}

// Logs - tail-style reader for /runtime/logs/recent. Returns a string
// with at most maxBytes from the END of the file. If the file does not
// exist, returns ''. Caller can split on \n to get lines.
export async function readLogTail(baseDir, filename, maxBytes = 64 * 1024) {
    const target = path.join(dataDirPath(baseDir), filename);
    try {
        const stat = await fs.stat(target);
        if (stat.size <= maxBytes) {
            return fs.readFile(target, { encoding: "utf8" });
        }
        const fh = await fs.open(target, "r");
        try {
            const buf = Buffer.alloc(maxBytes);
            await fh.read(buf, 0, maxBytes, stat.size - maxBytes);
            return buf.toString("utf8");
        } finally {
            await fh.close();
        }
    } catch (err) {
        if (err && err.code === "ENOENT") return "";
        throw err;
    }
}

// Exposed for tests so we don't reach into internals from test code.
export const __internals = {
    PROFILE_NAME_RE,
    dataDirPath,
    profileDir,
    profileStateFile,
    activeProfileFile,
    secretsFile,
    atomicWriteJson,
    readJsonOr,
};
