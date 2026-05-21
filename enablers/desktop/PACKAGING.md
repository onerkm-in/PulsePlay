# DX1b - Packaging Recipe

> **Status:** recipe locked, actual binary production **deferred to DX1c**. The DX1b smoke runner ([`scripts/dx1b-smoke.mjs`](./scripts/dx1b-smoke.mjs)) exercises every contract endpoint against the **un-packaged** launcher and proves the runtime behaves correctly. Producing a single-file Windows `.exe` is the next step.
>
> Per [`DECISIONS.md`](./DECISIONS.md) §2 the chosen tool is **`@yao-pkg/pkg`** (the maintained successor to the deprecated `vercel/pkg`). The `node --experimental-sea-config` (Single Executable Application) path is the DX1c upgrade target.

---

## Why packaging is not in DX1b

The DX1b commits ship a working launcher that needs `node`, `npm install`, and `playground/dist/` on the host. The contract §16 acceptance signal explicitly wants "Download a single ZIP / installer / `.exe`". Getting there cleanly requires:

1. **ESM → CJS bundle.** The launcher is `.mjs` and `@yao-pkg/pkg` does not yet bundle pure-ESM entry points. The recipe below uses `esbuild` as a single-file bundler step to produce a CJS bundle that pkg can ingest.
2. **Sidecar file resolution.** `proxy/server.js` and `playground/dist/` must travel alongside the EXE or be embedded in the snapshot. Embedded sidecars require relative-path normalization in [`runtime/launcher.mjs`](./runtime/launcher.mjs) `resolvePaths()` to detect packaged mode and route through `process.execPath` instead of the source-relative defaults.
3. **`http-proxy-middleware` bundling.** Some pkg snapshots historically tripped over middleware that does dynamic require()s; needs to be re-validated against `@yao-pkg/pkg`'s 2026 release.

Each of these is its own correctness gate. DX1c is the cycle that does them honestly.

---

## Recipe (the steps DX1c will execute)

### 0. Install build deps

```bash
cd enablers/desktop
npm install --save-dev @yao-pkg/pkg esbuild
```

### 1. Bundle launcher.mjs to a single CJS file

```bash
npx esbuild runtime/launcher.mjs \
    --bundle \
    --platform=node \
    --target=node20 \
    --format=cjs \
    --external:http-proxy-middleware \
    --outfile=out/launcher.cjs
```

External `http-proxy-middleware` so pkg can ship it as a node_module rather than inlining (avoids the dynamic-require trip described above). Adjust externals as needed once the first pkg run surfaces any other dynamic loaders.

### 2. Snapshot the proxy + dist assets

```bash
mkdir -p out/snapshot/proxy out/snapshot/playground
cp -R ../../proxy/* out/snapshot/proxy/
cp -R ../../playground/dist out/snapshot/playground/dist
# Strip the proxy's own node_modules / coverage / logs to keep the
# snapshot small.
rm -rf out/snapshot/proxy/node_modules out/snapshot/proxy/coverage out/snapshot/proxy/*.log
```

### 3. Patch `resolvePaths()` for packaged mode

`runtime/launcher.mjs` currently picks `staticDir = <repoRoot>/playground/dist` and `proxyEntry = <repoRoot>/proxy/server.js`. In packaged mode the binary is the only file on the user's disk; the sidecar files must live beside `process.execPath`. The packaged-mode branch in `resolvePaths()` (currently a placeholder) needs to:

```js
const baseDir = path.dirname(process.execPath);
const proxyEntry = path.join(baseDir, "proxy", "server.js");
const staticDir = path.join(baseDir, "playground", "dist");
```

DX1b leaves the packaged-mode branch as a comment-only placeholder. DX1c implements it and ships an integration test that runs the produced binary against `dx1b-smoke.mjs`.

### 4. Package with `@yao-pkg/pkg`

```bash
npx pkg out/launcher.cjs \
    --targets node20-win-x64 \
    --output PulsePlay.exe
```

### 5. Smoke the packaged binary

```bash
# From a clean folder with the snapshot beside the EXE:
mkdir test-install
cp PulsePlay.exe test-install/
cp -R out/snapshot/* test-install/
cd test-install
./PulsePlay.exe --no-browser &
node ../enablers/desktop/scripts/dx1b-smoke.mjs
```

The smoke runner doesn't need any change to work against a packaged binary - it just spawns whatever's at `runtime/launcher.mjs`. DX1c can add a `--against-packaged-binary` flag if the spawn path needs to differ.

---

## Known unknowns (gates DX1c must close)

1. **Bundle size.** `@yao-pkg/pkg` produces ~60-80 MB binaries for Node 20 targets. Add `--compress GZip` to bring it to ~30 MB. Worth tolerating; the contract accepts that.
2. **Signing.** Unsigned EXEs trigger SmartScreen warnings on Windows. DX1c hardening either ships a code-signing cert or documents the SmartScreen UX so authors aren't surprised.
3. **First-run firewall prompt.** Windows shows a firewall prompt the first time the launcher binds a loopback port. The recon disclaimer should call this out at first launch.
4. **`http-proxy-middleware` DEP0060 noise.** The middleware uses `util._extend` which Node 24 deprecates. Cosmetic, but worth pinning a newer version or filing upstream.

---

## Why not SEA right now

`node --experimental-sea-config` is the Node-native path and feels right for an inner-source tool. It produces smaller binaries (~20 MB) and avoids the pkg toolchain. The blocker is that SEA does not bundle multiple `.js` files - it produces a single Node binary with one embedded JS payload. Our `proxy/server.js` is a separate file by design (it has to be the unchanged shared proxy code). Either:

- ship SEA-built `PulsePlay.exe` PLUS adjacent `proxy/` and `playground/dist/` directories (a folder layout, not a single binary), or
- bundle proxy + launcher into one SEA payload via esbuild first, which couples them and breaks the "byte-for-byte same proxy" rule from ADR-0010

The pragmatic path is `@yao-pkg/pkg` for DX1b → DX1c, with SEA as a candidate later if the toolchain matures.
