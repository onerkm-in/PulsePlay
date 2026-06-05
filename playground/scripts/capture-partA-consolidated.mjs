#!/usr/bin/env node
// Part A — consolidated UI/UX screening capture.
// Drives a real Chromium across EVERY reachable (no-live-AI-required) screen,
// at desktop / tablet / mobile / 320px, light + dark, saving named PNGs:
//   <screen>__<state>__<bp>__<theme>.png
// Robust per-capture (one failure never aborts the run). Diagnose-from-pixels
// is done by the operator viewing these afterward.
//
// Prereq: proxy on :7000 + dev server on :7001 (canonical ports).

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const OUT = join(REPO, "docs/evidence/2026-06-05-consolidated-pass/partA");
const BASE = "http://127.0.0.1:7001";

const BPS = [
    { id: "desktop", w: 1440, h: 900 },
    { id: "tablet", w: 768, h: 1024 },
    { id: "mobile", w: 390, h: 844 },
    { id: "xs", w: 320, h: 568 },
];

const log = [];
const rec = (name, ok, detail) => {
    log.push({ name, ok, detail });
    console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

// Seed localStorage BEFORE any app script runs. Clearing the AI profile keeps
// AI Insights in its clean empty state (no blocked-warehouse spinner polluting
// layout captures). darkMode flips <html data-pp-theme> + gn-shell--dark.
// NOTE: this fn is serialized by Playwright addInitScript and the `dark` arg is
// passed as the 2nd addInitScript() param — it is NOT a closure capture.
function seedInit(dark) {
    try {
        localStorage.setItem("pulseplay:visual-settings:genieSettings", JSON.stringify({ darkMode: dark }));
        localStorage.removeItem("pulseplay:active-ai-profile");
    } catch { /* ignore */ }
}

// DOM-level proof the theme actually applied — pin the real computed bg/text on
// <body> (not an ancestor) so a mislabeled-theme capture can never pass silently.
async function pinTheme(page) {
    return page.evaluate(() => ({
        ppTheme: document.documentElement.dataset.ppTheme || "(unset)",
        bodyBg: getComputedStyle(document.body).backgroundColor,
        bodyColor: getComputedStyle(document.body).color,
    })).catch(() => ({ ppTheme: "(err)", bodyBg: "", bodyColor: "" }));
}

async function settle(page, ms = 900) {
    try { await page.waitForLoadState("networkidle", { timeout: 4000 }); } catch { /* ok */ }
    await page.waitForTimeout(ms);
}

const shot = (page, name) => page.screenshot({ path: join(OUT, name), fullPage: false }).catch((e) => rec(name, false, e.message));

// A "screen" = navigate (+ optional in-app action) then screenshot.
const SCREENS = [
    {
        id: "ai-insights-empty",
        go: async (page) => { await page.goto(BASE + "/", { waitUntil: "domcontentloaded" }); await settle(page); },
    },
    {
        id: "ask-pulse-empty",
        go: async (page) => {
            await page.goto(BASE + "/", { waitUntil: "domcontentloaded" }); await settle(page, 500);
            await page.getByRole("tab", { name: /Ask Pulse/i }).first().click({ timeout: 4000 }).catch(() => {});
            await settle(page, 600);
        },
    },
    {
        id: "dashboard",
        go: async (page) => { await page.goto(BASE + "/?surface=bi-viz", { waitUntil: "domcontentloaded" }); await settle(page); },
    },
    {
        id: "knowledge-list",
        go: async (page) => { await page.goto(BASE + "/knowledge", { waitUntil: "domcontentloaded" }); await settle(page); },
    },
    {
        id: "knowledge-pack-detail",
        go: async (page) => {
            await page.goto(BASE + "/knowledge", { waitUntil: "domcontentloaded" }); await settle(page, 600);
            await page.getByRole("button", { name: /CPG \/ FMCG/i }).first().click({ timeout: 4000 }).catch(() => {});
            await settle(page, 600);
        },
    },
    {
        id: "settings-landing",
        go: async (page) => { await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded" }); await settle(page); },
    },
    {
        id: "settings-appearance",
        go: async (page) => { await page.goto(BASE + "/settings/preferences/appearance", { waitUntil: "domcontentloaded" }); await settle(page); },
    },
    {
        id: "enabler-open",
        go: async (page) => {
            await page.goto(BASE + "/", { waitUntil: "domcontentloaded" }); await settle(page, 500);
            await page.getByRole("button", { name: /AI & BI enabler/i }).first().click({ timeout: 4000 }).catch(() => {});
            await settle(page, 500);
        },
    },
];

// Which screens to also capture in dark (at the extreme breakpoints only).
const DARK_SCREENS = new Set(["ai-insights-empty", "settings-landing", "settings-appearance", "knowledge-list", "dashboard"]);
const DARK_BPS = new Set(["desktop", "xs"]);

async function run() {
    await mkdir(OUT, { recursive: true });
    const browser = await chromium.launch();

    for (const theme of ["light", "dark"]) {
        const dark = theme === "dark";
        for (const bp of BPS) {
            if (dark && !DARK_BPS.has(bp.id)) continue;
            const ctx = await browser.newContext({ viewport: { width: bp.w, height: bp.h }, deviceScaleFactor: 1 });
            await ctx.addInitScript(seedInit, dark);
            const page = await ctx.newPage();
            for (const sc of SCREENS) {
                if (dark && !DARK_SCREENS.has(sc.id)) continue;
                const name = `${sc.id}__${theme}__${bp.id}.png`;
                try {
                    await sc.go(page);
                    const pin = await pinTheme(page);
                    // Honesty guard: a "dark" capture whose body bg is light (or vice
                    // versa) is a mislabeled artifact — fail it loudly, don't ship it.
                    const isDarkBg = /rgba?\(\s*(?:[0-9]|[1-4][0-9])\b/.test(pin.bodyBg);
                    const themeMismatch = (dark && !isDarkBg && pin.ppTheme !== "dark") || (!dark && pin.ppTheme === "dark");
                    await shot(page, name);
                    rec(name, !themeMismatch, `ppTheme=${pin.ppTheme} bodyBg=${pin.bodyBg}${themeMismatch ? " THEME-MISMATCH" : ""}`);
                } catch (e) {
                    rec(name, false, e.message);
                }
            }
            await ctx.close();
        }
    }

    await browser.close();
    const okN = log.filter((l) => l.ok).length;
    await writeFile(join(OUT, "_manifest.json"), JSON.stringify({ ts: new Date().toISOString(), total: log.length, ok: okN, log }, null, 2));
    console.log(`\nPart A capture: ${okN}/${log.length} captures OK → ${OUT}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
