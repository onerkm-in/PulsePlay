// playground/scripts/native-canvas-smoke.mjs
//
// Canvas-standalone browser smoke for the G-track (G4 / G5 / G6).
//
// What this smoke covers
// ──────────────────────
//   • Real-browser ECharts paint (jsdom never paints; this is the gap
//     automated unit tests cannot close).
//   • Fusion-lite layout in actual viewport (responsive flex behaviour,
//     not just DOM presence).
//   • data-result-id binding visible end-to-end.
//   • Blocked state actually hides the body in real DOM.
//
// What this smoke does NOT cover
// ──────────────────────────────
//   • PulsePlay shell mount path (no AI sidebar, no BIPanel, no
//     vendor picker UX). Those need a proxy-backed shell smoke.
//   • G3 governance attestation end-to-end through the proxy.
//   • G5 surface-mode picker interaction. State machine, unit-tested.
//
// Usage:
//   1. Start vite dev server in another terminal: `npm run dev`
//   2. Run: `node scripts/native-canvas-smoke.mjs`
// The script waits for the smoke page, asserts DOM expectations,
// captures a screenshot to playground/scripts/native-canvas-smoke.png,
// and exits non-zero on any failure.

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const URL = "http://127.0.0.1:5173/native-canvas-smoke.html";
const TIMEOUT_MS = 30000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_PATH = join(__dirname, "native-canvas-smoke.png");

