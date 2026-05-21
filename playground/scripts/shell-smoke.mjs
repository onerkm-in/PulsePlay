// playground/scripts/shell-smoke.mjs
//
// Vite-only shell-mount smoke for the PulsePlay React shell.
//
// What this smoke COVERS
// ──────────────────────
//   * The PulsePlay React shell actually mounts in a real Chromium
//     (jsdom doesn't catch lazy-chunk resolve failures or React 19
//     suspense boundary regressions).
//   * The first-run wizard renders on a fresh browser state when the
//     allowlist endpoint is healthy.
//   * The "Skip setup and close" path dismisses the wizard and the
//     shell renders below it.
//   * The pre-dismissed (localStorage-seeded) startup path renders
//     the shell directly without showing the wizard.
//   * F5.1 / G5 telemetry attributes are emitted on the shell root:
//     data-active-surface, data-requested-surface, data-bi-surface-mode,
//     data-runtime-bi-vendor.
//   * No console errors or page errors fire during the mount path
//     (Vite + React devtools chatter filtered out).
//
// What this smoke does NOT cover
// ──────────────────────────────
//   * Proxy round-trip end-to-end. /api/* is intercepted by Playwright
//     route handlers below — the runner returns canned shapes the shell
//     accepts as "healthy allowlist + minimal profile data." A proxy is
//     never actually contacted. The proxy-backed shell smoke (SS2)
//     needs:
//       - a smoke-fixture profile type in proxy/ that emits canned
//         attested AIResultEnvelopes, OR
//       - a NODE_ENV-gated dry-run mode toggled via env var, AND
//       - process orchestration (boot proxy + Vite + run Playwright +
//         clean up).
//     SS2 is a separate cycle and is explicitly NOT in scope here.
//   * Full wizard walkthrough (persona pick -> vendor pick -> connector
//     pick -> embed config -> Done & Ask). The smoke only exercises
//     the Skip path. Walking the full wizard meaningfully requires the
//     proxy round-trip SS2 will set up.
//   * BIPanel adapter mount in a real vendor flow. Native is the
//     auto fallback when no embed config exists, so the shell renders
//     the native render-blocked state. Validating real Power BI /
//     Tableau / Qlik / Looker mount paths is SS2.
//   * AI sidebar conversation flow.
//
// Usage:
//   1. From playground/, in one terminal:
//        npm run dev
//   2. From playground/, in another terminal:
//        node scripts/shell-smoke.mjs
//
//      If Vite picked a non-default port (e.g. 5173 + 5174 already in
//      use), override the base URL via env var:
//        SHELL_SMOKE_URL=http://127.0.0.1:5175/ node scripts/shell-smoke.mjs
//
// Output:
//   * JSON report to stdout with snapshot + failures.
//   * Screenshot to playground/scripts/shell-smoke.png (gitignored).
//   * Exit 0 on PASS; non-zero on any failure.

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE_URL = process.env.SHELL_SMOKE_URL ?? "http://127.0.0.1:5173/";
const TIMEOUT_MS = 30000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_PATH = join(__dirname, "shell-smoke.png");

const NOISE_PATTERNS = [
    /vite/i,
    /react devtools/i,
    /\[HMR\]/i,
    /Download the React DevTools/i,
];

function isNoise(text) {
    return NOISE_PATTERNS.some(rx => rx.test(text));
}

function fail(failures, message) {
    failures.push(message);
}

/**
 * Minimum /api/* mock surface the shell needs to look "healthy" to
 * mount the wizard / shell without hitting the fail-closed allowlist
 * banner. Mocks are intentionally stubs — they do NOT exercise the
 * real proxy contract. Real proxy validation is SS2.
 *
 * Wired up against patterns the App.tsx mount path actually calls:
 *   - /api/assistant/allowlist  (useAllowlist + allowlistFailClosed)
 *   - /api/assistant/profiles   (connector list)
 *   - /api/assistant/knowledge/packs (pack picker fetch)
 *   - /api/assistant/capabilities  (databricks capability registry)
 * Everything else under /api/* gets a permissive 200 fallback so route
 * shape drift in the shell doesn't silently fail the smoke.
 */
