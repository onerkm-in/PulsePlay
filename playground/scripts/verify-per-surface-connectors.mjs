#!/usr/bin/env node
// Part C P2 live proof — AI Insights and Ask Pulse bound to DIFFERENT live
// connectors AT THE SAME TIME, exercised through the real SurfaceConnectorBar
// UI (not localStorage). AI Insights → Power BI (deterministic DAX); Ask Pulse
// → Foundation Model (LLM). Genie is serverless-blocked on this workspace, so
// the Ask Pulse half uses FM live and Genie joins identically once serverless
// is enabled (we do NOT fake Genie).
//
// Only the BASE app config (active profile + proxy mode + flag-on) is seeded;
// the FEATURE under test — per-surface binding — is driven through the real UI.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = "http://127.0.0.1:7001";
const OUT = "d:/Working_Folder/Projects/PulsePlay/docs/evidence/per-surface-connectors";
const results = [];
const rec = (n, ok, d = "") => { results.push({ n, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };

async function main() {
    await mkdir(OUT, { recursive: true });
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

    // Seed BASE config only: a shared active profile (so the app is "configured"),
    // proxy mode, AND the feature flag ON. The per-surface BINDING is done below
    // through the real dropdowns.
    await ctx.addInitScript(() => {
        try {
            localStorage.setItem("pulseplay:bi-vendor", "powerbi");
            localStorage.setItem("pulseplay:active-ai-profile", "powerbi-dwd");
            localStorage.setItem("pulseplay:active-surface", "ai-insights");
            localStorage.setItem("pulseplay:default-landing-surface", "ai-insights");
            localStorage.setItem("pulseplay:feature-flags", JSON.stringify({ multiConnectorPanes: true }));
            const k = "pulseplay:visual-settings:genieSettings";
            const ex = JSON.parse(localStorage.getItem(k) || "{}");
            ex.assistantProfile = "powerbi-dwd"; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api";
            localStorage.setItem(k, JSON.stringify(ex));
        } catch { /* */ }
    });

    const page = await ctx.newPage();
    await page.goto(BASE + "/?surface=ai-insights", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(2500);

    // 1) The per-surface connector bar must be visible (flag on).
    const barVisible = await page.locator('[data-testid="surface-connector-bar"]').isVisible().catch(() => false);
    rec("SurfaceConnectorBar visible when flag ON", barVisible);

    // Wait for the live profile list (GET /assistant/profiles) to populate the
    // dropdowns before selecting — otherwise selectOption has nothing to pick.
    await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="surface-connector-ai-insights"]');
        return el && el.querySelectorAll("option").length > 1;
    }, { timeout: 15_000 }).catch(() => {});

    // 2) Bind through the REAL UI: AI Insights → powerbi-dwd, Ask Pulse → foundation.
    await page.selectOption('[data-testid="surface-connector-ai-insights"]', "powerbi-dwd").catch(() => {});
    await page.selectOption('[data-testid="surface-connector-ask-pulse"]', "foundation").catch(() => {});
    await page.waitForTimeout(400);
    const insBound = await page.inputValue('[data-testid="surface-connector-ai-insights"]').catch(() => "");
    const askBound = await page.inputValue('[data-testid="surface-connector-ask-pulse"]').catch(() => "");
    rec("AI Insights bound to powerbi-dwd via UI", insBound === "powerbi-dwd", `value=${insBound}`);
    rec("Ask Pulse bound to foundation via UI", askBound === "foundation", `value=${askBound}`);
    // Also confirm the binding persisted to the store (what the Visual reads).
    const storeOk = await page.evaluate(() => {
        try {
            const m = JSON.parse(localStorage.getItem("pulseplay:surface-connectors") || "{}");
            return m["ai-insights"] === "powerbi-dwd" && m["ask-pulse"] === "foundation";
        } catch { return false; }
    });
    rec("Per-surface binding persisted to the store", storeOk);

    // 3) AI Insights surface should render PBI DAX (a comma-grouped number /
    //    "Total Sales"), proving it talks to Power BI. Use the SAME tab (no full
    //    reload — that's how a user experiences it) and force a fresh run.
    await page.locator('button', { hasText: /^AI Insights$/i }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.locator('button[aria-label*="Refresh"]').first().click({ timeout: 3000 }).catch(() => {});
    let insightsText = "";
    const dl = Date.now() + 90_000;
    while (Date.now() < dl) {
        insightsText = (await page.evaluate(() => document.body.innerText || "")).toString();
        const hasDax = /2,297,201|Total Sales|by segment/i.test(insightsText);
        const settled = !/Connecting to AI|Reading the headline|Capturing the KPI/i.test(insightsText);
        if (hasDax && settled) break;
        await page.waitForTimeout(1500);
    }
    const insightsIsPbi = /2,297,201|Total Sales|by segment/i.test(insightsText);
    rec("AI Insights renders Power BI DAX (proves AI Insights → Power BI)", insightsIsPbi);
    await page.screenshot({ path: join(OUT, "ai-insights-powerbi.png") }).catch(() => {});

    // 4) Ask Pulse surface should answer from Foundation Model — a plain-prose
    //    LLM answer with NO deterministic-DAX markers ("Metric | Value" table,
    //    "Unscoped answer", a comma-grouped total). That distinguishes it from
    //    the Power BI deterministic path (the shared profile) and PROVES the two
    //    surfaces are on DIFFERENT connectors simultaneously.
    const askTab = page.locator('button', { hasText: /^Ask Pulse$/i }).first();
    await askTab.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first().fill("In one sentence, what is a profit margin?").catch(() => {});
    await page.waitForTimeout(200);
    await page.locator("button.gn-send, button.pp-ai-sidebar__ask").first().click().catch(() => {});
    let askText = "";
    const dl2 = Date.now() + 90_000;
    while (Date.now() < dl2) {
        askText = await page.evaluate(() => {
            const m = document.querySelectorAll(".gn-msg--assistant");
            const last = m[m.length - 1];
            return last ? (last.textContent || "") : "";
        });
        const done = /profit margin|revenue|cost/i.test(askText) && !/Looking into|Getting started/i.test(askText);
        if (done) break;
        await page.waitForTimeout(1500);
    }
    // FM = prose; PBI deterministic = "Metric|Value" table / "Unscoped answer" /
    // a comma-grouped number. The Ask Pulse answer must look like FM, NOT PBI.
    const looksLikePbiDeterministic = /Unscoped answer|Computed over the full dataset|\|\s*Value\s*\||\b\d{1,3},\d{3}\b|0\.\d{3,}/i.test(askText);
    const looksLikeProse = /profit margin|revenue|cost/i.test(askText);
    const askIsFm = looksLikeProse && !looksLikePbiDeterministic;
    rec("Ask Pulse answers from Foundation Model — NOT the PBI shared profile (proves different connectors at once)", askIsFm, askText.slice(0, 140));
    await page.screenshot({ path: join(OUT, "ask-pulse-foundation.png") }).catch(() => {});

    await ctx.close();
    await browser.close();
    const ok = results.filter(r => r.ok).length;
    await writeFile(join(OUT, "_results.json"), JSON.stringify({ ts: new Date().toISOString(), ok, total: results.length, results }, null, 2));
    console.log(`\nPer-surface connectors: ${ok}/${results.length} checks passed → ${OUT}`);
    if (ok !== results.length) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exit(1); });
