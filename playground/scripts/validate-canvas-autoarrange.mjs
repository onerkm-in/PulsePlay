#!/usr/bin/env node
// Validate collision-aware auto-arrange: drag one tile ONTO another and confirm
// they do NOT overlap afterwards (the other tile reflows out of the way).

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/canvas-autoarrange/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const PROFILE = "default";

const layouts = (page) => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("pulseplay:canvas-tiles") || "[]").map(t => t.layout); } catch { return []; }
});
const overlap = (a, b) => a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

async function dragBy(page, box, dx, dy) {
    const cx = box.x + Math.min(box.width / 2, 80);
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx, cy + dy, { steps: 10 });
    await page.mouse.up();
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 250, args: ["--window-position=60,40", "--window-size=1560,1080"] });
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

    const r = { tiles: 0, overlapBefore: false, overlapAfter: true, reflowed: false };
    try {
        await page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first().fill("What is the total sales by region?");
        await page.waitForTimeout(300);
        await page.locator("button.gn-send, button.pp-ai-sidebar__ask").first().click();
        const pinBtn = page.locator(".gn-chart-pin").first();
        await pinBtn.waitFor({ state: "visible", timeout: 120_000 });
        await page.waitForTimeout(2500);
        await pinBtn.click(); await page.waitForTimeout(500);
        await pinBtn.click(); await page.waitForTimeout(500);

        await page.locator("button", { hasText: /^Dashboard$/i }).first().click();
        await page.waitForTimeout(2500);
        r.tiles = await page.locator(".pp-tile").count();
        const before = await layouts(page);
        r.overlapBefore = overlap(before[0], before[1]);
        console.log("before:", JSON.stringify(before));

        // Drag the SECOND tile's header far LEFT + up, onto the first tile.
        const head2 = page.locator(".pp-tile__head").nth(1);
        await dragBy(page, await head2.boundingBox(), -560, -40);
        await page.waitForTimeout(900);
        const after = await layouts(page);
        r.overlapAfter = overlap(after[0], after[1]);
        r.reflowed = JSON.stringify(after) !== JSON.stringify(before);
        console.log("after: ", JSON.stringify(after), "overlap:", r.overlapAfter);
        await page.screenshot({ path: join(OUT_DIR, "01-after-dragonto.png") }).catch(() => {});
        await page.waitForTimeout(1500);
    } finally {
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }
    const verdict = (r.tiles >= 2 && r.reflowed && !r.overlapAfter) ? "PASS" : "FAIL";
    console.log(`\nVERDICT: ${verdict} ${JSON.stringify(r)}`);
    console.log(`[done] → ${OUT_DIR}`);
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