async function mockApi(context) {
    // NOTE: Playwright route precedence is last-in-first-out — the most
    // recently added handler wins. So the permissive catch-all goes FIRST,
    // and specific routes go LAST so they shadow it.
    await context.route("**/api/**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({}),
        });
    });
    await context.route("**/api/assistant/allowlist", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                configured: false,
                biProviders: [],
                embedOrigins: {},
                aadTenants: [],
                aiProfiles: [],
                packs: [],
                enforcement: "warn",
                fetchedAt: new Date().toISOString(),
            }),
        });
    });
    await context.route("**/api/assistant/profiles", async (route) => {
        // The proxy returns either { profiles: [...] } or a bare array
        // depending on shape evolution; the playground accepts both.
        // Return the bare-array form here — same as the Setup B1+B2+B3
        // fix shipped on 2026-05-20 normalized against.
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([]),
        });
    });
    await context.route("**/api/assistant/knowledge/packs", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ items: [] }),
        });
    });
    await context.route("**/api/assistant/capabilities", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ capabilities: {} }),
        });
    });
}

/**
 * Probe the shell root for the F5.1 / G5 telemetry attributes plus
 * the wizard / shell mount state.
 */
async function probeShell(page) {
    return page.evaluate(() => {
        const wizard = document.querySelector("[data-testid='pp-first-run-wizard']");
        const shell  = document.querySelector("[data-testid='pp-viewport-shell']");
        if (!shell) {
            return {
                hasWizard: !!wizard,
                hasShell:  false,
            };
        }
        return {
            hasWizard:               !!wizard,
            hasShell:                true,
            activeSurface:           shell.getAttribute("data-active-surface"),
            requestedSurface:        shell.getAttribute("data-requested-surface"),
            biSurfaceMode:           shell.getAttribute("data-bi-surface-mode"),
            requestedBiVendor:       shell.getAttribute("data-requested-bi-vendor"),
            runtimeBiVendor:         shell.getAttribute("data-runtime-bi-vendor"),
            biSurfaceResolution:     shell.getAttribute("data-bi-surface-resolution"),
            surfaceFallbackReason:   shell.getAttribute("data-surface-fallback-reason"),
            viewportFocus:           shell.getAttribute("data-viewport-focus"),
            layoutPinned:            shell.getAttribute("data-layout-pinned"),
        };
    });
}

/**
 * Run one scenario in a fresh browser context.
 */
