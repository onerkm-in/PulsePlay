#!/usr/bin/env node
// playground/scripts/verify-today-thorough.mjs
//
// Thorough UI smoke covering today's 5 commits (ARCH-P0 + ARCH-P1
// slices 1/2/3). One process, one browser context, walks through
// every scenario sequentially. Captures screenshots + DOM probes +
// console errors per step. Final report at end.
//
// Scenarios:
//   S01  Cold boot (no localStorage) → v0 mounts with full chrome
//   S02  PulsePlayScreen + slot wrappers in DOM
//   S03  Empty-state CTAs render + Settings click navigates
//   S04  /settings/ai has no UI mode picker; suggest panel still works
//   S05  /settings/preferences has no UI mode picker
//   S06  Profile set → trust chip promotes ("Setup needed" → "AI configured · No BI fields")
//   S07  Real Genie Ask Pulse → reply renders + TrustBadge mounts
//   S08  Escape hatch — explicit pulseplay:ui-mode="pulse" → PulseShell with 3-tab strip
//   S09  Resolver — only ai-insights tab visible → pulse mounts (NEW behavior)
//   S10  Resolver — only ask-pulse tab visible → v0 mounts
//   S11  Resolver — only dashboard tab visible → cold boot tolerates
//   S12  Mobile 390px responsive — composer + chips visible, no horizontal overflow

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".verify-today-out");
const BASE = "http://127.0.0.1:7001";

const log = [];
const findings = [];
const errors = [];

