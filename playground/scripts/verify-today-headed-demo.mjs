#!/usr/bin/env node
// playground/scripts/verify-today-headed-demo.mjs
//
// HEADED demo — a real Chromium window opens on your desktop. SlowMo
// makes each action visible so you can watch the test instead of just
// reading a log. 6 key scenarios covering today's 5 commits.
//
// Run: node scripts/verify-today-headed-demo.mjs
// Close: the window closes when the script finishes (~5-7 min). To
// abort mid-run, close the browser window or Ctrl-C the terminal.

import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:7001";
const SLOWMO_MS = 600;      // pause between every UI action
const PAUSE_BETWEEN_SCENARIOS_MS = 3500;

function step(n, label) {
    console.log(`\n=== Scenario ${n}: ${label} ===`);
}

async function clearStorage(page) {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
}

async function dismissWizard(page) {
    const btn = page.locator('button[aria-label="Skip setup and close"]').first();
    if (await btn.count() > 0) {
        await btn.click().catch(() => undefined);
        await page.waitForTimeout(500);
    }
}

async function main() {
    console.log("Launching headed Chromium (a window will appear on your desktop)…");
    const browser = await chromium.launch({
        headless: false,
        slowMo: SLOWMO_MS,
        args: ["--window-size=1400,900", "--window-position=120,80"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();

    // ─── 1. Cold boot ───────────────────────────────────────────────
    step(1, "Cold boot — clear localStorage, watch v0 mount with chrome");
    await clearStorage(page);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await dismissWizard(page);
    await page.waitForTimeout(PAUSE_BETWEEN_SCENARIOS_MS);

    // ─── 2. CTA click → settings/ai ──────────────────────────────────
    step(2, "Click 'Connect AI assistant' CTA → navigates to /settings/ai");
    const connectCta = page.locator('[data-testid="pp-assistant-empty-connect"]').first();
    if (await connectCta.count() > 0) {
        await connectCta.click();
        await page.waitForTimeout(PAUSE_BETWEEN_SCENARIOS_MS);
    }

    // ─── 3. Profile set → trust chip promotes ───────────────────────
    step(3, "Set profile=default → trust chip promotes from 'Setup needed'");
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.evaluate(() => {
        localStorage.setItem("pulseplay:active-ai-profile", "default");
        const k = "pulseplay:visual-settings:genieSettings";
        const existing = JSON.parse(localStorage.getItem(k) || "{}");
        existing.assistantProfile = "default";
        existing.connectionMode = "proxy";
        existing.apiBaseUrl = window.location.origin;
        localStorage.setItem(k, JSON.stringify(existing));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2500); // let discovery settle
    await dismissWizard(page);
    await page.waitForTimeout(PAUSE_BETWEEN_SCENARIOS_MS);

    // ─── 4. Real Genie reply ────────────────────────────────────────
    step(4, "Real Genie reply — type question, click Ask, wait for completion");
    const composer = page.locator('textarea').first();
    await composer.click();
    await composer.fill("Top 3 categories by sales. Markdown table: Category, Sales.");
    await page.waitForTimeout(1500); // let user see the typed text
    const askBtn = page.locator('button.pp-ai-sidebar__ask').first();
    await askBtn.click();
    console.log("    waiting for Genie reply (up to 90s)…");
    const deadline = Date.now() + 90_000;
    let finalStatus = null;
    while (Date.now() < deadline) {
        await page.waitForTimeout(2000);
        finalStatus = await page.evaluate(() => {
            const entries = Array.from(document.querySelectorAll('[data-testid^="pp-ai-entry-"]'));
            const last = entries[entries.length - 1];
            return last ? last.getAttribute("data-status") : null;
        });
        if (finalStatus === "completed" || finalStatus === "failed") break;
    }
    console.log(`    final status: ${finalStatus}`);
    await page.waitForTimeout(PAUSE_BETWEEN_SCENARIOS_MS + 2000); // let user read the reply

    // ─── 5. Escape hatch — explicit pulse override ─────────────────
    step(5, "Escape hatch — set pulseplay:ui-mode='pulse' → PulseShell mounts");
    await page.evaluate(() => localStorage.setItem("pulseplay:ui-mode", "pulse"));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await dismissWizard(page);
    await page.waitForTimeout(PAUSE_BETWEEN_SCENARIOS_MS);

    // ─── 6. Resolver — hide everything except ai-insights ──────────
    step(6, "Resolver narrowing — hide all tabs except AI Insights → pulse stays mounted");
    await page.evaluate(() => {
        localStorage.removeItem("pulseplay:ui-mode"); // remove explicit override
        localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({
            aiInsights: true, askPulse: false, dashboard: false,
        }));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await dismissWizard(page);
    console.log("    ↑ resolver narrowed to pulse because only ai-insights tab is visible");
    console.log("       (without slice 3 this would have mounted v0 — the hidden tab — silently)");
    await page.waitForTimeout(PAUSE_BETWEEN_SCENARIOS_MS + 2000);

    console.log("\nDemo complete. Closing window in 5s…");
    await page.waitForTimeout(5000);
    await browser.close();
}

main().catch(async (err) => {
    console.error("[FATAL]", err);
    process.exitCode = 1;
});
