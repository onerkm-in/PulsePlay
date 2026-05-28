#!/usr/bin/env node
// Snapshot the current end-user UI in 3 states so we can SEE what's broken.
//   1. Home / fresh load (default uiMode=pulse, no localStorage)
//   2. Ask Pulse tab (clicked)
//   3. AI Insights tab (clicked)
// Headed, slow-mo. Full-page screenshots.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const OUT = "d:/Working_Folder/Projects/PulsePlay/docs/evidence/ui-snapshot-2026-05-26";
const BASE = "http://127.0.0.1:7001";

async function main() {
    await mkdir(OUT, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 300 });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    page.on("pageerror", e => console.log("[pageerror]", e.message.slice(0, 160)));
    page.on("console", m => { if (m.type() === "error") console.log("[console.err]", m.text().slice(0, 160)); });

    // ── 1. Fresh home, default state ─────────────────────────
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(OUT, "01-home-default.png"), fullPage: false });
    await page.screenshot({ path: join(OUT, "01-home-default-FULL.png"), fullPage: true });
    const dom1 = await page.evaluate(() => ({
        bodyTextStart: (document.body.innerText || "").slice(0, 600),
        tabButtons: Array.from(document.querySelectorAll('button')).map(b => (b.textContent || "").trim()).filter(t => t.length > 0 && t.length < 40).slice(0, 30),
        gnHost: document.querySelectorAll('.gn-host-stub,.gn-app,.gn-root,.gn-tab-strip').length,
        chrome: document.querySelectorAll('[data-testid="pp-panel-chrome-ai"], [data-testid="pp-panel-chrome-bi"]').length,
        v0Surface: document.querySelectorAll('.pp-ai-sidebar').length,
        viewportH: window.innerHeight,
        viewportW: window.innerWidth,
    }));
    console.log("[1] HOME default:", JSON.stringify(dom1, null, 2));

    // ── 2. Click Ask Pulse tab ───────────────────────────────
    const askTab = page.locator('button:has-text("Ask Pulse")').first();
    if (await askTab.count() > 0) {
        await askTab.click();
        await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: join(OUT, "02-ask-pulse-tab.png"), fullPage: false });
    await page.screenshot({ path: join(OUT, "02-ask-pulse-tab-FULL.png"), fullPage: true });
    const dom2 = await page.evaluate(() => ({
        bodyTextStart: (document.body.innerText || "").slice(0, 500),
        composer: document.querySelectorAll('textarea').length,
        gnInput: document.querySelectorAll('.gn-input').length,
        gnSend: document.querySelectorAll('.gn-send').length,
        gnChatPanel: document.querySelectorAll('.gn-chat-panel').length,
    }));
    console.log("[2] ASK PULSE tab:", JSON.stringify(dom2, null, 2));

    // ── 3. Click AI Insights tab ─────────────────────────────
    const insTab = page.locator('button:has-text("AI Insights")').first();
    if (await insTab.count() > 0) {
        await insTab.click();
        await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: join(OUT, "03-ai-insights-tab.png"), fullPage: false });
    await page.screenshot({ path: join(OUT, "03-ai-insights-tab-FULL.png"), fullPage: true });
    const dom3 = await page.evaluate(() => ({ bodyTextStart: (document.body.innerText || "").slice(0, 500) }));
    console.log("[3] AI INSIGHTS tab:", JSON.stringify(dom3, null, 2));

    // ── 4. Click Dashboard tab ─────────────────────────────
    const dashTab = page.locator('button:has-text("Dashboard")').first();
    if (await dashTab.count() > 0) {
        await dashTab.click();
        await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: join(OUT, "04-dashboard-tab.png"), fullPage: false });

    await browser.close();
    console.log(`[done] → ${OUT}`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
