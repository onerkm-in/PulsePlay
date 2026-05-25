#!/usr/bin/env node
// playground/scripts/verify-user-scenarios.mjs
//
// 5 USER SCENARIOS — beast-mode intense UI testing. Visible banner at
// top shows current scenario; yellow ring highlights interaction target.
// SlowMo=750ms so each step is observable. Each scenario screenshots
// key states.
//
// Scenarios:
//   S1. AI Insights cold-load + empty-state observation
//   S2. Ask Pulse — click starter question → Genie reply + TrustBadge
//   S3. Native BI viz — ask Pulse question → chart renders on Dashboard
//   S4. Settings → BI vendor picker exposure
//   S5. Cross-tab navigation — AI Insights → Ask Pulse → Dashboard with
//       toolbar uniformity check at each tab

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".scenarios-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";

const log = [];
const record = (line) => { log.push(line); console.log(line); };

// Inject a banner at top of page showing the current scenario.
async function setBanner(page, title, subtitle = "") {
    await page.evaluate(({ title, subtitle }) => {
        let banner = document.getElementById("__scenario_banner");
        if (!banner) {
            banner = document.createElement("div");
            banner.id = "__scenario_banner";
            banner.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0;
                background: linear-gradient(90deg, #0078d4 0%, #00bcf2 100%);
                color: white;
                padding: 10px 20px;
                z-index: 99999;
                font-family: -apple-system, sans-serif;
                font-size: 14px;
                font-weight: 600;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                pointer-events: none;
                display: flex;
                flex-direction: column;
                gap: 2px;
            `;
            document.body.appendChild(banner);
        }
        banner.innerHTML = `
            <div>${title}</div>
            ${subtitle ? `<div style="font-size:11px;font-weight:400;opacity:0.9">${subtitle}</div>` : ""}
        `;
    }, { title, subtitle });
}

// Highlight a target element with a yellow pulsing ring.
async function highlight(page, selector, durationMs = 1500) {
    await page.evaluate(({ selector, durationMs }) => {
        const el = document.querySelector(selector);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const ring = document.createElement("div");
        ring.style.cssText = `
            position: fixed;
            top: ${rect.top - 6}px;
            left: ${rect.left - 6}px;
            width: ${rect.width + 12}px;
            height: ${rect.height + 12}px;
            border: 3px solid #ffd700;
            border-radius: 8px;
            box-shadow: 0 0 16px rgba(255, 215, 0, 0.7);
            z-index: 99998;
            pointer-events: none;
            animation: __ring_pulse 0.6s ease-in-out infinite alternate;
        `;
        if (!document.getElementById("__ring_kf")) {
            const style = document.createElement("style");
            style.id = "__ring_kf";
            style.textContent = `@keyframes __ring_pulse { from { opacity: 0.6; } to { opacity: 1; } }`;
            document.head.appendChild(style);
        }
        document.body.appendChild(ring);
        setTimeout(() => ring.remove(), durationMs);
    }, { selector, durationMs });
}

async function seedProfile(page) {
    await page.evaluate((profile) => {
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile;
        window.localStorage.setItem(k, JSON.stringify(ex));
        window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({ aiInsights: true, askPulse: true, dashboard: true }));
        window.localStorage.removeItem("pulseplay:ui-mode");
    }, PROFILE);
}

async function waitForLastEntryFinal(page, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let final = null;
    while (Date.now() < deadline) {
        await page.waitForTimeout(1500);
        final = await page.evaluate(() => {
            const entries = Array.from(document.querySelectorAll('[data-testid^="pp-ai-entry-"]'));
            const last = entries[entries.length - 1];
            return last ? last.getAttribute("data-status") : null;
        });
        if (final === "completed" || final === "failed") return final;
    }
    return final || "timeout";
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    record(`╔══════════════════════════════════════════════════════════════════╗`);
    record(`║  PULSEPLAY USER-SCENARIO VALIDATION — 5 SCENARIOS @ slowMo=750ms  ║`);
    record(`║  Banner at top shows current scenario; yellow ring = target.     ║`);
    record(`╚══════════════════════════════════════════════════════════════════╝\n`);
    const browser = await chromium.launch({
        headless: false, slowMo: 750,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    page.on("pageerror", (err) => record(`[pageerror] ${err.message}`));

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20_000 });
    await seedProfile(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);

    // ── S1: AI Insights cold-load empty-state ─────────────────────────
    record(`\n═══ Scenario 1: AI Insights — cold load + empty-state ═══`);
    await setBanner(page, "🎬 SCENARIO 1 / 5 — AI Insights cold load", "Observing: tab strip, top-right toolbar, empty-state CTA");
    await page.locator("#gn-tab-insights").click().catch(() => {});
    await page.waitForTimeout(1200);
    await highlight(page, "#gn-tab-insights", 2000);
    await page.waitForTimeout(800);
    const s1 = await page.evaluate(() => ({
        hasSparkle: !!document.querySelector('svg path[d*="L14 10 L21 12"]'),
        bodyText: (document.querySelector("main")?.textContent || "").slice(0, 200),
        toolbarMounted: !!document.querySelector('[data-testid="pp-top-right-toolbar"]'),
    }));
    record(`[S1] sparkle icon visible: ${s1.hasSparkle}`);
    record(`[S1] toolbar mounted:       ${s1.toolbarMounted}`);
    record(`[S1] body sample: "${s1.bodyText.slice(0, 100)}…"`);
    await page.screenshot({ path: join(OUT_DIR, "S1-ai-insights-empty.png"), fullPage: false });
    record(`[S1] screenshot saved: S1-ai-insights-empty.png`);

    // ── S2: Ask Pulse — click starter question → Genie reply ──────────
    record(`\n═══ Scenario 2: Ask Pulse — click starter question → Genie reply ═══`);
    await setBanner(page, "🎬 SCENARIO 2 / 5 — Ask Pulse: click starter question", "Observing: starter list, click target, Genie reply, TrustBadge");
    await page.locator("#gn-tab-chat").click().catch(() => {});
    await page.waitForTimeout(1100);
    await highlight(page, "#gn-tab-chat", 1500);
    await page.waitForTimeout(800);
    // Find starter question(s).
    const starterCount = await page.locator('[data-testid="askpulse-starter-question"]').count();
    record(`[S2] starter questions visible: ${starterCount}`);
    if (starterCount > 0) {
        // Highlight + click the first one.
        await highlight(page, '[data-testid="askpulse-starter-question"]:first-of-type', 2200);
        await page.waitForTimeout(1500);
        await page.locator('[data-testid="askpulse-starter-question"]').first().click().catch(() => {});
        record(`[S2] clicked first starter question — waiting up to 60s for Genie reply…`);
        const final = await waitForLastEntryFinal(page, 60_000);
        record(`[S2] reply final status: ${final}`);
        await setBanner(page, "🎬 SCENARIO 2 / 5 — Ask Pulse: reply received", `Status: ${final}. Check for TrustBadge in reply.`);
        const replyObs = await page.evaluate(() => ({
            entries: document.querySelectorAll('[data-testid^="pp-ai-entry-"]').length,
            badges: document.querySelectorAll('[data-testid="trust-badge"]').length,
            firstBadgeStatus: document.querySelector('[data-testid="trust-badge"]')?.getAttribute("data-status"),
        }));
        record(`[S2] entries: ${replyObs.entries}  badges: ${replyObs.badges}  first-badge: ${replyObs.firstBadgeStatus}`);
        await page.screenshot({ path: join(OUT_DIR, "S2-ask-pulse-reply.png"), fullPage: true });
        record(`[S2] screenshot saved: S2-ask-pulse-reply.png`);
    } else {
        record(`[S2] ⚠️ no starter questions found — falling back to manual composer fill`);
        const composer = page.locator("textarea").first();
        await composer.fill("What are the top categories by sales?");
        await composer.press("Enter").catch(() => {});
        const final = await waitForLastEntryFinal(page, 60_000);
        record(`[S2] manual-fill reply status: ${final}`);
        await page.screenshot({ path: join(OUT_DIR, "S2-ask-pulse-reply.png"), fullPage: true });
    }

    // ── S3: Native BI viz — ask Pulse → chart renders on Dashboard ────
    record(`\n═══ Scenario 3: Native BI viz — ask Pulse → chart on Dashboard ═══`);
    await setBanner(page, "🎬 SCENARIO 3 / 5 — Native BI viz", "Switching to Dashboard tab to observe the AI chart canvas + any rendered result");
    await page.locator("#gn-tab-dashboard").click().catch(() => {});
    await page.waitForTimeout(1500);
    await highlight(page, "#gn-tab-dashboard", 2200);
    await page.waitForTimeout(1500);
    const s3 = await page.evaluate(() => ({
        hasChartCanvas: (document.body.textContent || "").includes("AI chart canvas"),
        hasIframe: document.querySelectorAll("iframe").length > 0,
        hasChartElement: !!document.querySelector('canvas, svg[class*="echarts"]'),
        nativeAdapterMounted: !!document.querySelector("[data-native-bi-adapter='true']"),
    }));
    record(`[S3] AI chart canvas headline visible: ${s3.hasChartCanvas}`);
    record(`[S3] BI iframe present (vendor-specific): ${s3.hasIframe}`);
    record(`[S3] chart element present (canvas/svg): ${s3.hasChartElement}`);
    record(`[S3] native-bi-adapter mounted: ${s3.nativeAdapterMounted}`);
    await page.screenshot({ path: join(OUT_DIR, "S3-dashboard-native-state.png"), fullPage: false });
    record(`[S3] screenshot saved: S3-dashboard-native-state.png`);

    // ── S4: Settings → BI vendor picker ──────────────────────────────
    record(`\n═══ Scenario 4: Settings → BI vendor picker exposure ═══`);
    await setBanner(page, "🎬 SCENARIO 4 / 5 — Settings → BI vendor picker", "Navigating to Settings → BI to inspect available vendor options");
    await page.goto(BASE + "/settings/bi", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await setBanner(page, "🎬 SCENARIO 4 / 5 — Settings → BI vendor picker", "Inspecting buttons: native / powerbi / tableau / qlik / looker / generic-iframe");
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await page.waitForTimeout(800);
    const s4 = await page.evaluate(() => {
        const t = (document.body.textContent || "").toLowerCase();
        return {
            hasNative:     t.includes("native"),
            hasPowerBI:    t.includes("power bi"),
            hasTableau:    t.includes("tableau"),
            hasQlik:       t.includes("qlik"),
            hasLooker:     t.includes("looker"),
            hasGeneric:    t.includes("generic"),
            vendorBtnCount: document.querySelectorAll("main button").length,
        };
    });
    record(`[S4] Native:    ${s4.hasNative}`);
    record(`[S4] Power BI:  ${s4.hasPowerBI}`);
    record(`[S4] Tableau:   ${s4.hasTableau}`);
    record(`[S4] Qlik:      ${s4.hasQlik}`);
    record(`[S4] Looker:    ${s4.hasLooker}`);
    record(`[S4] Generic:   ${s4.hasGeneric}`);
    record(`[S4] visible buttons in main: ${s4.vendorBtnCount}`);
    await page.screenshot({ path: join(OUT_DIR, "S4-settings-bi.png"), fullPage: true });
    record(`[S4] screenshot saved: S4-settings-bi.png`);

    // ── S5: Cross-tab navigation + toolbar uniformity ────────────────
    record(`\n═══ Scenario 5: Cross-tab navigation + toolbar uniformity ═══`);
    await setBanner(page, "🎬 SCENARIO 5 / 5 — Cross-tab navigation", "Cycling AI Insights → Ask Pulse → Dashboard; observe TopRightToolbar labels update");
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const tabs = [
        { id: "insights",  click: "#gn-tab-insights",  expectedLabel: "AI Insights" },
        { id: "chat",      click: "#gn-tab-chat",      expectedLabel: "Ask Pulse" },
        { id: "dashboard", click: "#gn-tab-dashboard", expectedLabel: "Dashboard" },
    ];
    for (const t of tabs) {
        await setBanner(page, "🎬 SCENARIO 5 / 5 — Cross-tab navigation", `Currently observing: ${t.expectedLabel} tab. Toolbar should reflect this tab name.`);
        await page.locator(t.click).click().catch(() => {});
        await page.waitForTimeout(1200);
        await highlight(page, t.click, 1500);
        await page.waitForTimeout(900);
        const obs = await page.evaluate(() => {
            const tb = document.querySelector('[data-testid="pp-top-right-toolbar"]');
            const firstBtn = tb?.querySelector("button");
            return {
                toolbarMounted: !!tb,
                btnCount: tb?.querySelectorAll("button").length || 0,
                firstBtnLabel: firstBtn?.getAttribute("aria-label") || "",
            };
        });
        const labelMatches = obs.firstBtnLabel.includes(t.expectedLabel);
        record(`[S5-${t.id}] toolbar mounted=${obs.toolbarMounted} btns=${obs.btnCount} firstLabel="${obs.firstBtnLabel}" matches=${labelMatches ? "✅" : "❌"}`);
        await page.screenshot({ path: join(OUT_DIR, `S5-${t.id}.png`), fullPage: false });
    }

    // Final summary banner.
    await setBanner(page, "✅ ALL 5 SCENARIOS COMPLETE", "Browser staying open 10s for visual review.");
    await page.waitForTimeout(10_000);

    record(`\n[done] closing`);
    await writeFile(join(OUT_DIR, "scenarios.log"), log.join("\n"), "utf-8");
    await browser.close();
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
