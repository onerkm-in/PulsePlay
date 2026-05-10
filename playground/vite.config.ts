import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
    resolve: {
        alias: {
            "powerbi-client": "./node_modules/powerbi-client/dist/powerbi.js",
        },
    },
    server: {
        port: 5173,
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
