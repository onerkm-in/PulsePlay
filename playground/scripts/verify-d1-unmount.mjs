#!/usr/bin/env node
// Focused live smoke: D1 unmount race should NO LONGER fire after the
// destroy() rAF defer. Exercises both minimize (which triggers a Pulse
// re-render) and Pop-out (which detaches the AI pane). Counts the
// specific console.error + pageerror strings; expects zero of each.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".d1-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 500,
        args: ["--window-position=80,80", "--window-size=1500,1050"] });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();

    const errs = { unmountRace: [], removeChild: [], otherConsoleError: [], otherPageError: [] };
    page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        const t = msg.text();
        if (/synchronously unmount a root while React was already rendering/.test(t)) errs.unmountRace.push(t);
        else if (/Failed to execute 'removeChild'/.test(t)) errs.removeChild.push(t);
        else errs.otherConsoleError.push(t);
    });
    page.on("pageerror", (err) => {
        const m = err.message;
        if (/Failed to execute 'removeChild'/.test(m)) errs.removeChild.push(m);
        else errs.otherPageError.push(m);
    });

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
    await page.waitForTimeout(1200);

    // T1 — click Minimize (the action that fired D1 in prior beast-mode run).
    console.log("[T1] click Minimize");
    await page.locator('[data-testid="pp-top-right-toolbar"] button').nth(1).click().catch(() => {});
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(OUT_DIR, "T1-after-minimize.png"), fullPage: false });

    // T2 — click Restore.
    console.log("[T2] click Restore from dock");
    const restoreBtn = page.locator('[data-testid="pp-screen-dock-slot"] button').first();
    if ((await restoreBtn.count()) > 0) {
        await restoreBtn.click().catch(() => {});
        await page.waitForTimeout(900);
    }

    // T3 — click Pop-out (the OTHER action that fired D1 + removeChild).
    console.log("[T3] click Pop-out");
    await page.locator('[data-testid="pp-top-right-toolbar"] button').nth(4).click().catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(OUT_DIR, "T3-after-popout.png"), fullPage: false });

    // T4 — switch tabs aggressively to trigger more remounts.
    console.log("[T4] switch tabs Ask Pulse → Dashboard → AI Insights");
    await page.locator("#gn-tab-chat").click().catch(() => {});
    await page.waitForTimeout(500);
    await page.locator("#gn-tab-dashboard").click().catch(() => {});
    await page.waitForTimeout(500);
    await page.locator("#gn-tab-insights").click().catch(() => {});
    await page.waitForTimeout(500);

    console.log(`\n[SWEEP] unmount-race console.errors: ${errs.unmountRace.length} (expect 0)`);
    console.log(`[SWEEP] removeChild errors:           ${errs.removeChild.length} (expect 0)`);
    console.log(`[SWEEP] other console.errors:         ${errs.otherConsoleError.length}`);
    console.log(`[SWEEP] other pageerrors:             ${errs.otherPageError.length}`);
    for (const e of errs.otherConsoleError) console.log(`  console.error: ${e.slice(0, 120)}`);
    for (const e of errs.otherPageError) console.log(`  pageerror: ${e.slice(0, 120)}`);

    const passed = errs.unmountRace.length === 0 && errs.removeChild.length === 0;
    console.log(`\n[VERDICT] ${passed ? "✅ PASS — D1 unmount race no longer fires" : "❌ FAIL"}`);

    console.log("[done] closing in 4s");
    await page.waitForTimeout(4000);
    await browser.close();
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
