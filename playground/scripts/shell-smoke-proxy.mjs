// playground/scripts/shell-smoke-proxy.mjs
//
// SS2 — Proxy-backed shell smoke for the PulsePlay React shell.
//
// What this smoke covers
// ──────────────────────
//   * Real proxy boot with a `type: "smoke-fixture"` profile registered
//     via PROXY_PROFILE_* env vars. The proxy short-circuits
//     /assistant/conversations/start to return a canned `COMPLETED`
//     response BUILT THROUGH the real `withGovernance(...)` helper, so
//     the attestation contract is exercised end-to-end, not faked.
//   * Real Vite dev server proxying /api/* to the real proxy.
//   * Real headless Chromium navigating to / and submitting an AI ask
//     through the real AISidebar React component.
//   * Verifies the AISidebar renders the smoke-fixture answer text
//     (proving the round-trip Vite -> proxy -> attestation -> back
//     -> React state -> visible DOM actually worked).
//   * FW1 — verifies the native canvas paints alongside the sidebar
//     when runtimeBiVendor === "native". The proxy fixture returns a
//     small time-series queryResult; App.tsx's `handleEntryCompleted`
//     routes the envelope into `primaryBIAdapter.send({ kind:
//     "renderResult", result })`; the canvas auto-picks a chart; the
//     fusion-lite layout docks the answer commentary card alongside.
//     The smoke asserts both halves carry the SAME `data-result-id`
//     (== the proxy-supplied `message_id`), proving the wiring is
//     coherent end-to-end.
//   * Zero-tolerance console/page error budget.
//
// What this smoke does NOT cover (still honest non-claims)
// ────────────────────────────────────────────────────────
//   * Wizard walkthrough (persona -> vendor -> connector -> Done & Ask).
//     The spec pre-seeds localStorage so the wizard is dismissed and
//     the connector is already set to the smoke profile.
//   * Multi-message conversation flows. The smoke fires one ask and
//     verifies the response; polling/continuation flows are not
//     exercised because the smoke-fixture profile returns COMPLETED
//     synchronously.
//   * Other vendor adapters (Power BI / Tableau / Qlik / Looker). The
//     smoke runs with biSurfaceMode=auto and no embed config, so the
//     runtime BI surface is native.
//
// Usage
// ─────
//   # From the repo root:
//   node playground/scripts/shell-smoke-proxy.mjs
//
// The runner manages all three processes (proxy, Vite, Playwright) and
// tears them down on success, failure, or SIGINT/SIGTERM. JSON report
// to stdout; screenshot to playground/scripts/shell-smoke-proxy.png
// (gitignored). Exit 0 on PASS; non-zero on any failure.
//
// If port 8787 (proxy) is already taken, the runner fails fast rather
// than reusing whatever was bound there — running against a stale proxy
// invalidates the smoke. Vite is allowed to walk up from 5173 because
// the runner captures the actual ready URL before launching Chromium.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const PROXY_DIR = join(REPO_ROOT, "proxy");
const PLAYGROUND_DIR = join(REPO_ROOT, "playground");
const SCREENSHOT_PATH = join(__dirname, "shell-smoke-proxy.png");

const PROXY_PORT = 8787;
// server.js prints `PulsePlay Proxy  →  http://127.0.0.1:8787` on bind,
// or `PulsePlay Proxy running for Databricks Apps on 0.0.0.0:8787` in
// the bound-to-0.0.0.0 path. Match either.
const PROXY_READY_PATTERN = /PulsePlay Proxy.*?(?:127\.0\.0\.1|0\.0\.0\.0):(\d+)/;
const VITE_READY_PATTERN = /Local:\s+(https?:\/\/[^\s]+)/;

const READY_TIMEOUT_MS = 60_000;
const SMOKE_TIMEOUT_MS = 30_000;

const SMOKE_ENV = Object.freeze({
    ...process.env,
    PROXY_PROFILE_SMOKE_TYPE: "smoke-fixture",
    PROXY_PROFILE_SMOKE_DISPLAY_NAME: "SS2 Smoke Fixture",
    PROXY_PROFILE_SMOKE_DATA_DOMAIN: "synthetic smoke data",
    // Force non-production so buildGovernanceAttestation allows
    // authority:"mock" for the fixture profile.
    NODE_ENV: "development",
    // Don't let an inherited PROXY_REQUIRE_AUTH break the smoke.
    PROXY_REQUIRE_AUTH: "false",
    PROXY_AUTH_MODE: "none",
});

