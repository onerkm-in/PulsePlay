#!/usr/bin/env node
// Quick live smoke: Pop-out should mirror the main pane (not relocate).
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".mirror-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 600,
        args: ["--window-position=80,80", "--window-size=1500,1050"] });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    page.on("pageerror", (err) => console.log(`[pageerror] ${err.message.slice(0, 100)}`));

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
        window.localStorage.setItem("pulseplay:active-ai-profile", "default");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = "default";
        window.localStorage.setItem(k, JSON.stringify(ex));
        window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({ aiInsights: true, askPulse: true, dashboard: true }));
        window.localStorage.removeItem("pulseplay:active-surface");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);

    // T1 — baseline: AI pane visible in main slot.
    const before = await page.evaluate(() => ({
        aiChrome: document.querySelectorAll('[data-testid="pp-panel-chrome-ai"]').length,
        biChrome: document.querySelectorAll('[data-testid="pp-panel-chrome-bi"]').length,
        floatSlot: document.querySelectorAll('[data-testid="pp-screen-floating-slot"]').length,
    }));
    console.log(`[T1 before] aiChrome=${before.aiChrome} biChrome=${before.biChrome} float=${before.floatSlot}`);
    await page.screenshot({ path: join(OUT_DIR, "T1-before-popout.png"), fullPage: false });

    // T2 — click Pop-out (5th toolbar button).
    await page.locator('[data-testid="pp-top-right-toolbar"] button').nth(4).click().catch(() => {});
    await page.waitForTimeout(1200);

    const after = await page.evaluate(() => ({
        aiChrome: document.querySelectorAll('[data-testid="pp-panel-chrome-ai"]').length,
        biChrome: document.querySelectorAll('[data-testid="pp-panel-chrome-bi"]').length,
        floatSlot: document.querySelectorAll('[data-testid="pp-screen-floating-slot"]').length,
    }));
    console.log(`[T2 after Pop-out] aiChrome=${after.aiChrome} biChrome=${after.biChrome} float=${after.floatSlot}`);
    await page.screenshot({ path: join(OUT_DIR, "T2-after-popout-mirrored.png"), fullPage: false });

    // EXPECTED with mirroring: aiChrome went from 1 → 2 (one in main, one in float)
    //                          floatSlot went from 0 → 1
    const mirroringOK = after.aiChrome >= 2 && after.floatSlot === 1;
    console.log(`\n[VERDICT] Mirroring works: ${mirroringOK ? "✅ PASS" : "❌ FAIL"} (aiChrome went from ${before.aiChrome} to ${after.aiChrome}, float slot ${before.floatSlot} → ${after.floatSlot})`);

    console.log("[done] closing in 5s");
    await page.waitForTimeout(5000);
    await browser.close();
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
