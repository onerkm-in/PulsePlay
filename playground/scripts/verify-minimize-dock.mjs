#!/usr/bin/env node
// Focused live smoke: TopRightToolbar Minimize → dock appears → Restore returns pane.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".dock-out");
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

    const probe = async () => page.evaluate(() => ({
        dockSlot:    document.querySelectorAll('[data-testid="pp-screen-dock-slot"]').length,
        mixSurface:  document.body.outerHTML.includes('data-bi-surface-mode'),
        enabled:     window.localStorage.getItem("pulseplay:enabled-components"),
    }));

    // T1 — initial state (no dock).
    let s = await probe();
    console.log(`[T1] initial: dock=${s.dockSlot} (expect 0)  enabledStored=${s.enabled}`);
    await page.screenshot({ path: join(OUT_DIR, "T1-initial.png"), fullPage: false });

    // T2 — click Minimize button (button index 1 in TopRightToolbar).
    await page.locator('[data-testid="pp-top-right-toolbar"] button').nth(1).click().catch(() => {});
    await page.waitForTimeout(900);
    s = await probe();
    console.log(`[T2] after Minimize: dock=${s.dockSlot} (expect 1)  enabledStored=${s.enabled}`);
    await page.screenshot({ path: join(OUT_DIR, "T2-after-minimize.png"), fullPage: false });
    const minimizeOK = s.dockSlot === 1;
    console.log(`[T2] Dock mounted: ${minimizeOK ? "✅ PASS" : "❌ FAIL"}`);

    // T3 — find the dock's Restore affordance and click it.
    const restoreBtn = page.locator('[data-testid="pp-screen-dock-slot"] button').first();
    if ((await restoreBtn.count()) > 0) {
        await restoreBtn.click().catch(() => {});
        await page.waitForTimeout(900);
        s = await probe();
        console.log(`[T3] after Restore click: dock=${s.dockSlot} (expect 0)  enabledStored=${s.enabled}`);
        await page.screenshot({ path: join(OUT_DIR, "T3-after-restore.png"), fullPage: false });
        const restoreOK = s.dockSlot === 0;
        console.log(`[T3] Dock dismissed: ${restoreOK ? "✅ PASS" : "❌ FAIL"}`);
        console.log(`\n[VERDICT] ${minimizeOK && restoreOK ? "✅ ALL PASS" : "❌ FAIL"}`);
    } else {
        console.log(`[T3] ❌ FAIL: no Restore button found in dock-slot`);
    }

    console.log("[done] closing in 4s");
    await page.waitForTimeout(4000);
    await browser.close();
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
