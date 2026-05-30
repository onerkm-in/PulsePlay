#!/usr/bin/env node
// Focused live smoke: TopRightToolbar labels update when Pulse-internal tab switches.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".toolbar-label-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 500,
        args: ["--window-position=80,80", "--window-size=1500,1050"] });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
        window.localStorage.setItem("pulseplay:active-ai-profile", "default");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = "default";
        window.localStorage.setItem(k, JSON.stringify(ex));
        window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({ aiInsights: true, askPulse: true, dashboard: true }));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1100);

    const readLabels = async (tabName) => {
        return await page.evaluate(() => {
            const tb = document.querySelector('[data-testid="pp-top-right-toolbar"]');
            return Array.from(tb?.querySelectorAll("button") || []).map(b => b.getAttribute("aria-label") || "");
        });
    };

    // T1 — initial state (should be AI Insights on cold load).
    let labels = await readLabels();
    console.log(`[T1] initial labels: ${JSON.stringify(labels)}`);
    const initOk = labels[0]?.includes("AI Insights");
    console.log(`[T1] initial Maximize label includes "AI Insights": ${initOk ? "✅" : "❌"}`);
    await page.screenshot({ path: join(OUT_DIR, "T1-initial-AI-Insights.png"), fullPage: false });

    // T2 — click Ask Pulse tab.
    await page.locator("#gn-tab-chat").click().catch(() => {});
    await page.waitForTimeout(800);
    labels = await readLabels();
    console.log(`[T2] after clicking Ask Pulse tab: ${JSON.stringify(labels)}`);
    const askOk = labels[0]?.includes("Ask Pulse");
    console.log(`[T2] Maximize label includes "Ask Pulse": ${askOk ? "✅" : "❌"} (was "AI Insights" before fix)`);
    await page.screenshot({ path: join(OUT_DIR, "T2-after-Ask-Pulse.png"), fullPage: false });

    // T3 — click AI Insights tab back.
    await page.locator("#gn-tab-insights").click().catch(() => {});
    await page.waitForTimeout(800);
    labels = await readLabels();
    console.log(`[T3] after clicking AI Insights tab: ${JSON.stringify(labels)}`);
    const aiOk = labels[0]?.includes("AI Insights");
    console.log(`[T3] Maximize label includes "AI Insights": ${aiOk ? "✅" : "❌"}`);
    await page.screenshot({ path: join(OUT_DIR, "T3-after-AI-Insights.png"), fullPage: false });

    // T4 — click Dashboard tab.
    await page.locator("#gn-tab-dashboard").click().catch(() => {});
    await page.waitForTimeout(800);
    labels = await readLabels();
    console.log(`[T4] after clicking Dashboard tab: ${JSON.stringify(labels)}`);
    const dashOk = labels[0]?.includes("Dashboard");
    console.log(`[T4] Maximize label includes "Dashboard": ${dashOk ? "✅" : "❌"}`);
    await page.screenshot({ path: join(OUT_DIR, "T4-after-Dashboard.png"), fullPage: false });

    const allOk = initOk && askOk && aiOk && dashOk;
    console.log(`\n[VERDICT] ${allOk ? "✅ ALL PASS — toolbar labels track active tab dynamically" : "❌ FAIL"}`);

    console.log("[done] closing in 4s");
    await page.waitForTimeout(4000);
    await browser.close();
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
