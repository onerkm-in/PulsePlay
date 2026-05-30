#!/usr/bin/env node
// playground/scripts/verify-tab-visibility.mjs
//
// UI smoke for the 2026-05-25 per-tab-visibility ship (commits dfb579d
// → 22edc48). Visits 7 visibility configurations:
//   01 — all 3 tabs enabled (default)
//   02 — AI Insights + Ask Pulse (Dashboard off)
//   03 — AI Insights + Dashboard (Ask Pulse off)
//   04 — Ask Pulse + Dashboard (AI Insights off)
//   05 — AI Insights only (single-tab collapse)
//   06 — Ask Pulse only (single-tab collapse)
//   07 — Dashboard only (single-tab collapse)
// Plus an 08 — Settings → Preferences showing the 3-checkbox UI.
//
// For each: sets pulseplay:tab-visibility + reloads + screenshots +
// dumps the DOM signature (which tab buttons are present, whether the
// strip collapsed, what header buttons appear).

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".tabvis-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";

const log = [];
const record = (line) => { log.push(line); console.log(line); };

const CONFIGS = [
    { id: "01-all-enabled",          label: "ALL 3 enabled (default)",        v: { aiInsights: true,  askPulse: true,  dashboard: true  } },
    { id: "02-no-dashboard",         label: "AI Insights + Ask Pulse",        v: { aiInsights: true,  askPulse: true,  dashboard: false } },
    { id: "03-no-askpulse",          label: "AI Insights + Dashboard",        v: { aiInsights: true,  askPulse: false, dashboard: true  } },
    { id: "04-no-aiinsights",        label: "Ask Pulse + Dashboard",          v: { aiInsights: false, askPulse: true,  dashboard: true  } },
    { id: "05-only-aiinsights",      label: "AI Insights ONLY (collapse)",    v: { aiInsights: true,  askPulse: false, dashboard: false } },
    { id: "06-only-askpulse",        label: "Ask Pulse ONLY (collapse)",      v: { aiInsights: false, askPulse: true,  dashboard: false } },
    { id: "07-only-dashboard",       label: "Dashboard ONLY (collapse)",      v: { aiInsights: false, askPulse: false, dashboard: true  } },
];

