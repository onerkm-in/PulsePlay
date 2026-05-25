#!/usr/bin/env node
// Quick live smoke for Commit 5 — the TopRightToolbar component, not a
// CSS injection preview. Loads each tab, takes a screenshot.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".trtoolbar-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({
        headless: false, slowMo: 300,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    page.on("console", (msg) => { if (msg.type() === "error") console.log(`[console.error] ${msg.text()}`); });
    page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.evaluate((profile) => {
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        const k = "pulseplay:visual-settings:genieSettings";
        const existing = JSON.parse(window.localStorage.getItem(k) || "{}");
        existing.assistantProfile = profile;
        window.localStorage.setItem(k, JSON.stringify(existing));
        window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({ aiInsights: true, askPulse: true, dashboard: true }));
    }, PROFILE);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);

    const tabs = [
        { id: "ai-insights", click: "#gn-tab-insights" },
        { id: "ask-pulse",   click: "#gn-tab-chat" },
        { id: "dashboard",   click: "#gn-tab-dashboard" },
    ];

    for (const t of tabs) {
        await page.locator(t.click).click().catch(() => {});
        await page.waitForTimeout(700);
        const obs = await page.evaluate(() => ({
            toolbarMounted: !!document.querySelector('[data-testid="pp-top-right-toolbar"]'),
            toolbarBtnCount: document.querySelectorAll('[data-testid="pp-top-right-toolbar"] button').length,
            // Confirm legacy clusters are hidden.
            legacyAiClusterVisible: (() => {
                const el = document.querySelector('[data-testid="pp-panel-controls-ai"]');
                return el ? getComputedStyle(el).display !== "none" : false;
            })(),
            legacyBiClusterVisible: (() => {
                const el = document.querySelector('[data-testid="pp-panel-controls-bi"]');
                return el ? getComputedStyle(el).display !== "none" : false;
            })(),
            legacyPulseClusterVisible: (() => {
                const el = document.querySelector('.gn-pane-action-cluster');
                return el ? getComputedStyle(el).display !== "none" : false;
            })(),
        }));
        console.log(`[${t.id}] toolbar mounted=${obs.toolbarMounted} btns=${obs.toolbarBtnCount}  legacy-AI-cluster-visible=${obs.legacyAiClusterVisible} legacy-BI-cluster-visible=${obs.legacyBiClusterVisible} legacy-Pulse-cluster-visible=${obs.legacyPulseClusterVisible}`);
        await page.screenshot({ path: join(OUT_DIR, `${t.id}.png`), fullPage: false });
    }

    console.log("[done] closing in 4 seconds");
    await page.waitForTimeout(4000);
    await browser.close();
}

main().catch(async (err) => {
    console.error("[FAIL]", err);
    process.exitCode = 1;
});