const NOISE_PATTERNS = [
    /vite/i,
    /react devtools/i,
    /\[HMR\]/i,
    /Download the React DevTools/i,
];

function isNoise(text) {
    return NOISE_PATTERNS.some((rx) => rx.test(text));
}

// ─── Port pre-flight ───────────────────────────────────────────────────────

function probePort(port) {
    return new Promise((res) => {
        const server = createServer();
        server.once("error", () => res({ port, free: false }));
        server.once("listening", () => {
            server.close(() => res({ port, free: true }));
        });
        server.listen(port, "127.0.0.1");
    });
}

// ─── Process orchestration ─────────────────────────────────────────────────

const children = new Set();

function spawnChild(name, command, args, opts) {
    // Avoid `shell: true`: recent Node versions warn (DEP0190) when args
    // are passed through a shell, and this runner should be warning-clean.
    // On Windows, npm/npx are .cmd shims; run them through cmd.exe directly
    // with fixed, internal args instead of asking Node to synthesize a shell.
    const needsWindowsCmd = process.platform === "win32" && /^(npm|npx)$/.test(command);
    const executable = needsWindowsCmd ? "cmd.exe" : command;
    const executableArgs = needsWindowsCmd
        ? ["/d", "/s", "/c", `${command}.cmd`, ...args]
        : args;
    const child = spawn(executable, executableArgs, {
        cwd: opts.cwd,
        env: opts.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.label = name;
    children.add(child);
    child.on("exit", () => children.delete(child));
    return child;
}

async function killAll(reason) {
    // On Windows, npm.cmd may still spawn a child Node/Vite process.
    // `taskkill /T /F` walks the process tree and reliably tears the
    // dev server down, so we use it directly — no SIGTERM grace window.
    //
    // On POSIX, SIGTERM with a SIGKILL fallback is the right shape.
    const promises = [];
    for (const child of children) {
        promises.push(
            new Promise((res) => {
                if (child.exitCode !== null || child.signalCode) {
                    res();
                    return;
                }
                if (process.platform === "win32") {
                    if (!child.pid) { res(); return; }
                    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
                        stdio: "ignore",
                    }).on("exit", () => res());
                    return;
                }
                const timer = setTimeout(() => {
                    try { child.kill("SIGKILL"); } catch { /* swallow */ }
                    res();
                }, 3000);
                child.once("exit", () => {
                    clearTimeout(timer);
                    res();
                });
                try { child.kill("SIGTERM"); } catch { /* swallow */ }
            }),
        );
    }
    await Promise.all(promises);
    if (reason) console.error(`[smoke] tore down children: ${reason}`);
}

