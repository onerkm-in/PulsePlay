import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import {
    bootstrapDesktopMode,
    ingestLaunchFragmentIfPresent,
    startDesktopRuntime,
} from "./lib/desktopRuntimeClient";
import { initThemeSync } from "./lib/themeSync";
import { initChartPalette } from "./lib/chartPalettes";
import "./styles.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("PulsePlay: missing #root element in index.html");

// DX1b — desktop launcher bootstrap. In browser mode every call is a
// no-op: there's no launch token in sessionStorage so the client
// short-circuits. In EXE mode we:
//
//   1) ingest a #token=... fragment if the user reached / directly (the
//      app server's /launch shim normally handles this server-side, but
//      a direct bookmark to / would otherwise miss it)
//   2) await bootstrapDesktopMode() to fetch /runtime/state and write
//      the persisted pulseplay:* localStorage snapshot back BEFORE any
//      Settings store reads from localStorage on import
//   3) render <App />
//   4) start heartbeat + settings-saved subscription
//
// The synchronous render path (no token in sessionStorage) is preserved
// for browser mode - the async wrapper resolves immediately when
// bootstrapDesktopMode returns 0.
(async () => {
    ingestLaunchFragmentIfPresent();
    await bootstrapDesktopMode();
    // Apply the native --pp-* theme from darkMode BEFORE first render so the
    // Settings / shell / v0 surfaces paint dark on load (no light flash),
    // coherent with the Workbench's gn-shell--dark.
    initThemeSync();
    // Apply the persisted chart palette so the first chart paints in the user's
    // chosen colours (vibrant default otherwise).
    initChartPalette();
    createRoot(rootEl).render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
    startDesktopRuntime();
})();
