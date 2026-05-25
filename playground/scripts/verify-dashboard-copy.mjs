#!/usr/bin/env node
// Focused live smoke for the Dashboard empty-state copy fix.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".dash-copy-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 350,
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
    await page.waitForTimeout(1000);

    // Switch to Dashboard tab.
    await page.locator("#gn-tab-dashboard").click().catch(() => {});
    await page.waitForTimeout(900);

    const obs = await page.evaluate(() => {
        const t = (document.body.textContent || "").toLowerCase();
        return {
            hasOrphanOldCopy: t.includes("ask pulse a question to render"),
            hasNewCopy: t.includes("ai chart canvas"),
            hasNewExplainer: t.includes("open the") && t.includes("tab and ask a question"),
            hasNativeResultCanvasOld: t.includes("native result canvas") && t.includes("ask pulse a question"),
        };
    });
    console.log(`[dash] OLD copy ("ask pulse a question to render"): ${obs.hasOrphanOldCopy} (expect false)`);
    console.log(`[dash] NEW headline ("AI chart canvas"): ${obs.hasNewCopy} (expect true)`);
    console.log(`[dash] NEW explainer ("Open the ... tab and ask a question"): ${obs.hasNewExplainer} (expect true)`);
    console.log(`[dash] OLD orphan combo still present: ${obs.hasNativeResultCanvasOld} (expect false)`);
    const passed = !obs.hasOrphanOldCopy && obs.hasNewCopy && obs.hasNewExplainer;
    console.log(`[dash] VERDICT: ${passed ? "✅ PASS" : "❌ FAIL"}`);
    await page.screenshot({ path: join(OUT_DIR, "dashboard-AFTER.png"), fullPage: false });
    console.log("[done] closing in 4s");
    await page.waitForTimeout(4000);
    await browser.close();
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
