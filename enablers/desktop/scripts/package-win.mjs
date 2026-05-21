#!/usr/bin/env node
// enablers/desktop/scripts/package-win.mjs
//
// DX1c packaging driver. Produces:
//   out/launcher.cjs       esbuild CJS bundle for @yao-pkg/pkg
//   out/PulsePlay.exe      packaged launcher executable
//   out/install/           smokeable install folder (EXE + sidecar assets)
//
// The sidecar proxy folder intentionally keeps proxy/server.js unchanged.
// See PACKAGING.md for the current honest non-claim: DX1c proves a packaged
// EXE plus install folder, not a single self-contained binary.

import { spawn } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const enablerRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(enablerRoot, "..", "..");
const outRoot = path.join(enablerRoot, "out");
const snapshotRoot = path.join(outRoot, "snapshot");
const installRoot = path.join(outRoot, "install");

const launcherBundle = path.join(outRoot, "launcher.cjs");
const exePath = path.join(outRoot, "PulsePlay.exe");

function log(message) {
    process.stdout.write(`[package-win] ${message}\n`);
}

function assertInsideEnabler(target) {
    const resolved = path.resolve(target);
    const allowed = `${path.resolve(enablerRoot)}${path.sep}`;
    if (resolved !== path.resolve(outRoot) && !resolved.startsWith(allowed)) {
        throw new Error(`refusing to modify path outside desktop enabler: ${resolved}`);
    }
}

async function exists(p) {
    try { await fs.access(p); return true; } catch { return false; }
}

async function findTool(name, envVar) {
    const envPath = process.env[envVar];
    if (envPath && await exists(envPath)) return envPath;

    const local = path.join(enablerRoot, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
    if (await exists(local)) return local;

    const fromPath = await findOnPath(name);
    if (fromPath) return fromPath;

    const fromNpxCache = await findInNpxCache(name);
    if (fromNpxCache) return fromNpxCache;

    throw new Error(
        `could not find ${name}. Install build deps with npm install --save-dev @yao-pkg/pkg esbuild ` +
        `or set ${envVar} to the ${name} executable.`,
    );
}

async function findOnPath(name) {
    const cmd = process.platform === "win32" ? "where.exe" : "which";
    const result = await runCapture(cmd, [name], { allowFailure: true });
    if (result.code !== 0) return null;
    const first = result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    return first || null;
}

async function findInNpxCache(name) {
    const cacheRoot = process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "npm-cache", "_npx")
        : null;
    if (!cacheRoot || !await exists(cacheRoot)) return null;

    const candidates = [];
    async function walk(dir, depth = 0) {
        if (depth > 5) return;
        let entries = [];
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(full, depth + 1);
                continue;
            }
            const wanted = process.platform === "win32" ? `${name}.cmd` : name;
            if (entry.name === wanted && full.includes(`${path.sep}node_modules${path.sep}.bin${path.sep}`)) {
                const stat = await fs.stat(full);
                candidates.push({ full, mtimeMs: stat.mtimeMs });
            }
        }
    }
    await walk(cacheRoot);
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return candidates[0]?.full || null;
}

function run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        log(`${command} ${args.join(" ")}`);
        const child = spawn(command, args, {
            cwd: options.cwd || enablerRoot,
            env: { ...process.env, ...(options.env || {}) },
            stdio: "inherit",
            shell: false,
        });
        child.on("exit", (code, signal) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`${command} exited with code=${code} signal=${signal}`));
        });
        child.on("error", reject);
    });
}

function runCapture(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd || enablerRoot,
            stdio: ["ignore", "pipe", "pipe"],
            shell: false,
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => { stdout += String(chunk); });
        child.stderr.on("data", (chunk) => { stderr += String(chunk); });
        child.on("exit", (code, signal) => {
            if (code === 0 || options.allowFailure) {
                resolve({ code, signal, stdout, stderr });
                return;
            }
            reject(new Error(`${command} exited with code=${code} signal=${signal}\n${stderr}`));
        });
        child.on("error", reject);
    });
}

async function cleanOut() {
    assertInsideEnabler(outRoot);
    await fs.rm(outRoot, { recursive: true, force: true });
    await fs.mkdir(outRoot, { recursive: true });
}

async function copySnapshot() {
    const proxySrc = path.join(repoRoot, "proxy");
    const proxyDest = path.join(snapshotRoot, "proxy");
    const distSrc = path.join(repoRoot, "playground", "dist");
    const distDest = path.join(snapshotRoot, "playground", "dist");

    if (!await exists(path.join(distSrc, "index.html"))) {
        throw new Error(`playground/dist is missing. Run cd playground && npm run build first.`);
    }

    await fs.mkdir(snapshotRoot, { recursive: true });
    await fs.cp(proxySrc, proxyDest, {
        recursive: true,
        filter: (src) => {
            const rel = path.relative(proxySrc, src);
            if (!rel) return true;
            const parts = rel.split(path.sep);
            if (parts.includes("coverage")) return false;
            if (parts.includes(".cache")) return false;
            if (parts.includes(".tmp")) return false;
            if (rel === "config.json") return false;
            if (rel.endsWith(".log")) return false;
            return true;
        },
    });
    await fs.cp(distSrc, distDest, { recursive: true });
}

async function copyInstallFolder() {
    assertInsideEnabler(installRoot);
    await fs.rm(installRoot, { recursive: true, force: true });
    await fs.mkdir(installRoot, { recursive: true });
    await fs.copyFile(exePath, path.join(installRoot, "PulsePlay.exe"));
    await fs.cp(snapshotRoot, installRoot, { recursive: true });
}

async function main() {
    const esbuild = await findTool("esbuild", "PULSEPLAY_ESBUILD_BIN");
    const pkg = await findTool("pkg", "PULSEPLAY_PKG_BIN");

    await cleanOut();
    await copySnapshot();

    await run(esbuild, [
        "runtime/launcher.mjs",
        "--bundle",
        "--platform=node",
        "--target=node20",
        "--format=cjs",
        "--external:express",
        "--external:http-proxy-middleware",
        `--outfile=${launcherBundle}`,
    ]);

    await run(pkg, [
        launcherBundle,
        "--targets", "node20-win-x64",
        "--compress", "GZip",
        "--output", exePath,
    ]);

    await copyInstallFolder();

    log(`created ${exePath}`);
    log(`smokeable install folder: ${installRoot}`);
}

main().catch((err) => {
    process.stderr.write(`[package-win] failed: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
});
