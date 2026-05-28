#!/usr/bin/env node
// playground/scripts/verify-staged-insights-headed.mjs
//
// HEADED demo for the staged AI Insights pipeline (90d2b50 +
// 35b7f28). Watches the AI Insights briefing on PulseShell as
// sections arrive in batches (lead → trends+risks → actions).
//
// What you'll see in the visible Chromium window + terminal:
//   1. Cold boot, set profile=default + ui-mode=pulse
//   2. Land on AI Insights tab (default landing)
//   3. Watch for HEADLINE+KPI SNAPSHOT to arrive first (~10-20s)
//   4. Watch TRENDS+RISKS arrive next (~next 15-25s)
//   5. Watch RECOMMENDED ACTIONS arrive last
//   6. Each section arrival is timestamped in the terminal narration
//
// Total runtime ~3-5 minutes including Genie warmup + 3 batches.

import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:7001";

function story(msg) {
    const t = new Date().toISOString().substring(11, 19);
    console.log(`  [${t}] ▸ ${msg}`);
}
async function pause(page, ms) { await page.waitForTimeout(ms); }

async function main() {
    console.log("Launching headed Chromium — a window will pop up on your desktop.");
    console.log("Watch the AI Insights briefing build up section-by-section.\n");

    const browser = await chromium.launch({
        headless: false,
        slowMo: 350,
        args: ["--window-size=1400,900", "--window-position=120,80"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();

    // Capture browser console errors so we know if the new policy threw
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(e.message));

    // ─── Setup ───────────────────────────────────────────────────────
    console.log("━━━ Setup ━━━");
    story("Opening PulsePlay fresh.");
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });

    story("Configuring profile=default + ui-mode=pulse + /api prefix.");
    await page.evaluate(() => {
        // Profile + correct /api prefix (fixed in commit e599f98)
        localStorage.setItem("pulseplay:active-ai-profile", "default");
        const k = "pulseplay:visual-settings:genieSettings";
        const existing = JSON.parse(localStorage.getItem(k) || "{}");
        existing.assistantProfile = "default";
        existing.connectionMode = "proxy";
        existing.apiBaseUrl = window.location.origin + "/api";
        localStorage.setItem(k, JSON.stringify(existing));
        // Use PulseShell so AI Insights tab is available (it's pulse-only today)
        localStorage.setItem("pulseplay:ui-mode", "pulse");
    });
    await page.reload({ waitUntil: "networkidle" });
    await pause(page, 1500);

    // Dismiss wizard if it pops up
    const wizardDismiss = page.locator('button[aria-label="Skip setup and close"]').first();
    if (await wizardDismiss.count() > 0) {
        await wizardDismiss.click().catch(() => undefined);
        await pause(page, 800);
    }

    // ─── Land on AI Insights tab ────────────────────────────────────
    console.log("\n━━━ Land on AI Insights ━━━");
    story("Clicking the AI Insights tab in the PulseShell tab strip.");
    const insightsTab = page.locator('button:has-text("AI Insights")').first();
    if (await insightsTab.count() > 0) {
        await insightsTab.click();
        await pause(page, 1500);
    } else {
        story("AI Insights tab not found — already on it (default landing).");
    }

    // ─── Watch for batches ──────────────────────────────────────────
    console.log("\n━━━ Watching for staged section arrivals ━━━");
    story("AI Insights pipeline starting. Expect ~3 batches under one conversation_id.");
    story("Polling DOM every 2s for new sections…");

    const startMs = Date.now();
    const seenTitles = new Set();
    const arrivals = [];
    const deadline = Date.now() + 5 * 60 * 1000;  // 5 min — matches COMPLEX_REQUEST_TIMEOUT_MS

    let lastCount = 0;
    while (Date.now() < deadline) {
        await pause(page, 2000);
        const observation = await page.evaluate(() => {
            const sections = Array.from(document.querySelectorAll(".gn-insights-section[class*='gn-insights-section'][class*='placeholder'] [data-section-title], .gn-insights-section:not(.gn-insights-section--placeholder) [data-section-title]"));
            const titles = sections.map(el => el.getAttribute("data-section-title")).filter(Boolean);
            // Also detect completion: presence of section without placeholder class
            const completed = Array.from(document.querySelectorAll(".gn-insights-section:not(.gn-insights-section--placeholder) [data-section-title]"))
                .map(el => el.getAttribute("data-section-title"))
                .filter(Boolean);
            return { all: titles, completed };
        });

        // Report new completions
        for (const t of observation.completed) {
            if (!seenTitles.has(t)) {
                seenTitles.add(t);
                const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
                arrivals.push({ title: t, elapsedSeconds: parseFloat(elapsed) });
                story(`📦 Section arrived: "${t}" (T+${elapsed}s)`);
            }
        }

        // Stop when all expected sections (HEADLINE + KPI SNAPSHOT + TRENDS +
        // RISKS + RECOMMENDED ACTIONS = 5) have arrived OR no progress in 30s
        if (observation.completed.length >= 5 && Date.now() - startMs > 20_000) {
            story("All expected sections rendered. Stopping observation.");
            break;
        }
        if (observation.all.length !== lastCount) {
            lastCount = observation.all.length;
        }
    }

    const totalSec = ((Date.now() - startMs) / 1000).toFixed(1);

    // ─── Report ─────────────────────────────────────────────────────
    console.log("\n━━━ Timeline ━━━");
    console.log(`Total wall time: ${totalSec}s`);
    console.log(`Sections observed: ${arrivals.length}`);
    for (const a of arrivals) {
        console.log(`  T+${a.elapsedSeconds.toFixed(1).padStart(6, " ")}s  ${a.title}`);
    }
    console.log(`\nConsole errors: ${errors.length}`);
    for (const e of errors.slice(0, 5)) console.log(`  - ${e}`);

    story("Demo holding the browser open for 12 more seconds — inspect freely.");
    await pause(page, 12_000);
    await browser.close();
    console.log("\nDone.");
}

main().catch(async (err) => {
    console.error("\n[FATAL]", err.message);
    process.exitCode = 1;
});
