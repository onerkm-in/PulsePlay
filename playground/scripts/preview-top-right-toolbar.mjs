#!/usr/bin/env node
// playground/scripts/preview-top-right-toolbar.mjs
//
// Visual preview only — does NOT modify any code. Loads each tab, then
// injects CSS that repositions the existing cross-cutting toolbar
// buttons (Maximize/Minimize/Pop-out/etc) into a fixed-position
// container at top:0 right:0 — the proposed Interpretation B layout.
// Takes a "before" and "after" screenshot per tab so the comparison is
// concrete.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".toolbar-preview-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";

const log = [];
const record = (line) => { log.push(line); console.log(line); };

// CSS that "lifts" the existing per-tab cross-cutting buttons into a
// fixed top-right container BELOW the "Ready BI+AI" green pill.
// Pill sits at ~top: 16px right: 16px; buttons go below at top: 64px.
const INJECT_CSS = `
  /* 1. Mark the cross-cutting buttons by their existing aria-labels. */
  button[aria-label*="Maximize"],
  button[aria-label*="Minimize"],
  button[aria-label*="Pop out"],
  button[aria-label*="Open AI panel"],
  button[aria-label*="Open BI panel"],
  button[aria-label*="Pin layout"],
  button[aria-label*="Show both panels"] {
    position: fixed !important;
    top: 64px !important;            /* BELOW the green Ready pill */
    z-index: 9999 !important;
    background: rgba(255,255,255,0.95) !important;
    border: 1px solid rgba(0,0,0,0.15) !important;
    border-radius: 6px !important;
    padding: 6px 8px !important;
    margin: 0 !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.12) !important;
    transition: none !important;
  }
  /* 2. Stagger horizontally — rightmost first, fanning leftward. */
  button[aria-label*="Pop out"]        { right: 12px !important; }
  button[aria-label*="Open AI panel"]  { right: 60px !important; }
  button[aria-label*="Open BI panel"]  { right: 60px !important; }
  button[aria-label*="Pin layout"]     { right: 108px !important; }
  button[aria-label*="Maximize"]       { right: 156px !important; }
  button[aria-label*="Minimize"]       { right: 204px !important; }
  button[aria-label*="Show both panels"] { right: 252px !important; }
  /* 3. Banner. */
  body::before {
    content: "TOP-RIGHT TOOLBAR PREVIEW — below Ready pill (top:64px right:0)";
    position: fixed;
    top: 4px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9998;
    background: rgba(0, 120, 212, 0.92);
    color: white;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 4px;
    pointer-events: none;
  }
`;

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    record(`[boot] HEADED Chromium @ slowMo=300ms — toolbar preview`);
    const browser = await chromium.launch({
        headless: false, slowMo: 300,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();

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
        record(`\n══ ${t.id} ══`);
        // BEFORE — clear any prior injected style
        await page.evaluate(() => {
            const old = document.getElementById("__toolbar_preview_style");
            if (old) old.remove();
        });
        await page.locator(t.click).click().catch(() => {});
        await page.waitForTimeout(700);
        await page.screenshot({ path: join(OUT_DIR, `${t.id}-BEFORE.png`), fullPage: false });
        record(`[${t.id}] captured BEFORE`);

        // AFTER — inject the preview CSS
        await page.evaluate((css) => {
            const s = document.createElement("style");
            s.id = "__toolbar_preview_style";
            s.textContent = css;
            document.head.appendChild(s);
        }, INJECT_CSS);
        await page.waitForTimeout(700);
        await page.screenshot({ path: join(OUT_DIR, `${t.id}-AFTER.png`), fullPage: false });
        record(`[${t.id}] captured AFTER`);
    }

    record(`\n[done] watch your screen — closing in 5 seconds`);
    await page.waitForTimeout(5000);
    await writeFile(join(OUT_DIR, "preview.log"), log.join("\n"), "utf-8");
    await browser.close();
}

main().catch(async (err) => {
    console.error("[FAIL]", err);
    process.exitCode = 1;
});
