#!/usr/bin/env node
// Validate the re-skinned window-controls toolbar: (a) each of the 5 actions
// dispatches its viewport-action event, (b) it blends in light AND dark (themed
// pill, not a white box). Headed.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/toolbar/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const PROFILE = "default";

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 300, args: ["--window-position=60,40", "--window-size=1560,1080"] });
    const ctx = await browser.newContext({ viewport: { width: 1480, height: 920 } });
    // capture viewport-action events from the page
    await ctx.addInitScript(() => {
        window.__vp = [];
        window.addEventListener("pulseplay:viewport-action", (e) => window.__vp.push(e.detail?.action));
    });
    const page = await ctx.newPage();
    // close any popups opened by open-page / pop-out
    ctx.on("page", (p) => { if (p !== page) p.close().catch(() => {}); });

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate((profile) => {
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        window.localStorage.setItem("pulseplay:default-landing-surface", "ai-insights");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile; ex.connectionMode = "proxy"; ex.apiBaseUrl = window.location.origin + "/api";
        window.localStorage.setItem(k, JSON.stringify(ex));
    }, PROFILE);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(2000);

    try {
        await page.screenshot({ path: join(OUT_DIR, "01-light.png") }).catch(() => {});
        // Click the non-destructive ones first (don't change the toolbar): Pin, Open, Pop-out, Minimize, Maximize
        await page.getByRole("button", { name: /^Pin .* tab as default$/ }).first().click().catch(() => {});
        await page.waitForTimeout(400);
        await page.getByRole("button", { name: /Open .* tab in separate page/ }).first().click().catch(() => {});
        await page.waitForTimeout(400);
        await page.getByRole("button", { name: /Pop out .* tab as window/ }).first().click().catch(() => {});
        await page.waitForTimeout(400);
        await page.getByRole("button", { name: /Minimize .* tab/ }).first().click().catch(() => {});
        await page.waitForTimeout(600);
        // Minimize may dock the pane; restore so the Maximize button is present
        const showAll = page.getByRole("button", { name: /Show all panels/ }).first();
        if (await showAll.count() > 0) { await showAll.click().catch(() => {}); await page.waitForTimeout(400); }
        await page.getByRole("button", { name: /Maximize .* tab/ }).first().click().catch(() => {});
        await page.waitForTimeout(600);

        const actions = await page.evaluate(() => window.__vp.slice());
        console.log("viewport-actions fired:", JSON.stringify(actions));
        const need = ["pin", "open-page", "float", "minimize", "focus"];
        const missing = need.filter(a => !actions.includes(a));
        // dark-mode blend screenshot
        await page.evaluate(() => {
            const k = "pulseplay:visual-settings:genieSettings";
            const ex = JSON.parse(localStorage.getItem(k) || "{}"); ex.darkMode = true;
            localStorage.setItem(k, JSON.stringify(ex));
            window.dispatchEvent(new CustomEvent("pulseplay:visual-settings-change"));
        });
        await page.waitForTimeout(900);
        await page.screenshot({ path: join(OUT_DIR, "02-dark.png") }).catch(() => {});
        // read toolbar bg in dark to confirm it's NOT white
        const bg = await page.evaluate(() => {
            const el = document.querySelector(".pp-top-right-toolbar");
            return el ? getComputedStyle(el).backgroundColor : "";
        });
        console.log("toolbar dark bg:", bg);
        const notWhite = !/255, 255, 255/.test(bg);
        const verdict = (missing.length === 0 && notWhite) ? "PASS" : "FAIL";
        console.log(`\nVERDICT: ${verdict} (actions fired=${actions.length}, missing=[${missing}], dark-bg-not-white=${notWhite})`);
        await page.waitForTimeout(1500);
    } finally {
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }
    console.log(`[done] → ${OUT_DIR}`);
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