// ANSI escape stripper — Vite emits `\x1b[32m\x1b[1mLocal\x1b[22m\x1b[39m: ...`
// for its ready line, which means a naive regex on raw chunks won't match.
// eslint-disable-next-line no-control-regex
const ANSI_RX = /\x1B\[[0-9;?]*[ -/]*[@-~]/g;
function stripAnsi(s) { return String(s || "").replace(ANSI_RX, ""); }

function watchForPattern(child, pattern, label) {
    return new Promise((resolveReady, rejectReady) => {
        const buffer = { out: "", err: "" };
        const timer = setTimeout(() => {
            rejectReady(new Error(`${label}: ready pattern not seen within ${READY_TIMEOUT_MS}ms. Last 1200 chars:\n${stripAnsi(buffer.out + buffer.err).slice(-1200)}`));
        }, READY_TIMEOUT_MS);
        const onChunk = (kind) => (chunk) => {
            const text = chunk.toString("utf8");
            buffer[kind] += text;
            const match = stripAnsi(buffer.out + buffer.err).match(pattern);
            if (match) {
                clearTimeout(timer);
                resolveReady(match);
            }
        };
        child.stdout.on("data", onChunk("out"));
        child.stderr.on("data", onChunk("err"));
        child.once("exit", (code) => {
            clearTimeout(timer);
            rejectReady(new Error(`${label}: exited (code=${code}) before ready. Last output:\n${(buffer.out + buffer.err).slice(-1200)}`));
        });
    });
}

// ─── Smoke flow ────────────────────────────────────────────────────────────

async function bootProxy() {
    const child = spawnChild("proxy", "node", ["server.js"], {
        cwd: PROXY_DIR,
        env: SMOKE_ENV,
    });
    await watchForPattern(child, PROXY_READY_PATTERN, "proxy");
    return child;
}

async function bootVite() {
    const child = spawnChild("vite", "npm", ["run", "dev"], {
        cwd: PLAYGROUND_DIR,
        env: SMOKE_ENV,
    });
    const match = await watchForPattern(child, VITE_READY_PATTERN, "vite");
    return { child, baseUrl: match[1].replace(/\/$/, "") + "/" };
}

/**
 * Pre-seed localStorage so the React app boots with:
 *  - the wizard dismissed
 *  - the smoke profile as the active AI connector
 *  - native as the runtime BI surface (G5 auto-fallback when no embed
 *    config is present)
 */
async function seedStateInContext(context) {
    await context.addInitScript(() => {
        try {
            window.localStorage.setItem("pulseplay:wizard-dismissed", "true");
            window.localStorage.setItem("pulseplay:active-ai-profile", "smoke");
            window.localStorage.setItem("pulseplay:bi-surface-mode", "auto");
            window.localStorage.setItem("pulseplay:active-surface", "ask-pulse");
            // FW1 — force "both" so the BI pane (and its native adapter)
            // actually mount alongside the AISidebar. The default "mix"
            // layout would hide the BI surface while the active surface is
            // "ask-pulse", which means `primaryBIAdapter` would be null
            // when `handleEntryCompleted` fires and the canvas paint
            // assertion would never see a target. "Both" mounts both
            // panes concurrently so the smoke can observe sidebar text
            // AND canvas paint in one screenshot.
            window.localStorage.setItem("pulseplay:enabled-components", "both");
            // App.tsx migrates "both" -> "mix" on first load unless this
            // marker is set (legacy "both" was the old default; explicit
            // "both" survives the migration). The smoke is explicit, so
            // we set the marker up front to keep "both" stable.
            window.localStorage.setItem("pulseplay:enabled-components:legacy-both-migrated", "true");
            // v0 ui-mode renders the simple <AISidebar> component (one
            // textarea + Ask button + entry list). The default "pulse" mode
            // mounts the heritage Pulse chat under multiple isConfigured
            // gates (apiBaseUrl + assistantProfile/spaceId per the legacy
            // setup flow) which adds wiring this smoke isn't here to test.
            // SS2 targets the AI -> proxy -> attested-response contract;
            // exercising it via v0 keeps the assertion surface tight.
            // Pulse-mode smoke is a separate slice when it's needed.
            window.localStorage.setItem("pulseplay:ui-mode", "v0");
        } catch { /* swallow */ }
    });
}

async function runSmoke(baseUrl) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await seedStateInContext(context);
    const consoleMessages = [];
    const pageErrors = [];
    const failedRequests = [];
    const failures = [];
    const page = await context.newPage();
    page.on("console", (msg) => {
        const text = msg.text();
        if (isNoise(text)) return;
        consoleMessages.push(`[${msg.type()}] ${text}`);
    });
    page.on("pageerror", (err) => { pageErrors.push(err.message); });
    // Track non-2xx /api responses so the 400 doesn't hide behind the
    // generic "Failed to load resource" console error.
    page.on("response", (resp) => {
        const url = resp.url();
        if (!url.includes("/api/")) return;
        if (resp.status() >= 400) {
            failedRequests.push({ url, status: resp.status(), method: resp.request().method() });
        }
    });

    let snapshot = null;
    try {
        await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT_MS });
        await page.waitForSelector("[data-testid='pp-viewport-shell']", { timeout: SMOKE_TIMEOUT_MS });

        // Find the AI sidebar's textarea via its stable placeholder.
        await page.waitForSelector("textarea[placeholder='Ask about the loaded view…']", { timeout: SMOKE_TIMEOUT_MS });
        // FW1 — wait for the native adapter to mount BEFORE submitting.
        // Without this, the smoke can fire the question fast enough that
        // primaryBIAdapter is still null when handleEntryCompleted runs.
        // The native canvas's empty-state landmark only exists once the
        // adapter has rendered, so its presence proves App.tsx received
        // the adapter via onAdapterReady.
        await page.waitForSelector("[data-native-bi-adapter='true']", { timeout: SMOKE_TIMEOUT_MS });
        await page.fill("textarea[placeholder='Ask about the loaded view…']", "SS2 smoke question");
        // The Ask button is a sibling button with text "Ask".
        await page.click("button.pp-ai-sidebar__ask", { timeout: SMOKE_TIMEOUT_MS });

        // Wait for an entry to land with status="completed".
        await page.waitForSelector("[data-testid^='pp-ai-entry-'][data-status='completed']", { timeout: SMOKE_TIMEOUT_MS });

        // FW1 — wait for the native canvas to paint. The proxy fixture's
        // 4-row queryResult auto-picks to a line chart, so the chart
        // testid + an ECharts <canvas> child should both appear once
        // App.tsx's `handleEntryCompleted` dispatches the envelope.
        await page.waitForSelector("[data-testid='pp-native-bi-chart'] canvas", { timeout: SMOKE_TIMEOUT_MS });

        snapshot = await page.evaluate(() => {
            const entry = document.querySelector("[data-testid^='pp-ai-entry-'][data-status='completed']");
            const text = entry ? entry.textContent : null;
            const shell = document.querySelector("[data-testid='pp-viewport-shell']");
            // FW1 — collect canvas + fusion card state for cross-validation.
            const chart = document.querySelector("[data-testid='pp-native-bi-chart']");
            const fusionCard = document.querySelector("[data-testid='pp-native-bi-fusion-card']");
            const fusionAnswer = document.querySelector("[data-testid='pp-native-bi-fusion-card-answer']");
            const fusionAuthority = document.querySelector("[data-testid='pp-native-bi-fusion-card-authority']");
            const resultIds = Array.from(document.querySelectorAll("[data-result-id]"))
                .map((el) => el.getAttribute("data-result-id"))
                .filter(Boolean);
            return {
                entryText: text ? text.slice(0, 800) : null,
                runtimeBiVendor: shell?.getAttribute("data-runtime-bi-vendor") ?? null,
                biSurfaceMode: shell?.getAttribute("data-bi-surface-mode") ?? null,
                activeSurface: shell?.getAttribute("data-active-surface") ?? null,
                hasChart: !!chart,
                hasChartCanvas: !!(chart && chart.querySelector("canvas")),
                hasFusionCard: !!fusionCard,
                fusionAnswerText: fusionAnswer ? fusionAnswer.textContent : null,
                fusionAuthorityText: fusionAuthority ? fusionAuthority.textContent : null,
                resultIds,
                resultIdSet: Array.from(new Set(resultIds)),
            };
        });

        if (!snapshot.entryText) failures.push("no completed entry text found");
        if (!/Smoke fixture answer to/.test(snapshot.entryText ?? "")) {
            failures.push(`completed entry did not include smoke-fixture answer; got: ${snapshot.entryText}`);
        }
        if (!/SS2 smoke question/.test(snapshot.entryText ?? "")) {
            failures.push(`completed entry did not echo the asked question; got: ${snapshot.entryText}`);
        }
        if (snapshot.runtimeBiVendor !== "native") {
            failures.push(`expected runtimeBiVendor=native, got: ${snapshot.runtimeBiVendor}`);
        }

        // FW1 — native canvas paint + fusion-lite assertions.
        if (!snapshot.hasChart) failures.push("native canvas chart wrapper did not paint");
        if (!snapshot.hasChartCanvas) failures.push("native canvas chart wrapper has no <canvas> (ECharts didn't render)");
        if (!snapshot.hasFusionCard) failures.push("native canvas fusion-lite commentary card missing");
        if (!/Smoke fixture answer to/.test(snapshot.fusionAnswerText ?? "")) {
            failures.push(`fusion card answer did not include smoke-fixture text; got: ${snapshot.fusionAnswerText}`);
        }
        if (snapshot.fusionAuthorityText !== "mock") {
            failures.push(`fusion card governance chip expected "mock", got: ${snapshot.fusionAuthorityText}`);
        }
        // All elements bound to the SAME envelope id (== the proxy's
        // message_id). This proves the wiring is coherent: the
        // AISidebar's entry, the canvas chart wrapper, and the fusion
        // card all reference one identity. If the set has more than one
        // value, two envelopes raced; if it's empty, no binding was
        // emitted at all.
        if (snapshot.resultIdSet.length === 0) {
            failures.push("no data-result-id bindings found in the DOM");
        } else if (snapshot.resultIdSet.length > 1) {
            failures.push(`data-result-id bindings disagree: ${snapshot.resultIdSet.join(", ")}`);
        } else if (!/^smoke-msg-[a-f0-9]{12}$/.test(snapshot.resultIdSet[0])) {
            failures.push(`data-result-id did not match smoke fixture message_id shape; got: ${snapshot.resultIdSet[0]}`);
        }

        // Allow request settlement before the strict checks — a 400 fired
        // from a fire-and-forget warmup call can land milliseconds after
        // the main flow's assertions clear. 1.5s is plenty for HTTP RTT
        // on localhost without bloating the smoke's total runtime.
        await page.waitForTimeout(1500);

        const errorMessages = consoleMessages.filter((m) => m.startsWith("[error]"));
        if (errorMessages.length > 0) {
            failures.push(`console errors observed: ${errorMessages.join(" | ")}`);
        }
        if (pageErrors.length > 0) {
            failures.push(`page errors observed: ${pageErrors.join(" | ")}`);
        }
        if (failedRequests.length > 0) {
            failures.push(`failed /api/* requests: ${failedRequests.map((r) => `${r.method} ${r.url} -> ${r.status}`).join(" | ")}`);
        }
    } catch (err) {
        failures.push(`smoke threw: ${err.message}`);
    } finally {
        try { await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true }); }
        catch { /* swallow */ }
        await context.close();
        await browser.close();
    }
    return { snapshot, failures, consoleMessages: consoleMessages.slice(-30), pageErrors, failedRequests };
}

