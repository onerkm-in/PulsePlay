#!/usr/bin/env node
// playground/scripts/verify-modes-smoke.mjs
//
// Mode-by-mode UI smoke test. The unified-screen sprint exposed that
// PulsePlay actually has MULTIPLE axes of "modes" already:
//   - uiMode:           "pulse" | "v0"
//   - enabledComponents: "aiOnly" | "biOnly" | "both" | "mix"
//   - layoutMode:        "ai-left" | "ai-right" | "ai-top" | "ai-bottom"
//   - biTileMode:        "1" | "2" | "4"
//
// This harness visits a curated matrix of mode combinations, captures
// a screenshot for each, and dumps a short composition summary (what
// surfaces are mounted, what tabs are visible, what the toolbar looks
// like). The goal: give the user a visual inventory BEFORE we decide
// which modes are first-class layout options vs which to consolidate.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".modes-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";

const log = [];
const record = (line) => { log.push(line); console.log(line); };

// Each "mode" is a curated combination the user can choose between today.
const MODES = [
    { id: "01-pulse-shell",
      label: "PulseShell — Classic 3-tab",
      storage: { "pulseplay:ui-mode": "pulse" } },

    { id: "02-v0-mix",
      label: "v0 / Unified (default) — enabledComponents=mix",
      storage: { "pulseplay:ui-mode": "v0", "pulseplay:enabled-components": "mix" } },

    { id: "03-v0-aiOnly",
      label: "v0 / AI only — enabledComponents=aiOnly",
      storage: { "pulseplay:ui-mode": "v0", "pulseplay:enabled-components": "aiOnly" } },

    { id: "04-v0-biOnly",
      label: "v0 / BI only — enabledComponents=biOnly",
      storage: { "pulseplay:ui-mode": "v0", "pulseplay:enabled-components": "biOnly" } },

    { id: "05-v0-both-aiLeft",
      label: "v0 / Split (both) — layoutMode=ai-left",
      storage: { "pulseplay:ui-mode": "v0", "pulseplay:enabled-components": "both", "pulseplay:layout-mode": "ai-left" } },

    { id: "06-v0-both-aiTop",
      label: "v0 / Split (both) — layoutMode=ai-top",
      storage: { "pulseplay:ui-mode": "v0", "pulseplay:enabled-components": "both", "pulseplay:layout-mode": "ai-top" } },
];

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    record(`[boot] launching HEADED Chromium @ slowMo=300ms — watch your screen`);
    const browser = await chromium.launch({
        headless: false,
        slowMo: 300,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();

    page.on("console", (msg) => {
        if (msg.type() === "error") record(`[console.error] ${msg.text()}`);
    });
    page.on("pageerror", (err) => record(`[pageerror] ${err.message}`));

    // Boot once + seed AI profile, then iterate modes.
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.evaluate((profile) => {
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        const k = "pulseplay:visual-settings:genieSettings";
        const existing = JSON.parse(window.localStorage.getItem(k) || "{}");
        existing.assistantProfile = profile;
        window.localStorage.setItem(k, JSON.stringify(existing));
    }, PROFILE);

    const inventory = [];
    for (const mode of MODES) {
        record(`\n══ ${mode.id}  ${mode.label} ══`);
        // Clear axes that this mode doesn't set so prior mode's storage
        // doesn't bleed in.
        await page.evaluate(() => {
            for (const k of [
                "pulseplay:ui-mode",
                "pulseplay:enabled-components",
                "pulseplay:layout-mode",
                "pulseplay:bi-tile-mode",
            ]) window.localStorage.removeItem(k);
        });
        // Apply this mode's storage.
        await page.evaluate((kv) => {
            for (const [k, v] of Object.entries(kv)) window.localStorage.setItem(k, v);
        }, mode.storage);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.waitForTimeout(1200);

        // Dump composition: what's mounted, what tabs visible, header buttons.
        const composition = await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll("button"))
                .filter(b => /AI Insights|Ask Pulse|Dashboard/.test(b.textContent || ""))
                .map(b => (b.textContent || "").trim().slice(0, 30));
            const headerButtons = Array.from(document.querySelectorAll("button"))
                .filter(b => {
                    const r = b.getBoundingClientRect();
                    return r.top < 220 && r.width > 0 && r.height > 0;
                })
                .map(b => b.getAttribute("aria-label") || b.getAttribute("title") || (b.textContent || "").trim().slice(0, 30))
                .filter(Boolean);
            return {
                ppScreen:       document.querySelectorAll('[data-testid="pp-screen"]').length,
                mainSlot:       document.querySelectorAll('[data-testid="pp-screen-main-slot"]').length,
                floatingSlot:   document.querySelectorAll('[data-testid="pp-screen-floating-slot"]').length,
                dockSlot:       document.querySelectorAll('[data-testid="pp-screen-dock-slot"]').length,
                askButton:      document.querySelectorAll(".pp-ai-sidebar__ask").length,
                pulseAskTab:    document.querySelectorAll('button').length === 0 ? 0
                                  : Array.from(document.querySelectorAll('button')).filter(b => /^Ask Pulse$/i.test((b.textContent||"").trim())).length,
                composerTextareas: document.querySelectorAll("textarea").length,
                tabs,
                headerButtons: headerButtons.slice(0, 12),
            };
        });
        record(`[${mode.id}] pp-screen=${composition.ppScreen}  main=${composition.mainSlot}  floating=${composition.floatingSlot}  dock=${composition.dockSlot}`);
        record(`[${mode.id}] askButton=${composition.askButton}  pulseAskTab=${composition.pulseAskTab}  textareas=${composition.composerTextareas}`);
        record(`[${mode.id}] tabs (first 4): ${JSON.stringify(composition.tabs.slice(0, 4))}`);
        record(`[${mode.id}] header buttons (${composition.headerButtons.length}): ${JSON.stringify(composition.headerButtons)}`);

        const screenshotPath = join(OUT_DIR, `${mode.id}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        record(`[${mode.id}] screenshot: ${mode.id}.png`);

        inventory.push({ ...mode, composition });
    }

    // Side-by-side summary table.
    record(`\n\n══════ COMPARISON ══════`);
    record(`${"id".padEnd(22)} ${"pp-screen".padStart(9)} ${"main".padStart(4)} ${"float".padStart(5)} ${"dock".padStart(4)} ${"v0-ask".padStart(6)} ${"tabs".padStart(4)} ${"hdr-btns".padStart(8)}`);
    for (const m of inventory) {
        const c = m.composition;
        record(`${m.id.padEnd(22)} ${String(c.ppScreen).padStart(9)} ${String(c.mainSlot).padStart(4)} ${String(c.floatingSlot).padStart(5)} ${String(c.dockSlot).padStart(4)} ${String(c.askButton).padStart(6)} ${String(c.tabs.length).padStart(4)} ${String(c.headerButtons.length).padStart(8)}`);
    }

    record(`\n[done] watch your screen — closing in 5 seconds`);
    await page.waitForTimeout(5000);
    await writeFile(join(OUT_DIR, "modes.log"), log.join("\n"), "utf-8");
    await writeFile(join(OUT_DIR, "inventory.json"), JSON.stringify(inventory, null, 2), "utf-8");
    await browser.close();
}

main().catch(async (err) => {
    console.error("[FAIL]", err);
    process.exitCode = 1;
});
