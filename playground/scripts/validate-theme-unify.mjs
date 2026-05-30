#!/usr/bin/env node
// Prove Step-1 theme unification: switching the theme preset now re-skins BOTH
// the workbench (--gn-*) AND the native --pp-* surfaces (Settings/shell), which
// previously only the workbench picked up. Reads the live :root custom props
// and screenshots the native Settings surface per theme.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/theme-unify/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";

async function setTheme(page, themeName) {
    await page.evaluate((name) => {
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.themeName = name;
        window.localStorage.setItem(k, JSON.stringify(ex));
        window.dispatchEvent(new CustomEvent("pulseplay:visual-settings-change"));
    }, themeName);
    await page.waitForTimeout(600);
}
async function readVars(page) {
    return page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        return {
            ppAccent: cs.getPropertyValue("--pp-accent").trim(),
            gnAccent: cs.getPropertyValue("--gn-accent").trim(),
            ppBg: cs.getPropertyValue("--pp-bg").trim(),
        };
    });
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 300, args: ["--window-position=60,40", "--window-size=1560,1080"] });
    const ctx = await browser.newContext({ viewport: { width: 1480, height: 900 } });
    const page = await ctx.newPage();
    const results = [];

    await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(1800);

    for (const theme of ["default", "forest", "corporate-blue", "high-contrast", "custom"]) {
        await setTheme(page, theme);
        await page.waitForTimeout(700);
        const v = await readVars(page);
        results.push({ theme, ...v });
        console.log(`${theme.padEnd(16)} --pp-accent=${v.ppAccent.padEnd(22)} --gn-accent=${v.gnAccent}`);
        await page.evaluate((t) => {
            let b = document.getElementById("__tw__");
            if (!b) { b = document.createElement("div"); b.id = "__tw__"; document.body.appendChild(b); }
            Object.assign(b.style, { position: "fixed", top: "8px", left: "8px", right: "8px", zIndex: "99999", padding: "10px 14px", background: "rgba(15,23,42,0.95)", color: "#fff", font: "14px ui-monospace", borderRadius: "6px", pointerEvents: "none" });
            b.textContent = `Native Settings surface · theme = ${t} (watch the accent re-skin)`;
        }, theme);
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(OUT_DIR, `${theme}.png`) }).catch(() => {});
    }

    // PASS if forest (green) and corporate-blue differ on the NATIVE --pp-accent.
    const forest = results.find(r => r.theme === "forest")?.ppAccent || "";
    const corp = results.find(r => r.theme === "corporate-blue")?.ppAccent || "";
    const verdict = (forest && corp && forest !== corp) ? "PASS" : "FAIL";
    console.log(`\nVERDICT: ${verdict} (native --pp-accent distinct per preset: forest=${forest} corporate=${corp})`);
    await page.waitForTimeout(1500);
    await ctx.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    console.log(`[done] → ${OUT_DIR}`);
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