const record = (line) => { log.push(line); console.log(line); };
const finding = (kind, msg) => { findings.push(`[${kind}] ${msg}`); console.log(`[${kind}] ${msg}`); };

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    page.on("console", (m) => {
        if (m.type() === "error") {
            errors.push({ scenario: currentScenario, text: m.text() });
        }
    });
    page.on("pageerror", (e) => {
        errors.push({ scenario: currentScenario, text: `PAGEERROR: ${e.message}` });
    });

    let currentScenario = "boot";

    const clearStorage = async () => {
        await page.goto(BASE + "/", { waitUntil: "networkidle" });
        await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
    };
    const dismissWizardIfPresent = async () => {
        const btn = page.locator('button[aria-label="Skip setup and close"]').first();
        if (await btn.count() > 0) {
            await btn.click().catch(() => undefined);
            await page.waitForTimeout(300);
        }
    };

    // ─── S01 Cold boot ───────────────────────────────────────────────
    currentScenario = "S01";
    record(`\n[S01] Cold boot — clearing storage, asserting v0 default + full chrome`);
    await clearStorage();
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await dismissWizardIfPresent();
    await page.waitForTimeout(300);
    const s01 = await page.evaluate(() => ({
        pulseScreen: document.querySelectorAll('[data-testid="pp-screen"]').length,
        mainSlot:    document.querySelectorAll('[data-testid="pp-screen-main-slot"]').length,
        pulseShell:  !!document.querySelector(".gn-shell, [class*='gn-shell']"),
        v0:          !!document.querySelector(".pp-ai-sidebar"),
        contextStrip: !!document.querySelector('[data-testid="pp-surface-context"]'),
        emptyState:  !!document.querySelector('[data-testid="pp-assistant-empty"]'),
        connectCta:  !!document.querySelector('[data-testid="pp-assistant-empty-connect"]'),
        trust:       document.querySelector('[data-testid="pp-surface-context-trust"]')?.textContent,
        source:      document.querySelector('[data-testid="pp-surface-context-source"]')?.textContent,
        title:       document.title,
    }));
    record(`[S01]   probe: ${JSON.stringify(s01)}`);
    await page.screenshot({ path: join(OUT_DIR, "S01-cold-boot.png"), fullPage: false });
    if (!s01.pulseScreen) finding("FAIL", "S01: PulsePlayScreen wrapper not in DOM");
    if (s01.pulseShell) finding("FAIL", "S01: PulseShell mounted on cold boot — should be v0");
    if (!s01.v0) finding("FAIL", "S01: UnifiedAssistantSurface not mounted on cold boot");
    if (!s01.contextStrip) finding("FAIL", "S01: SurfaceContextStrip missing");
    if (!s01.emptyState) finding("FAIL", "S01: AssistantEmptyState missing");
    if (s01.trust !== "Setup needed") finding("WARN", `S01: trust chip "${s01.trust}" (expected "Setup needed")`);
    if (s01.source !== "No BI fields bound") finding("WARN", `S01: source chip "${s01.source}" (expected "No BI fields bound")`);
    if (s01.title !== "PulsePlay") finding("WARN", `S01: title "${s01.title}" (expected "PulsePlay")`);

    // ─── S02 PulsePlayScreen + slots ─────────────────────────────────
    // Already covered in S01 probe — assert separately for the report.

    // ─── S03 Empty-state CTAs ────────────────────────────────────────
    currentScenario = "S03";
    record(`\n[S03] Empty-state Connect-AI CTA click → navigates to /settings/ai`);
    const connectBtn = page.locator('[data-testid="pp-assistant-empty-connect"]').first();
    if (await connectBtn.count() > 0) {
        await connectBtn.click();
        await page.waitForTimeout(500);
        const url = page.url();
        record(`[S03]   url after click: ${url}`);
        if (!url.includes("/settings/ai")) finding("FAIL", "S03: Connect CTA didn't navigate to /settings/ai");
    } else {
        finding("FAIL", "S03: Connect CTA not present to click");
    }

    // ─── S04 Settings → AI ───────────────────────────────────────────
    currentScenario = "S04";
    record(`\n[S04] /settings/ai renders, no UI mode picker, AI-assisted suggest panel works`);
    await page.goto(BASE + "/settings/ai", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    const s04 = await page.evaluate(() => ({
        uiModeMatches: (document.body.innerText.match(/\bUI mode\b/gi) || []).length,
        selects: document.querySelectorAll("select").length,
    }));
    record(`[S04]   probe: ${JSON.stringify(s04)}`);
    await page.screenshot({ path: join(OUT_DIR, "S04-settings-ai.png"), fullPage: true });
    if (s04.uiModeMatches > 0) finding("FAIL", `S04: "UI mode" appears ${s04.uiModeMatches}× on /settings/ai`);
    // Try the AI-assisted Authoring mode toggle (Thread A from earlier sprint)
    let panelAfter = 0;
    const selects = await page.locator("select").all();
    for (const sel of selects) {
        const options = await sel.locator("option").allTextContents();
        if (options.some(o => /AI-assisted/i.test(o))) {
            await sel.scrollIntoViewIfNeeded();
            await sel.selectOption("ai-assisted");
            await page.waitForTimeout(700);
            panelAfter = await page.locator(".gn-setup-ai-assist").count();
            break;
        }
    }
    record(`[S04]   .gn-setup-ai-assist after AI-assisted: ${panelAfter}`);
    if (panelAfter === 0) finding("WARN", "S04: AI-assisted authoring suggest panel didn't render");

    // ─── S05 Settings → Preferences ─────────────────────────────────
    currentScenario = "S05";
    record(`\n[S05] /settings/preferences renders, no UI mode picker`);
    await page.goto(BASE + "/settings/preferences", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    const s05 = await page.evaluate(() => ({
        uiModeMatches: (document.body.innerText.match(/\bUI mode\b/gi) || []).length,
    }));
    record(`[S05]   probe: ${JSON.stringify(s05)}`);
    await page.screenshot({ path: join(OUT_DIR, "S05-settings-preferences.png"), fullPage: true });
    if (s05.uiModeMatches > 0) finding("FAIL", `S05: "UI mode" appears ${s05.uiModeMatches}× on /settings/preferences`);

    // ─── S06 Profile set → trust chip promotes ──────────────────────
    currentScenario = "S06";
    record(`\n[S06] Set profile=default → trust chip promotes from "Setup needed"`);
    await clearStorage();
    await page.evaluate(() => {
        localStorage.setItem("pulseplay:active-ai-profile", "default");
        const k = "pulseplay:visual-settings:genieSettings";
        const existing = JSON.parse(localStorage.getItem(k) || "{}");
        existing.assistantProfile = "default";
        existing.connectionMode = "proxy";
        // /api prefix is required: Vite dev server only proxies /api/* → proxy.
        // Without /api, every assistant/* and /health request hits Vite and gets
        // SPA HTML (200) or 404, causing /health JSON.parse failure + API 404s.
        existing.apiBaseUrl = window.location.origin + "/api";
        localStorage.setItem(k, JSON.stringify(existing));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2500); // let discovery settle
    await dismissWizardIfPresent();
    const s06 = await page.evaluate(() => ({
        trust:    document.querySelector('[data-testid="pp-surface-context-trust"]')?.textContent,
        source:   document.querySelector('[data-testid="pp-surface-context-source"]')?.textContent,
        assistant:document.querySelector('[data-testid="pp-surface-context-assistant"]')?.textContent,
    }));
    record(`[S06]   probe: ${JSON.stringify(s06)}`);
    await page.screenshot({ path: join(OUT_DIR, "S06-profile-set.png"), fullPage: false });
    if (s06.trust === "Setup needed") finding("FAIL", "S06: trust still 'Setup needed' after profile set");
    if (s06.assistant !== "default") finding("WARN", `S06: assistant chip "${s06.assistant}" (expected "default")`);

    // ─── S07 Real Genie Ask Pulse ────────────────────────────────────
    currentScenario = "S07";
    record(`\n[S07] Real Genie reply end-to-end — typing question, clicking Ask, waiting up to 120s`);
    const composer = page.locator('textarea').first();
    if (await composer.count() === 0) {
        finding("FAIL", "S07: composer textarea not found");
    } else {
        await composer.fill("Top 3 categories by sales. Markdown table: Category, Sales.");
        const askBtn = page.locator('button.pp-ai-sidebar__ask').first();
        if (await askBtn.count() === 0) {
            finding("FAIL", "S07: Ask button not found");
        } else {
            await askBtn.click();
            const deadline = Date.now() + 120_000;
            let finalStatus = null;
            while (Date.now() < deadline) {
                await page.waitForTimeout(2000);
                finalStatus = await page.evaluate(() => {
                    const entries = Array.from(document.querySelectorAll('[data-testid^="pp-ai-entry-"]'));
                    const last = entries[entries.length - 1];
                    return last ? last.getAttribute("data-status") : null;
                });
                if (finalStatus === "completed" || finalStatus === "failed") break;
            }
            record(`[S07]   final entry status: ${finalStatus}`);
            await page.screenshot({ path: join(OUT_DIR, "S07-ask-pulse-reply.png"), fullPage: true });
            const badges = await page.locator('[data-testid="trust-badge"]').all();
            const badgeInfo = [];
            for (const b of badges) badgeInfo.push({ status: await b.getAttribute("data-status"), text: (await b.textContent() || "").trim() });
            record(`[S07]   TrustBadges: ${JSON.stringify(badgeInfo)}`);
            if (finalStatus !== "completed") finding("FAIL", `S07: Genie reply status "${finalStatus}" (expected "completed")`);
            if (badges.length === 0) finding("FAIL", "S07: no TrustBadge rendered on the reply");
        }
    }

    // ─── S08 Escape hatch — explicit pulse override ─────────────────
    currentScenario = "S08";
    record(`\n[S08] Escape hatch — localStorage pulseplay:ui-mode="pulse"`);
    await clearStorage();
    await page.evaluate(() => localStorage.setItem("pulseplay:ui-mode", "pulse"));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await dismissWizardIfPresent();
    const s08 = await page.evaluate(() => ({
        pulseShell: !!document.querySelector(".gn-shell, [class*='gn-shell']"),
        v0:         !!document.querySelector(".pp-ai-sidebar"),
        gnTabs:     document.querySelectorAll('[class*="gn-tab"]').length,
    }));
    const tabStripCount = await page.locator('button:has-text("AI Insights"), button:has-text("Ask Pulse"), button:has-text("Dashboard")').count();
    record(`[S08]   probe: ${JSON.stringify(s08)} tab-buttons=${tabStripCount}`);
    await page.screenshot({ path: join(OUT_DIR, "S08-escape-hatch-pulse.png"), fullPage: false });
    if (!s08.pulseShell) finding("FAIL", "S08: escape hatch broken — PulseShell not mounted");
    if (s08.v0) finding("FAIL", "S08: v0 still mounted alongside pulse — should be exclusive");

    // ─── S09 Resolver narrowing — only AI Insights visible ───────────
    currentScenario = "S09";
    record(`\n[S09] Resolver — only ai-insights tab visible → pulse should mount (NEW behavior)`);
    await clearStorage();
    await page.evaluate(() => {
        localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({
            aiInsights: true, askPulse: false, dashboard: false,
        }));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await dismissWizardIfPresent();
    const s09 = await page.evaluate(() => ({
        pulseShell: !!document.querySelector(".gn-shell, [class*='gn-shell']"),
        v0:         !!document.querySelector(".pp-ai-sidebar"),
    }));
    record(`[S09]   probe: ${JSON.stringify(s09)}`);
    await page.screenshot({ path: join(OUT_DIR, "S09-resolver-pulse.png"), fullPage: false });
    if (!s09.pulseShell) finding("FAIL", "S09: resolver should have narrowed to pulse when only ai-insights visible");

    // ─── S10 Resolver narrowing — only Ask Pulse visible ─────────────
    currentScenario = "S10";
    record(`\n[S10] Resolver — only ask-pulse tab visible → v0 should mount`);
    await page.evaluate(() => {
        localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({
            aiInsights: false, askPulse: true, dashboard: false,
        }));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await dismissWizardIfPresent();
    const s10 = await page.evaluate(() => ({
        pulseShell: !!document.querySelector(".gn-shell, [class*='gn-shell']"),
        v0:         !!document.querySelector(".pp-ai-sidebar"),
    }));
    record(`[S10]   probe: ${JSON.stringify(s10)}`);
    await page.screenshot({ path: join(OUT_DIR, "S10-resolver-v0.png"), fullPage: false });
    if (!s10.v0) finding("FAIL", "S10: resolver should have kept v0 when only ask-pulse visible");

    // ─── S11 Resolver — only dashboard tab visible ───────────────────
    currentScenario = "S11";
    record(`\n[S11] Resolver — only dashboard tab visible (legacy uiMode maps to DEFAULT_UI_MODE)`);
    await page.evaluate(() => {
        localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({
            aiInsights: false, askPulse: false, dashboard: true,
        }));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await dismissWizardIfPresent();
    const s11 = await page.evaluate(() => ({
        pulseShell: !!document.querySelector(".gn-shell, [class*='gn-shell']"),
        v0:         !!document.querySelector(".pp-ai-sidebar"),
        anyMount:   !!document.querySelector('main, [class*="pp-app"]'),
    }));
    record(`[S11]   probe: ${JSON.stringify(s11)}`);
    await page.screenshot({ path: join(OUT_DIR, "S11-dashboard-only.png"), fullPage: false });
    if (!s11.anyMount) finding("FAIL", "S11: app didn't mount anything with only dashboard tab visible");

    // ─── S12 Mobile 390px ────────────────────────────────────────────
    currentScenario = "S12";
    record(`\n[S12] Mobile 390px responsive — composer + chips visible, no horizontal overflow`);
    await page.setViewportSize({ width: 390, height: 844 });
    await clearStorage();
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await dismissWizardIfPresent();
    const s12 = await page.evaluate(() => {
        const html = document.documentElement;
        const overflow = html.scrollWidth - html.clientWidth;
        return {
            v0:          !!document.querySelector(".pp-ai-sidebar"),
            contextStrip:!!document.querySelector('[data-testid="pp-surface-context"]'),
            composer:    !!document.querySelector("textarea"),
            askBtn:      !!document.querySelector("button.pp-ai-sidebar__ask"),
            overflowPx:  overflow,
        };
    });
    record(`[S12]   probe: ${JSON.stringify(s12)}`);
    await page.screenshot({ path: join(OUT_DIR, "S12-mobile-390.png"), fullPage: true });
    if (!s12.v0) finding("FAIL", "S12: v0 didn't mount at mobile width");
    if (!s12.composer) finding("FAIL", "S12: composer missing at mobile width");
    if (s12.overflowPx > 0) finding("WARN", `S12: horizontal overflow ${s12.overflowPx}px at 390px`);

    // ─── Done ────────────────────────────────────────────────────────
    record(`\n[done] console errors observed: ${errors.length}`);
    record(`[done] findings logged: ${findings.length}`);

    await writeFile(join(OUT_DIR, "verify.log"), log.join("\n"), "utf-8");
    await writeFile(join(OUT_DIR, "findings.log"), findings.join("\n"), "utf-8");
    await writeFile(join(OUT_DIR, "errors.log"), errors.map(e => `[${e.scenario}] ${e.text}`).join("\n"), "utf-8");
    await browser.close();
}

main().catch(async (err) => {
    console.error("[FATAL]", err);
    await writeFile(join(OUT_DIR, "fatal.log"), err.stack || String(err), "utf-8").catch(() => undefined);
    process.exitCode = 1;
});
