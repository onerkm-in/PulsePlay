#!/usr/bin/env node
// Validate that a pinned tile is a self-contained, refreshable BI element:
// (1) Refresh re-runs the bound SQL against the connector (proxy /sql/preview)
// and updates the tile to "live". (2) Edit query lets the end user modify the
// SQL and re-run it. Headed.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/tile-refresh/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const PROFILE = "default";

async function banner(page, text, color = "#06b6d4") {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__wt__");
        if (!b) { b = document.createElement("div"); b.id = "__wt__"; document.body.appendChild(b); }
        Object.assign(b.style, { position: "fixed", top: "8px", left: "8px", right: "8px", zIndex: "99999", padding: "10px 14px", background: "rgba(15,23,42,0.95)", color: "#fff", font: "14px ui-monospace", borderRadius: "6px", pointerEvents: "none", borderLeft: `5px solid ${color}` });
        b.textContent = text;
    }, { text, color });
}
const footText = (page) => page.evaluate(() => document.querySelector(".pp-tile__snapshot")?.textContent || "");
const hasError = (page) => page.evaluate(() => !!document.querySelector(".pp-tile__status--error"));
const firstCell = (page) => page.evaluate(() => {
    try { const t = JSON.parse(localStorage.getItem("pulseplay:canvas-tiles") || "[]")[0]; return t ? String((t.rows[0] || [])[0]) : ""; } catch { return ""; }
});

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 350, args: ["--window-position=60,40", "--window-size=1560,1080"] });
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

    const r = { refreshLive: false, refreshNoError: false, editRan: false, dataChanged: false };
    try {
        // pin a chart
        await page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first().fill("What is the total sales by region?");
        await page.waitForTimeout(300);
        await page.locator("button.gn-send, button.pp-ai-sidebar__ask").first().click();
        const pinBtn = page.locator(".gn-chart-pin").first();
        await pinBtn.waitFor({ state: "visible", timeout: 120_000 });
        await page.waitForTimeout(2500);
        await pinBtn.click();
        await page.waitForTimeout(800);

        // go to Dashboard
        await page.locator("button", { hasText: /^Dashboard$/i }).first().click();
        await page.waitForTimeout(2500);
        const beforeFoot = await footText(page);
        const beforeCell = await firstCell(page);
        console.log("before refresh — footer:", beforeFoot, "| first cell:", beforeCell);

        // 1. Refresh
        await banner(page, "Tile · clicking Refresh — re-runs the bound SQL on the connector…", "#06b6d4");
        await page.locator(".pp-tile__btn[title='Refresh from the connector']").first().click();
        await page.waitForTimeout(16000); // live query
        r.refreshNoError = !(await hasError(page));
        r.refreshLive = (await footText(page)).toLowerCase().includes("live");
        console.log("after refresh — footer:", await footText(page), "| error:", !r.refreshNoError);
        await page.screenshot({ path: join(OUT_DIR, "01-after-refresh.png") }).catch(() => {});

        // 2. Edit query — flip ORDER BY DESC -> ASC and run
        await banner(page, "Tile · Edit query — modify the SQL and Run…", "#a855f7");
        await page.locator(".pp-tile__btn[title='Edit query']").first().click();
        await page.waitForTimeout(800);
        const ta = page.locator(".pp-tile__sql").first();
        const cur = await ta.inputValue();
        const edited = cur.includes("DESC") ? cur.replace("DESC", "ASC") : cur.replace(";", " ORDER BY 1 ASC");
        await ta.fill(edited);
        await page.waitForTimeout(400);
        await page.locator(".pp-tile__run").first().click();
        await page.waitForTimeout(6000);
        r.editRan = !(await hasError(page)) && (await page.locator(".pp-tile__sql").count()) === 0; // editor closed = success
        const afterCell = await firstCell(page);
        r.dataChanged = !!afterCell && afterCell !== beforeCell;
        console.log("after edit-run — first cell:", afterCell, "(was", beforeCell + ")");
        await page.screenshot({ path: join(OUT_DIR, "02-after-edit.png") }).catch(() => {});
        await page.waitForTimeout(2000);
    } finally {
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }
    const verdict = (r.refreshLive && r.refreshNoError && r.editRan) ? "PASS" : "FAIL";
    console.log(`\nVERDICT: ${verdict} ${JSON.stringify(r)}`);
    console.log(`[done] → ${OUT_DIR}`);
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