// ─── Entrypoint ────────────────────────────────────────────────────────────

let exitOnSignalArmed = false;
function armSignalHandlers() {
    if (exitOnSignalArmed) return;
    exitOnSignalArmed = true;
    const handler = async (sig) => {
        await killAll(`signal ${sig}`);
        process.exit(130);
    };
    process.on("SIGINT", handler);
    process.on("SIGTERM", handler);
}

async function main() {
    armSignalHandlers();

    // Only the proxy port is pre-flighted: Vite walks up from 5173 on its
    // own, and the smoke captures the actual port from the "Local: ..."
    // ready line — running side-by-side with another dev server is fine.
    // Reusing the proxy port would be silently wrong (we'd hit whatever
    // proxy is bound there instead of the smoke-fixture one we boot),
    // hence the fail-fast.
    //
    // Brief retry: after a previous orchestrator run, the OS may need a
    // moment to fully release the listening socket. 5 attempts at 1s
    // is enough to cover that without masking a genuine "another proxy
    // is bound here" condition.
    let probe = await probePort(PROXY_PORT);
    for (let i = 0; i < 5 && !probe.free; i++) {
        await new Promise((res) => setTimeout(res, 1000));
        probe = await probePort(PROXY_PORT);
    }
    if (!probe.free) {
        console.error(JSON.stringify({
            failures: [`port ${PROXY_PORT} is already in use after 5s; stop the existing proxy first`],
        }, null, 2));
        process.exit(1);
    }

    let proxyChild = null;
    let viteChild = null;
    let baseUrl = null;
    let report = null;
    try {
        proxyChild = await bootProxy();
        const vite = await bootVite();
        viteChild = vite.child;
        baseUrl = vite.baseUrl;
        report = await runSmoke(baseUrl);
    } catch (err) {
        report = report || { failures: [`bootstrap threw: ${err.message}`] };
    } finally {
        await killAll("smoke complete");
    }

    const out = {
        baseUrl,
        screenshot: SCREENSHOT_PATH,
        ...(report || {}),
    };
    console.log(JSON.stringify(out, null, 2));
    if (!report || (report.failures && report.failures.length > 0)) {
        process.exit(1);
    }
}

main().catch(async (err) => {
    console.error("[smoke] crashed:", err.message);
    console.error(err.stack);
    await killAll("crash");
    process.exit(2);
});
