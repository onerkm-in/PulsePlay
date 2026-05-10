import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// PulsePlay playground — Vite config.
// `/api/*` is proxied to the local PulsePlay AI proxy (same architecture as
// DwD_AI_Assistant_for_PBI's UniBridge AI Proxy). The playground frontend
// never embeds Databricks/Azure/AWS credentials — all upstream calls go
// through this dev-proxy line in dev, and through a deployed proxy URL in
// production (configured via VITE_API_BASE_URL env var).
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            "/api": {
                target: "http://127.0.0.1:8787",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ""),
            },
        },
    },
    build: {
        outDir: "dist",
        sourcemap: true,
    },
});
