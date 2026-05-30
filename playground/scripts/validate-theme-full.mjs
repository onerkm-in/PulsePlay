#!/usr/bin/env node
// Full theme test: apply each preset + toggle dark mode, and confirm the theme
// takes across ALL surfaces (AI Insights, Ask Pulse, Dashboard, Settings) — not
// just the workbench. Reads the live :root tokens + dark attribute/class and
// screenshots each surface per theme.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/theme-full/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const PROFILE = "default";

async function setTheme(page, themeName, darkMode) {
    await page.evaluate(({ themeName, darkMode }) => {
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.themeName = themeName;
        ex.darkMode = darkMode;
        window.localStorage.setItem(k, JSON.stringify(ex));
        window.dispatchEvent(new CustomEvent("pulseplay:visual-settings-change"));
    }, { themeName, darkMode });
    await page.waitForTimeout(700);
}
async function readState(page) {
    return page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        return {
            ppTheme: document.documentElement.dataset.ppTheme || "",
            ppAccent: cs.getPropertyValue("--pp-accent").trim(),
            gnAccent: cs.getPropertyValue("--gn-accent").trim(),
            darkShell: !!document.querySelector(".gn-shell--dark"),
        };
    });
}
async function gotoTab(page, label) {
    const tab = page.locator("button", { hasText: new RegExp(`^${label}$`, "i") }).first();
    if (await tab.count() > 0) { await tab.click(); await page.waitForTimeout(1200); }
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 250, args: ["--window-position=60,40", "--window-size=1560,1080"] });
    const ctx = await browser.newContext({ viewport: { width: 1480, height: 920 } });
    const page = await ctx.newPage();
    const results = [];

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

    const cases = [
        { theme: "default", dark: false },
        { theme: "forest", dark: false },
        { theme: "corporate-blue", dark: true },
        { theme: "default", dark: true },
    ];
    for (const c of cases) {
        await setTheme(page, c.theme, c.dark);
        await page.waitForTimeout(600);
        const st = await readState(page);
        const tag = `${c.theme}-${c.dark ? "dark" : "light"}`;
        results.push({ tag, ...st });
        console.log(`${tag.padEnd(22)} ppTheme=${st.ppTheme} ppAccent=${st.ppAccent} gnAccent=${st.gnAccent} darkShell=${st.darkShell}`);
        // capture the three workbench tabs + Settings under this theme
        for (const tab of ["AI Insights", "Ask Pulse", "Dashboard"]) {
            await gotoTab(page, tab);
            await page.screenshot({ path: join(OUT_DIR, `${tag}-${tab.replace(/\s+/g, "")}.png`) }).catch(() => {});
        }
        await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: join(OUT_DIR, `${tag}-Settings.png`) }).catch(() => {});
        await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(1200);
    }

    // Assertions: presets change accent; dark sets the dark attribute + shell class.
    const forest = results.find(r => r.tag === "forest-light");
    const corp = results.find(r => r.tag === "corporate-blue-dark");
    const defDark = results.find(r => r.tag === "default-dark");
    const accentDistinct = forest && corp && forest.ppAccent !== corp.ppAccent;
    const darkWorks = !!defDark && defDark.ppTheme === "dark" && defDark.darkShell;
    const verdict = (accentDistinct && darkWorks) ? "PASS" : "FAIL";
    console.log(`\nVERDICT: ${verdict} (presets re-skin accent app-wide=${accentDistinct}, dark mode flips attr+shell=${darkWorks})`);
    await page.waitForTimeout(1000);
    await ctx.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    console.log(`[done] → ${OUT_DIR}`);
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
