#!/usr/bin/env node
// Validate the floating pop-out panel bezel: lean (thin ~1px border), translucent
// (background alpha < 1), and theme-aware (dark in dark mode). Pops the panel out
// and inspects it in light + dark.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/float-panel/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const PROFILE = "default";

const readPanel = (page) => page.evaluate(() => {
    const el = document.querySelector(".pp-float-panel");
    if (!el) return null;
    const cs = getComputedStyle(el);
    const m = (cs.backgroundColor || "").match(/rgba?\(([^)]+)\)/);
    const parts = m ? m[1].split(",").map(s => parseFloat(s.trim())) : [];
    const alpha = parts.length > 3 ? parts[3] : 1;
    return { borderTop: cs.borderTopWidth, bg: cs.backgroundColor, alpha, backdrop: cs.backdropFilter || cs.webkitBackdropFilter };
});

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 300, args: ["--window-position=60,40", "--window-size=1560,1080"] });
    const ctx = await browser.newContext({ viewport: { width: 1480, height: 920 } });
    const page = await ctx.newPage();
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

    let light = null, dark = null;
    try {
        // Pop out the AI pane
        await page.getByRole("button", { name: /Pop out .* tab as window/ }).first().click().catch(() => {});
        await page.waitForTimeout(1200);
        await page.locator(".pp-float-panel").first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
        light = await readPanel(page);
        console.log("light panel:", JSON.stringify(light));
        await page.screenshot({ path: join(OUT_DIR, "01-light.png") }).catch(() => {});

        // dark
        await page.evaluate(() => {
            const k = "pulseplay:visual-settings:genieSettings";
            const ex = JSON.parse(localStorage.getItem(k) || "{}"); ex.darkMode = true;
            localStorage.setItem(k, JSON.stringify(ex));
            window.dispatchEvent(new CustomEvent("pulseplay:visual-settings-change"));
        });
        await page.waitForTimeout(900);
        dark = await readPanel(page);
        console.log("dark panel: ", JSON.stringify(dark));
        await page.screenshot({ path: join(OUT_DIR, "02-dark.png") }).catch(() => {});
        await page.waitForTimeout(1500);
    } finally {
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }
    const thin = light && parseFloat(light.borderTop) <= 1.5;
    const translucentLight = light && light.alpha < 1;
    const translucentDark = dark && dark.alpha < 1;
    const darkNotWhite = dark && !/255, 255, 255/.test(dark.bg);
    const verdict = (thin && translucentLight && translucentDark && darkNotWhite) ? "PASS" : "FAIL";
    console.log(`\nVERDICT: ${verdict} (thinBorder=${thin} translucentLight=${translucentLight} translucentDark=${translucentDark} darkNotWhite=${darkNotWhite})`);
    console.log(`[done] → ${OUT_DIR}`);
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
