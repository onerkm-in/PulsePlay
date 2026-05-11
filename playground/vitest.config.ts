import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// PulsePlay playground — Vitest config.
//
// Why a separate file from vite.config.ts: vitest needs jsdom for the
// React + adapter tests, and we want to opt the bi-adapters/ tree into
// the same test run (the adapters live outside the playground/src tree
// because deployers import them à la carte). The TS path resolution is
// the same as Vite, so plain plugin-react is enough.
export default defineConfig({
    plugins: [react()],
    // Vite's import-analysis resolver doesn't follow tsconfig.json `paths`,
    // so we mirror the powerbi-client mapping here. Without this, the
    // PowerBI adapter test fails to load with
    // "Failed to resolve import 'powerbi-client' from '../bi-adapters/powerbi/index.ts'"
    // because resolution from outside playground/ can't walk up to
    // playground/node_modules/.
    resolve: {
        alias: {
            "powerbi-client": path.resolve(__dirname, "node_modules/powerbi-client"),
            // Cycle D — Pulse port stubs (mirror vite.config.ts aliases).
            "powerbi-visuals-api": path.resolve(__dirname, "src/pulse/_adapter/powerbi-visuals-api.ts"),
            "powerbi-visuals-utils-formattingmodel": path.resolve(__dirname, "src/pulse/_adapter/powerbi-visuals-utils-formattingmodel.ts"),
        },
    },
    // Allow Vite to read files above playground/ — the adapter tests live
    // in ../bi-adapters/<vendor>/__tests__/. Without this, vitest fails
    // to load those test files with "Does the file exist?" because Vite's
    // default fs.allow only covers the workspace root.
    server: {
        fs: {
            allow: [".", ".."],
        },
    },
    test: {
        environment: "jsdom",
        // React 19 requires IS_REACT_ACT_ENVIRONMENT=true before act()
        // works. setupFiles runs once per test worker before the suite.
        setupFiles: ["./vitest.setup.ts"],
        include: [
            "src/**/*.test.ts",
            "src/**/*.test.tsx",
            // Cycle A — adapter tests live alongside their adapter under
            // __tests__/ folders. Pick them up without forcing the
            // adapters to live inside playground/src/.
            "../bi-adapters/**/__tests__/**/*.test.ts",
            "../bi-adapters/**/__tests__/**/*.test.tsx",
        ],
        // Adapters import { models } from "powerbi-client" — let vitest
        // resolve that the same way the playground bundle does.
        deps: {
            optimizer: {
                web: { include: ["powerbi-client"] },
            },
        },
    },
});
