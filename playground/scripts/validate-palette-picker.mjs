#!/usr/bin/env node
// Validate the on-chart palette picker + vibrant default. Asks a question to get
// a donut, screenshots the vibrant default, then switches the palette via the
// on-chart picker and confirms --pp-chart-palette (which buildEChartsOption
// reads) changes + the chart re-skins. ECharts renders to canvas so we assert
// on the CSS var + eyeball the screenshots.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/palette-picker/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const PROFILE = "default";

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 300, args: ["--window-position=60,40", "--window-size=1560,1080"] });
    const ctx = await browser.newContext({ viewport: { width: 1480, height: 980 } });
    const page = await ctx.newPage();

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate((profile) => {
        try { window.localStorage.clear(); } catch { /* */ }
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        window.localStorage.setItem("pulseplay:active-surface", "ask-pulse");
        window.localStorage.setItem("pulseplay:default-landing-surface", "ask-pulse");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile; ex.connectionMode = "proxy"; ex.apiBaseUrl = window.location.origin + "/api";
        window.localStorage.setItem(k, JSON.stringify(ex));
    }, PROFILE);
    await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(2000);

    const readPaletteVar = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--pp-chart-palette").trim());

    let result = { vibrantVar: "", warmVar: "", pickerFound: false, changed: false };
    try {
        await page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first().fill("What is the total sales by region?");
        await page.waitForTimeout(300);
        await page.locator("button.gn-send, button.pp-ai-sidebar__ask").first().click();

        // wait for the donut chart toolbar (palette picker present)
        const picker = page.locator(".gn-chart-palette-select").first();
        await picker.waitFor({ state: "visible", timeout: 120_000 });
        await page.waitForTimeout(2500); // let ECharts paint

        result.vibrantVar = await readPaletteVar();
        result.pickerFound = (await picker.count()) > 0;
        await page.screenshot({ path: join(OUT_DIR, "01-vibrant-default.png") }).catch(() => {});
        console.log("vibrant --pp-chart-palette:", result.vibrantVar);

        // Switch to "warm" via the on-chart picker
        await picker.selectOption("warm");
        await page.waitForTimeout(1800);
        result.warmVar = await readPaletteVar();
        await page.screenshot({ path: join(OUT_DIR, "02-warm.png") }).catch(() => {});
        console.log("warm --pp-chart-palette:", result.warmVar);

        // Switch to "bold"
        await picker.selectOption("bold");
        await page.waitForTimeout(1800);
        await page.screenshot({ path: join(OUT_DIR, "03-bold.png") }).catch(() => {});
        console.log("bold --pp-chart-palette:", await readPaletteVar());

        result.changed = !!result.vibrantVar && !!result.warmVar && result.vibrantVar !== result.warmVar;
        await page.waitForTimeout(1500);
    } finally {
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }
    const verdict = (result.pickerFound && result.changed) ? "PASS" : "FAIL";
    console.log(`\nVERDICT: ${verdict} (pickerFound=${result.pickerFound} varChanged=${result.changed})`);
    console.log(`[done] → ${OUT_DIR}`);
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
