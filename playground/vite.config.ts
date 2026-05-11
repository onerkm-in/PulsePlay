import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// PulsePlay playground — Vite config.
// `/api/*` is proxied to the local PulsePlay AI proxy (same architecture as
// the inherited proxy). The playground frontend never embeds Databricks/
// Azure/AWS credentials — all upstream calls go through this dev-proxy
// line in dev, and through a deployed proxy URL in production (configured
// via VITE_API_BASE_URL env var).
export default defineConfig({
    plugins: [react()],
    // The Power BI adapter at ../bi-adapters/powerbi/index.ts imports
    // "powerbi-client". Resolution from outside playground/ doesn't walk
    // up to playground/node_modules by default — this alias makes Rollup
    // (production build) and Vite dev server both find it. The vitest
    // config mirrors this alias for tests. See tsconfig.json `paths` for
    // the matching tsc-side mapping. Vite resolves the relative path
    // against the project root (the directory containing this config).
    // Absolute paths required — Vite dev's import-analysis doesn't follow
    // relative-string aliases the way Rollup's build-time resolver does.
    // (The previous relative-string form built cleanly but threw
    // "Failed to resolve import" in the dev server's transform step.)
    resolve: {
        alias: {
            "powerbi-client": path.resolve(__dirname, "node_modules/powerbi-client"),
            // Cycle D — Pulse port stubs. The ported visual.tsx and helpers
            // `import powerbi from "powerbi-visuals-api"` and pull formatting
            // controls from "powerbi-visuals-utils-formattingmodel". These
            // aliases route both to our lightweight stubs so the bundle
            // doesn't need the real PBI SDK at runtime. tsconfig.json `paths`
            // mirrors these for tsc.
            "powerbi-visuals-api": path.resolve(__dirname, "src/pulse/_adapter/powerbi-visuals-api.ts"),
            "powerbi-visuals-utils-formattingmodel": path.resolve(__dirname, "src/pulse/_adapter/powerbi-visuals-utils-formattingmodel.ts"),
        },
    },
    server: {
        port: 5173,
        // Bind IPv4 explicitly. Vite 6's default literal "localhost" host
        // binds whichever address Node's DNS prefers, which on Windows 11 +
        // Node 24 is IPv6 (::1) only — so `http://127.0.0.1:5173` returns
        // ERR_CONNECTION_REFUSED while `http://localhost:5173` works. The
        // org standardised on 127.0.0.1 (see ADR-0002), so we bind IPv4
        // here. localhost-via-IPv6 still works because most browsers retry
        // IPv4 when IPv6 fails.
        host: "127.0.0.1",
        proxy: {
            "/api": {
                target: "http://127.0.0.1:8787",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ""),
            },
        },
        // Allow Vite to read files above playground/ — the bi-adapters/
        // tree is imported via dynamic imports from src/biPanel/registry.ts.
        fs: {
            allow: [".", ".."],
        },
    },
    build: {
        outDir: "dist",
        sourcemap: true,
    },
});