async function runScenario(browser, name, setup, flow) {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const consoleMessages = [];
    const pageErrors = [];
    let snapshot = null;
    let lastPage = null;
    const failures = [];
    try {
        await mockApi(context);
        await setup(context);
        const page = await context.newPage();
        lastPage = page;
        page.on("console", (msg) => {
            const text = msg.text();
            if (isNoise(text)) return;
            consoleMessages.push(`[${msg.type()}] ${text}`);
        });
        page.on("pageerror", (err) => { pageErrors.push(err.message); });
        snapshot = await flow(page, failures);

        // Console-error budget: any [error] entry fails the scenario.
        const errorMessages = consoleMessages.filter(m => m.startsWith("[error]"));
        if (errorMessages.length > 0) {
            fail(failures, `${name}: console errors observed: ${errorMessages.join(" | ")}`);
        }
        if (pageErrors.length > 0) {
            fail(failures, `${name}: page errors observed: ${pageErrors.join(" | ")}`);
        }
    } catch (err) {
        fail(failures, `${name}: threw ${err.message}`);
    }
    return { name, snapshot, consoleMessages, pageErrors, failures, context, page: lastPage };
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const scenarios = [];
    try {
        /* ── Scenario A — Pre-dismissed startup ──────────────────────
         * Seed WIZARD_DISMISSED_KEY before any navigation. The shell
         * should mount directly with no wizard. */
        const sA = await runScenario(
            browser,
            "pre-dismissed-startup",
            async (context) => {
                await context.addInitScript(() => {
                    try { window.localStorage.setItem("pulseplay:wizard-dismissed", "true"); }
                    catch { /* swallow — same swallow App.tsx uses */ }
                });
            },
            async (page, failures) => {
                try {
                    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
                } catch (err) {
                    fail(failures, `goto ${BASE_URL} failed: ${err.message}`);
                    return null;
                }
                try {
                    await page.waitForSelector("[data-testid='pp-viewport-shell']", { timeout: TIMEOUT_MS });
                } catch (err) {
                    fail(failures, `shell never mounted: ${err.message}`);
                }
                const probe = await probeShell(page);
                if (probe.hasWizard) fail(failures, "wizard rendered despite localStorage dismissal seed");
                if (!probe.hasShell) fail(failures, "shell did not mount after pre-dismissal");
                if (!probe.activeSurface) fail(failures, "data-active-surface missing on shell");
                if (!probe.biSurfaceMode) fail(failures, "data-bi-surface-mode missing on shell");
                if (!probe.runtimeBiVendor) fail(failures, "data-runtime-bi-vendor missing on shell");
                return probe;
            },
        );
        scenarios.push(sA);

        /* ── Scenario B — Forced wizard + interactive Skip ──────────
         * On fresh state, G5's auto-fallback-to-native makes the App
         * treat the BI surface as already "renderable", so the wizard
         * is suppressed. The documented way to re-show the wizard
         * (used by Settings -> System -> "Re-run setup wizard") is
         * to set WIZARD_FORCE_KEY. Validates the wizard mount + Skip
         * path that authors actually hit when re-running setup. */
        const sB = await runScenario(
            browser,
            "force-wizard-skip-path",
            async (context) => {
                await context.addInitScript(() => {
                    try { window.localStorage.setItem("pulseplay:wizard-force", "true"); }
                    catch { /* swallow */ }
                });
            },
            async (page, failures) => {
                try {
                    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
                } catch (err) {
                    fail(failures, `goto ${BASE_URL} failed: ${err.message}`);
                    return null;
                }
                try {
                    await page.waitForSelector("[data-testid='pp-first-run-wizard']", { timeout: TIMEOUT_MS });
                } catch (err) {
                    fail(failures, `wizard never mounted: ${err.message}`);
                    return await probeShell(page);
                }
                // Defensive — if the WizardErrorBoundary caught a render
                // crash (e.g. mock-shape drift causing connectors.find to
                // throw), the boundary's own skip button mounts in place
                // of the real wizard. Fail loudly with the boundary text
                // so the next maintainer can fix the mock contract.
                const boundary = await page.evaluate(() => {
                    const el = document.querySelector("[data-testid='pp-wizard-error-boundary']");
                    if (!el) return null;
                    const details = el.querySelector("details");
                    if (details) details.open = true;
                    return el.textContent?.slice(0, 1000) ?? "";
                });
                if (boundary) {
                    fail(failures, `WizardErrorBoundary tripped: ${boundary}`);
                    return await probeShell(page);
                }
                try {
                    await page.click("[aria-label='Skip setup and close']", { timeout: TIMEOUT_MS });
                } catch (err) {
                    fail(failures, `skip click failed: ${err.message}`);
                }
                try {
                    await page.waitForSelector("[data-testid='pp-first-run-wizard']", { state: "detached", timeout: TIMEOUT_MS });
                } catch (err) {
                    fail(failures, `wizard did not unmount after skip: ${err.message}`);
                }
                const probe = await probeShell(page);
                if (probe.hasWizard) fail(failures, "wizard still present after skip");
                if (!probe.hasShell) fail(failures, "shell missing after skip");
                if (!probe.activeSurface) fail(failures, "data-active-surface missing on shell after skip");
                return probe;
            },
        );
        scenarios.push(sB);

        // Screenshot the last scenario's final state. Best effort — never
        // fails the run if it errors (the page may already be torn down).
        const lastPage = scenarios.at(-1)?.page;
        if (lastPage) {
            try { await lastPage.screenshot({ path: SCREENSHOT_PATH, fullPage: true }); }
            catch { /* swallow */ }
        }
    } finally {
        // Close any leftover contexts.
        for (const s of scenarios) {
            try { await s.context?.close(); } catch { /* swallow */ }
        }
        await browser.close();
    }

    const failures = scenarios.flatMap(s => s.failures);
    const report = {
        baseUrl:    BASE_URL,
        screenshot: SCREENSHOT_PATH,
        scenarios:  scenarios.map(s => ({
            name:               s.name,
            snapshot:           s.snapshot,
            failures:           s.failures,
            consoleMessages:    s.consoleMessages.slice(-30),
            pageErrors:         s.pageErrors,
        })),
        failures,
    };
    console.log(JSON.stringify(report, null, 2));
    if (failures.length > 0) {
        process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error("Shell smoke script crashed:", err.message);
    console.error(err.stack);
    process.exitCode = 2;
});
