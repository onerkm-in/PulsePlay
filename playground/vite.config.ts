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
        // Push the warning bar up so vendor chunks don't spam the console;
        // we manualChunks below so the WARNING bar isn't a real concern.
        chunkSizeWarningLimit: 1200,
        rollupOptions: {
            output: {
                // PERF — split the monolith into cacheable chunks so the
                // initial paint doesn't ship 900+ KB of Pulse + xlsx +
                // html2canvas + react in one chunk. Browsers fetch chunks
                // in parallel, so smaller-but-many is faster to first paint
                // than one fat bundle. Order matters in the test below —
                // the FIRST match wins, so put more-specific patterns
                // before less-specific ones.
                manualChunks(id: string): string | undefined {
                    if (!id.includes("node_modules")) {
                        // App-side splits — keep the entire pulse/ tree in
                        // its own chunk so the v0-only flow (cycle B/C
                        // components) can render before Pulse is parsed.
                        if (id.includes("/playground/src/pulse/")) return "pulse";
                        return undefined;
                    }
                    // Heavy optional libs — split each into its own chunk
                    // so they only load when first used (export to Excel,
                    // export to PNG).
                    if (id.includes("/xlsx/")) return "xlsx";
                    if (id.includes("/html2canvas/")) return "html2canvas";
                    if (id.includes("/sql-formatter/")) return "sql-formatter";
                    // Vendor BI SDK — only needed when Power BI adapter mounts.
                    if (id.includes("/powerbi-client/")) return "vendor-powerbi";
                    // AAD SSO — only fetched when the user picks the SSO
                    // mode in the Power BI Embed form. Lazy-imported in
                    // src/lib/pbiAuth.ts via dynamic import().
                    if (id.includes("/@azure/msal")) return "vendor-msal";
                    // Resizable panes ship lean; group with react for cache hits.
                    if (id.includes("/react-resizable-panels/") || id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
                        return "vendor-react";
                    }
                    return "vendor";
                },
            },
        },
    },
});
