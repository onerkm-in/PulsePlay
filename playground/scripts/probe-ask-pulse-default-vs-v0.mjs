#!/usr/bin/env node
// Quick visual probe: capture Ask Pulse surface in DEFAULT (uiMode=pulse,
// the 3-tab PulseShell) vs FORCED (uiMode=v0, UnifiedAssistantSurface).
// Both clean localStorage so we see what the user actually sees on a
// fresh visit.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const OUT_DIR = "d:/Working_Folder/Projects/PulsePlay/docs/evidence/ask-pulse-100-2026-05-26";
const BASE = "http://127.0.0.1:7001";

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();

    // ── A. Default state (no force) ───────────────────────────
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.localStorage.clear());
    await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: join(OUT_DIR, "PROBE-A-default-pulse-shell.png"), fullPage: false });
    const aProbe = await page.evaluate(() => ({
        uiMode: window.localStorage.getItem("pulseplay:ui-mode"),
        body: document.body.innerText.slice(0, 250),
        pulseShellRoots: document.querySelectorAll('.gn-host-stub,.gn-app').length,
        v0Surface: document.querySelectorAll('.pp-ai-sidebar').length,
        chromeHeader: document.querySelectorAll('[data-testid="pp-panel-chrome-ai"]').length,
    }));
    console.log("[A] default:", JSON.stringify(aProbe));

    // ── B. Forced v0 state (what my harness was driving) ──────
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
        window.localStorage.clear();
        window.localStorage.setItem("pulseplay:ui-mode", "v0");
        window.localStorage.setItem("pulseplay:active-surface", "ask-pulse");
    });
    await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: join(OUT_DIR, "PROBE-B-forced-v0-surface.png"), fullPage: false });
    const bProbe = await page.evaluate(() => ({
        uiMode: window.localStorage.getItem("pulseplay:ui-mode"),
        body: document.body.innerText.slice(0, 250),
        pulseShellRoots: document.querySelectorAll('.gn-host-stub,.gn-app').length,
        v0Surface: document.querySelectorAll('.pp-ai-sidebar').length,
        chromeHeader: document.querySelectorAll('[data-testid="pp-panel-chrome-ai"]').length,
        sidebarHeight: document.querySelector('.pp-ai-sidebar')?.getBoundingClientRect()?.height,
        sidebarParentHeight: document.querySelector('.pp-app__sidebar')?.getBoundingClientRect()?.height,
        chatThreadTop: document.querySelector('.pp-ai-sidebar__history')?.getBoundingClientRect()?.top,
        composerBottom: document.querySelector('.pp-ai-sidebar__composer')?.getBoundingClientRect()?.bottom,
        viewportH: window.innerHeight,
    }));
    console.log("[B] forced v0:", JSON.stringify(bProbe));

    await browser.close();
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