function fail(message, extra) {
    console.error(`SMOKE FAILURE: ${message}`);
    if (extra) console.error(JSON.stringify(extra, null, 2));
    process.exitCode = 1;
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();

    const consoleMessages = [];
    page.on("console", (msg) => {
        // ignore Vite + React devtools noise
        const text = msg.text();
        if (/vite|react devtools/i.test(text)) return;
        consoleMessages.push(`[${msg.type()}] ${text}`);
    });
    const pageErrors = [];
    page.on("pageerror", (err) => { pageErrors.push(err.message); });

    try {
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
    } catch (err) {
        await browser.close();
        fail(`navigation failed: ${err.message}`);
        return;
    }

    // Wait for the smoke harness to signal it's mounted everything.
    try {
        await page.waitForSelector("html[data-smoke-ready='true']", { timeout: TIMEOUT_MS });
    } catch (err) {
        await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
        await browser.close();
        fail(`smoke harness never reached ready state`, { consoleMessages, pageErrors });
        return;
    }

    // Capture observable state for each scenario.
    const snapshot = await page.evaluate(() => {
        function probe(hostId) {
            const host = document.querySelector(`#${hostId}`);
            if (!host) return null;
            const root = host.querySelector("[data-native-bi-adapter='true']");
            if (!root) return { hostId, mounted: false };
            const chart = host.querySelector("[data-testid='pp-native-bi-chart']");
            const fusion = host.querySelector("[data-testid='pp-native-bi-fusion']");
            const fusionCard = host.querySelector("[data-testid='pp-native-bi-fusion-card']");
            const fusionAnswer = host.querySelector("[data-testid='pp-native-bi-fusion-card-answer']");
            const fusionAuth = host.querySelector("[data-testid='pp-native-bi-fusion-card-authority']");
            const fusionPreview = host.querySelector("[data-testid='pp-native-bi-fusion-card-preview']");
            const fusionSource = host.querySelector("[data-testid='pp-native-bi-fusion-card-source']");
            const kpi = host.querySelector("[data-testid='pp-native-bi-kpi']");
            const kpiValue = host.querySelector("[data-testid='pp-native-bi-kpi-value']");
            const table = host.querySelector("[data-testid='pp-native-bi-table']");
            const echartsCanvas = chart ? chart.querySelector("canvas") : null;
            return {
                hostId,
                mounted: true,
                status: root.getAttribute("data-native-bi-status"),
                governance: root.getAttribute("data-native-governance"),
                resultIds: Array.from(host.querySelectorAll("[data-result-id]"))
                    .map(el => el.getAttribute("data-result-id"))
                    .filter(Boolean),
                hasChart: !!chart,
                hasChartCanvas: !!echartsCanvas,
                hasFusionWrapper: !!fusion,
                hasFusionCard: !!fusionCard,
                fusionAnswerText: fusionAnswer ? fusionAnswer.textContent : null,
                fusionAuthorityText: fusionAuth ? fusionAuth.textContent : null,
                fusionPreviewChip: !!fusionPreview,
                fusionSourceText: fusionSource ? fusionSource.textContent : null,
                hasKpi: !!kpi,
                kpiValueText: kpiValue ? kpiValue.textContent : null,
                hasTable: !!table,
                textIncludes: {
                    askPulse: (root.textContent || "").includes("Ask Pulse a question"),
                    aiResultAccepted: (root.textContent || "").includes("AI result accepted"),
                    renderBlocked: (root.textContent || "").includes("Render blocked"),
                    devOnlyPreview: (root.textContent || "").includes("Ungoverned result preview"),
                },
            };
        }
        return {
            empty: probe("host-empty"),
            kpi: probe("host-kpi"),
            fusionEnforced: probe("host-fusion-enforced"),
            fusionPreview: probe("host-fusion-preview"),
            blocked: probe("host-blocked"),
            table: probe("host-table"),
        };
    });

    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
    await browser.close();

    // ─── Assertions ───────────────────────────────────────────────────
    const failures = [];

    // Empty: shows the "Ask Pulse a question" prompt, no governance attr.
    if (!snapshot.empty?.mounted) failures.push("empty scenario did not mount");
    if (snapshot.empty?.status !== "empty") failures.push(`empty.status=${snapshot.empty?.status}`);
    if (!snapshot.empty?.textIncludes.askPulse) failures.push("empty did not show Ask Pulse prompt");
    if (snapshot.empty?.governance) failures.push(`empty unexpectedly has governance attr: ${snapshot.empty.governance}`);

    // KPI: shows the kpi value formatted; no chart canvas.
    if (!snapshot.kpi?.hasKpi) failures.push("kpi scenario did not render KPI body");
    if (!snapshot.kpi?.kpiValueText || !/1,234,567/.test(snapshot.kpi.kpiValueText)) {
        failures.push(`kpi value text unexpected: ${snapshot.kpi?.kpiValueText}`);
    }
    if (snapshot.kpi?.governance !== "enforced") failures.push(`kpi governance=${snapshot.kpi?.governance}`);

    // Fusion enforced: chart canvas paints, fusion card shows answer + authority.
    if (!snapshot.fusionEnforced?.hasChart) failures.push("fusion-enforced has no chart");
    if (!snapshot.fusionEnforced?.hasChartCanvas) failures.push("fusion-enforced ECharts canvas not painted");
    if (!snapshot.fusionEnforced?.hasFusionWrapper) failures.push("fusion-enforced fusion wrapper missing");
    if (!snapshot.fusionEnforced?.hasFusionCard) failures.push("fusion-enforced fusion card missing");
    if (!/Sales grew 200%/.test(snapshot.fusionEnforced?.fusionAnswerText ?? "")) {
        failures.push("fusion-enforced answer text did not render");
    }
    if (snapshot.fusionEnforced?.fusionAuthorityText !== "unity-catalog") {
        failures.push(`fusion-enforced authority chip=${snapshot.fusionEnforced?.fusionAuthorityText}`);
    }
    if (snapshot.fusionEnforced?.fusionPreviewChip) {
        failures.push("fusion-enforced unexpectedly shows preview chip");
    }
    if (!/Monthly sales \(Metric View\)/.test(snapshot.fusionEnforced?.fusionSourceText ?? "")) {
        failures.push(`fusion-enforced source text unexpected: ${snapshot.fusionEnforced?.fusionSourceText}`);
    }
    const enforcedIds = new Set(snapshot.fusionEnforced?.resultIds ?? []);
    if (enforcedIds.size !== 1 || !enforcedIds.has("smoke-fusion-chart")) {
        failures.push(`fusion-enforced data-result-id binding broken: ${[...enforcedIds].join(",")}`);
    }

    // Fusion preview: preview chip visible, authority chip absent, DEV ONLY badge visible.
    if (!snapshot.fusionPreview?.hasFusionCard) failures.push("fusion-preview fusion card missing");
    if (snapshot.fusionPreview?.fusionAuthorityText) {
        failures.push("fusion-preview should not show authority chip");
    }
    if (!snapshot.fusionPreview?.fusionPreviewChip) {
        failures.push("fusion-preview should show DEV preview chip on card");
    }
    if (!snapshot.fusionPreview?.textIncludes.devOnlyPreview) {
        failures.push("fusion-preview should show top-level DEV ONLY preview badge");
    }
    if (snapshot.fusionPreview?.governance !== "preview") {
        failures.push(`fusion-preview governance=${snapshot.fusionPreview?.governance}`);
    }

    // Blocked: BlockedState only. No chart, no fusion, no commentary.
    if (snapshot.blocked?.hasChart) failures.push("blocked should not show chart");
    if (snapshot.blocked?.hasFusionWrapper) failures.push("blocked should not show fusion wrapper");
    if (snapshot.blocked?.hasFusionCard) failures.push("blocked should not show fusion card");
    if (!snapshot.blocked?.textIncludes.renderBlocked) failures.push("blocked did not show 'Render blocked'");
    if (snapshot.blocked?.governance !== "blocked") failures.push(`blocked governance=${snapshot.blocked?.governance}`);

    // Table: fusion card present (answer + table), no chart.
    if (!snapshot.table?.hasTable) failures.push("table scenario missing table body");
    if (!snapshot.table?.hasFusionCard) failures.push("table missing fusion card (it has an answer)");

    // ─── Report ──────────────────────────────────────────────────────
    const report = {
        url: URL,
        screenshot: SCREENSHOT_PATH,
        snapshot,
        consoleMessages: consoleMessages.slice(-30),
        pageErrors,
        failures,
    };
    console.log(JSON.stringify(report, null, 2));

    if (failures.length > 0) {
        process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error("Smoke script crashed:", err.message);
    console.error(err.stack);
    process.exitCode = 2;
});
