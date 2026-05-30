#!/usr/bin/env node
// Validate canvas drag-to-reposition + resize. Pins 2 chart tiles, then drags
// the first tile's header to a new grid position and resizes it from the corner
// handle, asserting the persisted layout changes. Headed.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/canvas-drag/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const PROFILE = "default";

const layoutOf = (page, i) => page.evaluate((i) => {
    try { return (JSON.parse(localStorage.getItem("pulseplay:canvas-tiles") || "[]")[i] || {}).layout || null; } catch { return null; }
}, i);

async function dragBy(page, box, dx, dy) {
    const cx = box.x + Math.min(box.width / 2, 80);
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
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

    const r = { moved: false, resized: false, tiles: 0 };
    try {
        // pin the same chart twice → 2 tiles
        await page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first().fill("What is the total sales by region?");
        await page.waitForTimeout(300);
        await page.locator("button.gn-send, button.pp-ai-sidebar__ask").first().click();
        const pinBtn = page.locator(".gn-chart-pin").first();
        await pinBtn.waitFor({ state: "visible", timeout: 120_000 });
        await page.waitForTimeout(2500);
        await pinBtn.click();
        await page.waitForTimeout(600);
        await pinBtn.click();
        await page.waitForTimeout(600);

        await page.locator("button", { hasText: /^Dashboard$/i }).first().click();
        await page.waitForTimeout(2500);
        r.tiles = await page.locator(".pp-tile").count();

        // drag tile 0 header right+down
        const before = await layoutOf(page, 0);
        const head = page.locator(".pp-tile__head").first();
        await dragBy(page, await head.boundingBox(), 240, 120);
        await page.waitForTimeout(800);
        const afterMove = await layoutOf(page, 0);
        r.moved = !!before && !!afterMove && (afterMove.x !== before.x || afterMove.y !== before.y);
        console.log("layout move:", JSON.stringify(before), "→", JSON.stringify(afterMove));
        await page.screenshot({ path: join(OUT_DIR, "01-after-move.png") }).catch(() => {});

        // resize tile 0 from the corner handle
        const handle = page.locator(".pp-tile__resize").first();
        await dragBy(page, await handle.boundingBox(), 120, 100);
        await page.waitForTimeout(800);
        const afterResize = await layoutOf(page, 0);
        r.resized = !!afterResize && (afterResize.w !== afterMove.w || afterResize.h !== afterMove.h);
        console.log("layout resize:", JSON.stringify(afterMove), "→", JSON.stringify(afterResize));
        await page.screenshot({ path: join(OUT_DIR, "02-after-resize.png") }).catch(() => {});
        await page.waitForTimeout(1500);
    } finally {
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }
    const verdict = (r.tiles >= 2 && r.moved && r.resized) ? "PASS" : "FAIL";
    console.log(`\nVERDICT: ${verdict} ${JSON.stringify(r)}`);
    console.log(`[done] → ${OUT_DIR}`);
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