async function flushLog() {
    try { await writeFile(join(OUT_DIR, "tabvis.log"), log.join("\n"), "utf-8"); } catch (_) {}
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    record(`[boot] launching HEADED Chromium @ slowMo=350ms — watch your screen`);
    const browser = await chromium.launch({
        headless: false,
        slowMo: 350,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();

    page.on("console", (msg) => { if (msg.type() === "error") record(`[console.error] ${msg.text()}`); });
    page.on("pageerror", (err) => record(`[pageerror] ${err.message}`));

    // Boot once + seed AI profile.
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.evaluate((profile) => {
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        const k = "pulseplay:visual-settings:genieSettings";
        const existing = JSON.parse(window.localStorage.getItem(k) || "{}");
        existing.assistantProfile = profile;
        window.localStorage.setItem(k, JSON.stringify(existing));
        // Clear legacy ui-mode so we get the new default ("pulse") for free.
        window.localStorage.removeItem("pulseplay:ui-mode");
    }, PROFILE);

    const inventory = [];
    for (const cfg of CONFIGS) {
        record(`\n══ ${cfg.id}  ${cfg.label} ══`);
        // Apply this config to localStorage + dispatch display-change.
        await page.evaluate((v) => {
            window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify(v));
            window.dispatchEvent(new CustomEvent("pulseplay:display-change", {
                detail: { key: "pulseplay:tab-visibility", value: JSON.stringify(v) },
            }));
        }, cfg.v);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.waitForTimeout(1200);

        // Dump composition.
        const observed = await page.evaluate(() => {
            const tabBtn = (id) => document.querySelector(`#${id}`) !== null;
            const tabStripExists = document.querySelector('.gn-surface-switcher') !== null;
            return {
                stripVisible:       tabStripExists,
                tabBtnInsights:     tabBtn("gn-tab-insights"),
                tabBtnChat:         tabBtn("gn-tab-chat"),
                tabBtnDashboard:    tabBtn("gn-tab-dashboard"),
                ppScreen:           document.querySelectorAll('[data-testid="pp-screen"]').length,
                mainSlot:           document.querySelectorAll('[data-testid="pp-screen-main-slot"]').length,
            };
        });
        record(`[${cfg.id}] strip=${observed.stripVisible}  AI=${observed.tabBtnInsights}  Ask=${observed.tabBtnChat}  Dash=${observed.tabBtnDashboard}  pp-screen=${observed.ppScreen}/main=${observed.mainSlot}`);

        // Expected:
        const enabled = (cfg.v.aiInsights?1:0) + (cfg.v.askPulse?1:0) + (cfg.v.dashboard?1:0);
        const expectStrip = enabled >= 2;
        const stripOK = observed.stripVisible === expectStrip;
        const insightsOK = observed.tabBtnInsights === (cfg.v.aiInsights && expectStrip);
        const askOK = observed.tabBtnChat === (cfg.v.askPulse && expectStrip);
        const dashOK = observed.tabBtnDashboard === (cfg.v.dashboard && expectStrip);
        const verdict = stripOK && insightsOK && askOK && dashOK ? "✅ PASS" : "❌ FAIL";
        record(`[${cfg.id}] expect: strip=${expectStrip}, AI=${cfg.v.aiInsights && expectStrip}, Ask=${cfg.v.askPulse && expectStrip}, Dash=${cfg.v.dashboard && expectStrip} → ${verdict}`);

        const screenshotPath = join(OUT_DIR, `${cfg.id}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        record(`[${cfg.id}] screenshot: ${cfg.id}.png`);

        inventory.push({ ...cfg, observed, verdict });
        await flushLog();
    }

    // 08 — Settings UI showing the new 3-checkbox layout.
    record(`\n══ 08-settings-tabs  Settings → Preferences (3-checkbox UI) ══`);
    // Reset visibility so the picker shows all 3 enabled.
    await page.evaluate(() => {
        window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({ aiInsights: true, askPulse: true, dashboard: true }));
    });
    await page.goto(BASE + "/settings/preferences", { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(900);
    // Expand any collapsed <details>.
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await page.waitForTimeout(400);
    const settingsObs = await page.evaluate(() => {
        const cb = (label) => {
            // Find the checkbox by accompanying label text.
            const inputs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
            const found = inputs.find(i => i.parentElement?.textContent?.includes(label));
            return found ? { checked: found.checked, disabled: found.disabled } : null;
        };
        return {
            cbAiInsights: cb("AI Insights"),
            cbAskPulse:   cb("Ask Pulse"),
            cbDashboard:  cb("Dashboard"),
            // Look for orphaned legacy controls that should be gone now.
            hasVisiblePanelsPicker:  Array.from(document.querySelectorAll("button"))
                .some(b => /AI only/i.test(b.textContent || "") || /BI only/i.test(b.textContent || "")),
            hasAiPositionPicker:     Array.from(document.querySelectorAll("button"))
                .some(b => /Left|Right|Top|Bottom/.test((b.textContent || "").trim()) && /Position/i.test(b.parentElement?.parentElement?.textContent || "")),
            hasMixCompositionPanel:  document.body.textContent?.includes("Mix composition") || false,
        };
    });
    record(`[08] AI Insights checkbox: ${JSON.stringify(settingsObs.cbAiInsights)}`);
    record(`[08] Ask Pulse  checkbox: ${JSON.stringify(settingsObs.cbAskPulse)}`);
    record(`[08] Dashboard  checkbox: ${JSON.stringify(settingsObs.cbDashboard)}`);
    record(`[08] LEGACY hasVisiblePanelsPicker: ${settingsObs.hasVisiblePanelsPicker} (expect false — removed)`);
    record(`[08] LEGACY hasAiPositionPicker:    ${settingsObs.hasAiPositionPicker}    (expect false — removed)`);
    record(`[08] LEGACY hasMixCompositionPanel: ${settingsObs.hasMixCompositionPanel} (expect false — removed)`);
    await page.screenshot({ path: join(OUT_DIR, "08-settings-tabs.png"), fullPage: true });
    record(`[08] screenshot: 08-settings-tabs.png`);
    await flushLog();

    // Side-by-side summary.
    record(`\n\n══════ COMPARISON ══════`);
    record(`${"id".padEnd(24)} ${"strip".padStart(5)} ${"AI".padStart(5)} ${"Ask".padStart(5)} ${"Dash".padStart(5)}   verdict`);
    for (const m of inventory) {
        const o = m.observed;
        record(`${m.id.padEnd(24)} ${String(o.stripVisible).padStart(5)} ${String(o.tabBtnInsights).padStart(5)} ${String(o.tabBtnChat).padStart(5)} ${String(o.tabBtnDashboard).padStart(5)}   ${m.verdict}`);
    }

    record(`\n[done] watch your screen — closing in 5 seconds`);
    await page.waitForTimeout(5000);
    await flushLog();
    await writeFile(join(OUT_DIR, "inventory.json"), JSON.stringify(inventory, null, 2), "utf-8");
    await browser.close();
}

main().catch(async (err) => {
    console.error("[FAIL]", err);
    process.exitCode = 1;
});
