import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// PulsePlay playground — Vitest config.
//
// Why a separate file from vite.config.ts: vitest needs jsdom for the
// React + adapter tests, and we want to opt the bi-adapters/ tree into
// the same test run (the adapters live outside the playground/src tree
// because deployers import them à la carte). The TS path resolution is
// the same as Vite, so plain plugin-react is enough.
export default defineConfig({
    plugins: [react()],
    test: {
        environment: "jsdom",
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
