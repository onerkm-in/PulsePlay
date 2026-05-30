#!/usr/bin/env node
// Validate pin-to-canvas Phase 1 (snapshot): ask a question on Ask Pulse, pin
// the generated chart, switch to the Dashboard tab, and confirm the pinned tile
// renders on the native canvas with its provenance (SQL + connector) captured.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/pin-to-canvas/${RUN_ID}`);
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

    const result = { pinClicked: false, tileStored: null, gridOnDash: false, tileOnDash: 0 };
    try {
        // 1. Ask → wait for chart + pin button
        await banner(page, "Pin-to-canvas · asking a question to get a chart…", "#06b6d4");
        await page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first().fill("What is the total sales by region?");
        await page.waitForTimeout(300);
        await page.locator("button.gn-send, button.pp-ai-sidebar__ask").first().click();
        const pinBtn = page.locator(".gn-chart-pin").first();
        await pinBtn.waitFor({ state: "visible", timeout: 120_000 });
        await page.waitForTimeout(2500);

        // 2. Pin it
        await banner(page, "Pin-to-canvas · clicking 'Pin to canvas'…", "#06b6d4");
        await pinBtn.click();
        result.pinClicked = true;
        await page.waitForTimeout(1000);
        await page.screenshot({ path: join(OUT_DIR, "01-pinned-from-chat.png") }).catch(() => {});

        // read what got stored
        result.tileStored = await page.evaluate(() => {
            try { return JSON.parse(localStorage.getItem("pulseplay:canvas-tiles") || "[]"); } catch { return null; }
        });
        console.log("stored tiles:", JSON.stringify(result.tileStored, (k, v) => k === "rows" ? `[${(v || []).length} rows]` : v).slice(0, 400));

        // 3. Switch to Dashboard tab
        await banner(page, "Pin-to-canvas · switching to Dashboard — the pinned tile should be on the canvas", "#a855f7");
        const dashTab = page.locator("button", { hasText: /^Dashboard$/i }).first();
        await dashTab.click();
        await page.waitForTimeout(3000);

        const dash = await page.evaluate(() => ({
            grid: !!document.querySelector("[data-testid='pp-canvas-grid'], .pp-canvas"),
            tiles: document.querySelectorAll(".pp-tile").length,
            hasChart: !!document.querySelector(".pp-tile canvas"),
        }));
        result.gridOnDash = dash.grid;
        result.tileOnDash = dash.tiles;
        console.log("dashboard:", JSON.stringify(dash));
        await page.screenshot({ path: join(OUT_DIR, "02-dashboard-canvas.png") }).catch(() => {});
        await page.waitForTimeout(2500);
    } finally {
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }

    const t0 = (result.tileStored || [])[0] || {};
    const provenanceOk = !!t0.sqlQuery && !!t0.connectorProfileId;
    const verdict = (result.pinClicked && result.gridOnDash && result.tileOnDash >= 1) ? "PASS" : "FAIL";
    console.log(`\nVERDICT: ${verdict} (pinned=${result.pinClicked} gridOnDash=${result.gridOnDash} tilesOnDash=${result.tileOnDash} provenance[sql+connector]=${provenanceOk})`);
    console.log(`[done] → ${OUT_DIR}`);
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
