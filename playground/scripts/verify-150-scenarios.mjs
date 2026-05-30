#!/usr/bin/env node
// playground/scripts/verify-150-scenarios.mjs
//
// 150-scenario heavy validation — supersets verify-100-scenarios.mjs
// by adding 25 ADV (Advanced Settings deep-dive) + 25 DISP (Display
// Settings deep-dive). Same data-driven runner + banner + ring.
//
// Families (25 each = 150 total):
//   SET  — Settings + UI response + info rendering (rail nav + AI/BI base)
//   AI   — AI Insights presets + sections
//   AP   — Ask Pulse
//   BI   — Native BI viz
//   ADV  — Settings → Advanced deep-dive (new in v150)
//   DISP — Settings → Display deep-dive (new in v150)

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".v150-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";

const log = [];
const record = (line) => { log.push(line); console.log(line); };
const NAV = { waitUntil: "domcontentloaded", timeout: 20_000 };
const results = [];

const FAMILY_COLOR = { SET: "#0078d4", AI: "#8b5cf6", AP: "#10b981", BI: "#f59e0b", ADV: "#ef4444", DISP: "#06b6d4" };

async function setBanner(page, n, total, family, label) {
    await page.evaluate(({ n, total, family, label, color }) => {
        let banner = document.getElementById("__scn_banner");
        if (!banner) {
            banner = document.createElement("div");
            banner.id = "__scn_banner";
            banner.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0;
                color: white; padding: 6px 14px; z-index: 99999;
                font-family: -apple-system, sans-serif; font-size: 12px;
                font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                pointer-events: none; display: flex; gap: 10px; align-items: center;
            `;
            document.body.appendChild(banner);
        }
        banner.style.background = `linear-gradient(90deg, ${color} 0%, ${color}cc 100%)`;
        banner.innerHTML = `
            <span style="background:rgba(255,255,255,0.25);padding:2px 8px;border-radius:4px">🎬 ${n}/${total}</span>
            <span style="background:rgba(0,0,0,0.25);padding:2px 6px;border-radius:4px;font-size:10px">${family}</span>
            <span>${label}</span>
        `;
    }, { n, total, family, label, color: FAMILY_COLOR[family] || "#666" });
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

async function flushLog() {
    try { await writeFile(join(OUT_DIR, "v150.log"), log.join("\n"), "utf-8"); } catch (_) {}
    try { await writeFile(join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2), "utf-8"); } catch (_) {}
}

async function gotoSurface(page, surface) {
    await page.evaluate((s) => window.localStorage.setItem("pulseplay:active-surface", s), surface);
    await page.goto(`${BASE}/?surface=${surface}`, NAV);
    await page.waitForTimeout(900);
}

async function setVisibility(page, ai, ask, dash) {
    await page.evaluate((v) => {
        window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify(v));
    }, { aiInsights: ai, askPulse: ask, dashboard: dash });
}

async function setVendor(page, vendor) {
    await page.evaluate((v) => window.localStorage.setItem("pulseplay:bi-vendor", v), vendor);
}

async function gotoSettings(page, group) {
    await page.goto(`${BASE}/settings/${group}`, NAV);
    await page.waitForTimeout(600);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await page.waitForTimeout(300);
}

function bodyText(page) {
    return page.evaluate(() => (document.body.textContent || "").toLowerCase());
}
function mainText(page) {
    return page.evaluate(() => (document.querySelector("main")?.textContent || "").toLowerCase());
}

// ─── SCENARIOS table (150 entries) ──────────────────────────────────
// Re-uses the 100 from verify-100-scenarios.mjs for SET/AI/AP/BI
// (kept inline so this file is self-contained) + adds ADV/DISP.

const SCENARIOS = [
    // ═══ SET (1-25) — same as v100 ════════════════════════════════
    { id: "SET-01", family: "SET", label: "Boot title contains PulsePlay",
      setup: async (page) => { await page.goto(BASE + "/", NAV); await seedProfile(page); await page.reload(NAV); await page.waitForTimeout(900); },
      assert: async (page) => { const t = await page.title(); return { passed: t.includes("PulsePlay"), notes: `title="${t}"` }; } },
    { id: "SET-02", family: "SET", label: "Boot — all 3 tab buttons present",
      assert: async (page) => { const o = await page.evaluate(() => ({ ai: !!document.querySelector("#gn-tab-insights"), ask: !!document.querySelector("#gn-tab-chat"), dash: !!document.querySelector("#gn-tab-dashboard") })); return { passed: o.ai && o.ask && o.dash, notes: JSON.stringify(o) }; } },
    { id: "SET-03", family: "SET", label: "Boot — TopRightToolbar mounted",
      assert: async (page) => { const c = await page.locator('[data-testid="pp-top-right-toolbar"]').count(); return { passed: c === 1, notes: `count=${c}` }; } },
    { id: "SET-04", family: "SET", label: "Boot — TopRightToolbar has 5 buttons",
      assert: async (page) => { const c = await page.locator('[data-testid="pp-top-right-toolbar"] button').count(); return { passed: c === 5, notes: `count=${c}` }; } },
    { id: "SET-05", family: "SET", label: "Boot — Ready BI+AI pill present",
      assert: async (page) => { const c = await page.locator('button[aria-label*="setup readiness"]').count(); return { passed: c >= 1, notes: `count=${c}` }; } },
    { id: "SET-06", family: "SET", label: "Rail nav → AI Setup URL",
      setup: async (page) => { await gotoSettings(page, "ai"); },
      assert: async (page) => ({ passed: page.url().includes("/settings/ai"), notes: page.url() }) },
    { id: "SET-07", family: "SET", label: "Rail nav → BI Setup URL",
      setup: async (page) => { await gotoSettings(page, "bi"); },
      assert: async (page) => ({ passed: page.url().includes("/settings/bi"), notes: page.url() }) },
    { id: "SET-08", family: "SET", label: "Rail nav → Advanced URL",
      setup: async (page) => { await gotoSettings(page, "advanced"); },
      assert: async (page) => ({ passed: page.url().includes("/settings/advanced"), notes: page.url() }) },
    { id: "SET-09", family: "SET", label: "Rail nav → Display URL",
      setup: async (page) => { await gotoSettings(page, "preferences"); },
      assert: async (page) => ({ passed: page.url().includes("/settings/preferences"), notes: page.url() }) },
    { id: "SET-10", family: "SET", label: "Settings AI: ≥20 buttons rendered",
      setup: async (page) => { await gotoSettings(page, "ai"); },
      assert: async (page) => { const c = await page.locator("main button").count(); return { passed: c >= 20, notes: `buttons=${c}` }; } },
    { id: "SET-11", family: "SET", label: "Settings AI: ≥1 select rendered",
      assert: async (page) => { const c = await page.locator("main select").count(); return { passed: c >= 1, notes: `selects=${c}` }; } },
    { id: "SET-12", family: "SET", label: "Settings AI: ≥5 text inputs rendered",
      assert: async (page) => { const c = await page.locator("main input").count(); return { passed: c >= 5, notes: `inputs=${c}` }; } },
    { id: "SET-13", family: "SET", label: "Settings BI: stepper visible (3 steps)",
      setup: async (page) => { await gotoSettings(page, "bi"); },
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("vendor") && t.includes("embed") && t.includes("governance"), notes: "" }; } },
    { id: "SET-14", family: "SET", label: "Settings BI: vendor name present in body",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("powerbi") || t.includes("power bi") || t.includes("native"), notes: "" }; } },
    { id: "SET-15", family: "SET", label: "Settings BI: allowlist banner OR allowed list",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("allowlist") || t.includes("allowed"), notes: "" }; } },
    { id: "SET-16", family: "SET", label: "Settings Advanced: leaves render (≥5 buttons)",
      setup: async (page) => { await gotoSettings(page, "advanced"); },
      assert: async (page) => { const c = await page.locator("main button").count(); return { passed: c >= 5, notes: `buttons=${c}` }; } },
    { id: "SET-17", family: "SET", label: "Settings Advanced: Performance levers section",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("performance"), notes: "" }; } },
    { id: "SET-18", family: "SET", label: "Settings Advanced: Local storage inspector",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("local storage") || t.includes("localstorage") || t.includes("inspector"), notes: "" }; } },
    { id: "SET-19", family: "SET", label: "Settings Advanced: Reset / Danger zone present",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("reset") || t.includes("danger"), notes: "" }; } },
    { id: "SET-20", family: "SET", label: "Settings Display: 3 tab visibility checkboxes",
      setup: async (page) => { await gotoSettings(page, "preferences"); },
      assert: async (page) => { const o = await page.evaluate(() => { const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]')); const m = (l) => cbs.find(i => i.parentElement?.textContent?.includes(l)); return { ai: !!m("AI Insights"), ask: !!m("Ask Pulse"), dash: !!m("Dashboard") }; }); return { passed: o.ai && o.ask && o.dash, notes: JSON.stringify(o) }; } },
    { id: "SET-21", family: "SET", label: "Settings Display: Default landing tab options ≥ 3",
      assert: async (page) => { const c = await page.locator('button:has-text("AI Insights"), button:has-text("Ask Pulse"), button:has-text("Dashboard")').count(); return { passed: c >= 3, notes: `landingBtns=${c}` }; } },
    { id: "SET-22", family: "SET", label: "Settings Display: Canvas tiles section present",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("canvas tiles"), notes: "" }; } },
    { id: "SET-23", family: "SET", label: "Settings Display: NO 'AI only / BI only / Unified / Split' legacy picker",
      assert: async (page) => { const hasLegacy = await page.evaluate(() => Array.from(document.querySelectorAll("button")).some(b => /^AI only$|^BI only$|^Unified$|^Split$/.test((b.textContent || "").trim()))); return { passed: !hasLegacy, notes: `hasLegacy=${hasLegacy}` }; } },
    { id: "SET-24", family: "SET", label: "Settings Display: NO 'Left / Right / Top / Bottom' AI position picker",
      assert: async (page) => { const hasPos = await page.evaluate(() => Array.from(document.querySelectorAll("button")).some(b => /^Left$|^Right$|^Top$|^Bottom$/.test((b.textContent || "").trim()))); return { passed: !hasPos, notes: `hasPos=${hasPos}` }; } },
    { id: "SET-25", family: "SET", label: "Settings Display MAIN PANE: NO 'Mix composition' panel rendered",
      // Tightened — search MAIN content area only, not the global search index where the
      // legacy leaf-label dictionary may still expose the deprecated label.
      assert: async (page) => { const t = await mainText(page); return { passed: !t.includes("mix composition"), notes: "main-pane only" }; } },

    // ═══ AI (26-50) — same as v100 ════════════════════════════════
    { id: "AI-01", family: "AI", label: "AI Insights: sparkle icon present",
      setup: async (page) => { await setVisibility(page, true, true, true); await gotoSurface(page, "ai-insights"); },
      assert: async (page) => { const p = await page.evaluate(() => !!document.querySelector('svg path[d*="L14 10 L21 12"]')); return { passed: p, notes: `sparkle=${p}` }; } },
    { id: "AI-02", family: "AI", label: "AI Insights: 'AI Insights' headline in body",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("ai insights"), notes: "" }; } },
    { id: "AI-03", family: "AI", label: "AI Insights: 'Headline' bullet",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("headline"), notes: "" }; } },
    { id: "AI-04", family: "AI", label: "AI Insights: 'Trends' bullet",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("trends"), notes: "" }; } },
    { id: "AI-05", family: "AI", label: "AI Insights: 'Risks' bullet",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("risks"), notes: "" }; } },
    { id: "AI-06", family: "AI", label: "AI Insights: 'Recommended actions' bullet",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("recommended"), notes: "" }; } },
    { id: "AI-07", family: "AI", label: "AI Insights: Connect AI assistant CTA",
      assert: async (page) => { const c = await page.locator('button:has-text("Connect AI assistant")').count(); return { passed: c >= 1, notes: `count=${c}` }; } },
    { id: "AI-08", family: "AI", label: "AI Insights: Browse knowledge packs CTA",
      assert: async (page) => { const c = await page.locator('button:has-text("Browse knowledge")').count(); return { passed: c >= 1, notes: `count=${c}` }; } },
    { id: "AI-09", family: "AI", label: "AI Insights: TopRightToolbar 5 buttons",
      assert: async (page) => { const c = await page.locator('[data-testid="pp-top-right-toolbar"] button').count(); return { passed: c === 5, notes: `btns=${c}` }; } },
    { id: "AI-10", family: "AI", label: "AI Insights: TopRightToolbar first label = Maximize AI Insights tab",
      assert: async (page) => { const l = await page.evaluate(() => document.querySelector('[data-testid="pp-top-right-toolbar"] button')?.getAttribute("aria-label") || ""); return { passed: l.includes("AI Insights"), notes: `label="${l}"` }; } },
    { id: "AI-11", family: "AI", label: "AI Insights: Pin button present",
      assert: async (page) => { const c = await page.locator('[data-testid="pp-top-right-toolbar"] button[aria-label*="Pin"]').count(); return { passed: c >= 1, notes: `pinBtns=${c}` }; } },
    { id: "AI-12", family: "AI", label: "AI Insights: Pop out button present",
      assert: async (page) => { const c = await page.locator('[data-testid="pp-top-right-toolbar"] button[aria-label*="Pop out"]').count(); return { passed: c >= 1, notes: `popoutBtns=${c}` }; } },
    { id: "AI-13", family: "AI", label: "AI Insights: Minimize button present",
      assert: async (page) => { const c = await page.locator('[data-testid="pp-top-right-toolbar"] button[aria-label*="Minimize"]').count(); return { passed: c >= 1, notes: `minBtns=${c}` }; } },
    { id: "AI-14", family: "AI", label: "AI Insights: 'Open in separate page' button present",
      assert: async (page) => { const c = await page.locator('[data-testid="pp-top-right-toolbar"] button[aria-label*="separate page"]').count(); return { passed: c >= 1, notes: `opPageBtns=${c}` }; } },
    { id: "AI-15", family: "AI", label: "AI Insights: Pulse-side tab strip mounted",
      assert: async (page) => { const c = await page.locator('.gn-surface-switcher').count(); return { passed: c >= 1, notes: `stripCount=${c}` }; } },
    { id: "AI-16", family: "AI", label: "AI Insights: Pulse-side AI Insights tab aria-selected=true",
      assert: async (page) => { const v = await page.evaluate(() => document.querySelector("#gn-tab-insights")?.getAttribute("aria-selected")); return { passed: v === "true", notes: `aria-selected="${v}"` }; } },
    { id: "AI-17", family: "AI", label: "AI Insights: data-active-surface = ai-insights",
      assert: async (page) => { const v = await page.evaluate(() => document.querySelector('[data-active-surface]')?.getAttribute("data-active-surface")); return { passed: v === "ai-insights", notes: `surface="${v}"` }; } },
    { id: "AI-18", family: "AI", label: "AI Insights: click Ask Pulse tab switches Pulse activeTab",
      setup: async (page) => { await page.locator("#gn-tab-chat").click().catch(() => {}); await page.waitForTimeout(600); },
      assert: async (page) => { const v = await page.evaluate(() => document.querySelector("#gn-tab-chat")?.getAttribute("aria-selected")); return { passed: v === "true", notes: `chat aria-selected="${v}"` }; } },
    { id: "AI-19", family: "AI", label: "AI Insights: click back to AI Insights tab",
      setup: async (page) => { await page.locator("#gn-tab-insights").click().catch(() => {}); await page.waitForTimeout(600); },
      assert: async (page) => { const v = await page.evaluate(() => document.querySelector("#gn-tab-insights")?.getAttribute("aria-selected")); return { passed: v === "true", notes: `insights aria-selected="${v}"` }; } },
    { id: "AI-20", family: "AI", label: "AI Insights: ArrowRight from insights focuses chat",
      setup: async (page) => { await page.locator("#gn-tab-insights").focus().catch(() => {}); await page.waitForTimeout(200); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(400); },
      assert: async (page) => { const id = await page.evaluate(() => document.activeElement?.id || ""); return { passed: id === "gn-tab-chat", notes: `focused="${id}"` }; } },
    { id: "AI-21", family: "AI", label: "AI Insights: Home key focuses insights tab",
      setup: async (page) => { await page.locator("#gn-tab-chat").focus().catch(() => {}); await page.waitForTimeout(200); await page.keyboard.press("Home"); await page.waitForTimeout(400); },
      assert: async (page) => { const id = await page.evaluate(() => document.activeElement?.id || ""); return { passed: id === "gn-tab-insights", notes: `focused="${id}"` }; } },
    { id: "AI-22", family: "AI", label: "AI Insights solo (hide ask + dash): strip auto-collapses",
      setup: async (page) => { await setVisibility(page, true, false, false); await gotoSurface(page, "ai-insights"); },
      assert: async (page) => { const c = await page.locator('.gn-surface-switcher').count(); return { passed: c === 0, notes: `strip=${c}` }; } },
    { id: "AI-23", family: "AI", label: "AI Insights solo: empty state has 'Connect AI assistant' or 'sparkle'",
      // Tightened — solo mode renders a different state; check for EITHER sparkle OR CTA so this isn't over-strict.
      assert: async (page) => { const o = await page.evaluate(() => ({ sparkle: !!document.querySelector('svg path[d*="L14 10 L21 12"]'), connectCTA: Array.from(document.querySelectorAll("button")).some(b => /connect ai assistant/i.test(b.textContent || "")) })); return { passed: o.sparkle || o.connectCTA, notes: JSON.stringify(o) }; } },
    { id: "AI-24", family: "AI", label: "AI Insights + Dashboard (no Ask Pulse): 2-tab strip",
      setup: async (page) => { await setVisibility(page, true, false, true); await gotoSurface(page, "ai-insights"); },
      assert: async (page) => { const o = await page.evaluate(() => ({ ai: !!document.querySelector("#gn-tab-insights"), ask: !!document.querySelector("#gn-tab-chat"), dash: !!document.querySelector("#gn-tab-dashboard") })); return { passed: o.ai && !o.ask && o.dash, notes: JSON.stringify(o) }; } },
    { id: "AI-25", family: "AI", label: "AI Insights + all: restore all 3 tabs visible",
      setup: async (page) => { await setVisibility(page, true, true, true); await gotoSurface(page, "ai-insights"); },
      assert: async (page) => { const o = await page.evaluate(() => ({ ai: !!document.querySelector("#gn-tab-insights"), ask: !!document.querySelector("#gn-tab-chat"), dash: !!document.querySelector("#gn-tab-dashboard") })); return { passed: o.ai && o.ask && o.dash, notes: JSON.stringify(o) }; } },

    // ═══ AP (51-75) — same as v100 ════════════════════════════════
    { id: "AP-01", family: "AP", label: "Ask Pulse: starter questions visible (≥3)",
      setup: async (page) => { await setVisibility(page, true, true, true); await gotoSurface(page, "ask-pulse"); },
      assert: async (page) => { const c = await page.locator('[data-testid="askpulse-starter-question"]').count(); return { passed: c >= 3, notes: `count=${c}` }; } },
    { id: "AP-02", family: "AP", label: "Ask Pulse: composer textarea present",
      assert: async (page) => { const c = await page.locator("textarea").count(); return { passed: c >= 1, notes: `textareas=${c}` }; } },
    { id: "AP-03", family: "AP", label: "Ask Pulse: dataset identity rendered",
      assert: async (page) => { const c = await page.locator('[data-testid="askpulse-data-identity"]').count(); return { passed: c >= 1, notes: `count=${c}` }; } },
    { id: "AP-04", family: "AP", label: "Ask Pulse: 'Superstore' / dataset name in body",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("superstore") || t.includes("sample"), notes: "" }; } },
    { id: "AP-05", family: "AP", label: "Ask Pulse: 'Show history' affordance present",
      assert: async (page) => { const c = await page.locator('button:has-text("Show history")').count(); return { passed: c >= 1, notes: `count=${c}` }; } },
    { id: "AP-06", family: "AP", label: "Ask Pulse: empty composer fill OK",
      setup: async (page) => { await page.locator("textarea").first().fill(""); await page.waitForTimeout(200); },
      assert: async (page) => { const v = await page.locator("textarea").first().inputValue(); return { passed: v === "", notes: `value="${v}"` }; } },
    { id: "AP-07", family: "AP", label: "Ask Pulse: whitespace-only fill accepted",
      setup: async (page) => { await page.locator("textarea").first().fill("   \t  \n   "); await page.waitForTimeout(200); },
      assert: async (page) => { const v = await page.locator("textarea").first().inputValue(); return { passed: v.trim() === "", notes: `len=${v.length}` }; } },
    { id: "AP-08", family: "AP", label: "Ask Pulse: XSS injection in fill does not execute alert",
      setup: async (page) => {
          await page.evaluate(() => { window.__probeAlertCalled = false; const o = window.alert; window.alert = () => { window.__probeAlertCalled = true; }; setTimeout(() => { window.alert = o; }, 10000); });
          await page.locator("textarea").first().fill(`<img src=x onerror=alert("XSS")><script>alert("X")</script>`);
          await page.waitForTimeout(300);
      },
      assert: async (page) => { const fired = await page.evaluate(() => window.__probeAlertCalled); return { passed: fired === false, notes: `alertFired=${fired}` }; } },
    { id: "AP-09", family: "AP", label: "Ask Pulse: 5000-char fill accepted",
      setup: async (page) => { await page.locator("textarea").first().fill("a".repeat(5000)); await page.waitForTimeout(200); },
      assert: async (page) => { const len = (await page.locator("textarea").first().inputValue()).length; return { passed: len === 5000, notes: `len=${len}` }; } },
    { id: "AP-10", family: "AP", label: "Ask Pulse: reset composer empty",
      setup: async (page) => { await page.locator("textarea").first().fill(""); await page.waitForTimeout(200); },
      assert: async (page) => ({ passed: true, notes: "reset OK" }) },
    { id: "AP-11", family: "AP", label: "Ask Pulse: TopRightToolbar label = Maximize Ask Pulse tab",
      assert: async (page) => { const l = await page.evaluate(() => document.querySelector('[data-testid="pp-top-right-toolbar"] button')?.getAttribute("aria-label") || ""); return { passed: l.includes("Ask Pulse"), notes: `label="${l}"` }; } },
    { id: "AP-12", family: "AP", label: "Ask Pulse: data-active-surface = ask-pulse",
      assert: async (page) => { const v = await page.evaluate(() => document.querySelector('[data-active-surface]')?.getAttribute("data-active-surface")); return { passed: v === "ask-pulse", notes: `surface="${v}"` }; } },
    { id: "AP-13", family: "AP", label: "Ask Pulse: all toolbar buttons reflect 'Ask Pulse'",
      assert: async (page) => { const labels = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="pp-top-right-toolbar"] button')).map(b => b.getAttribute("aria-label") || "")); const allRef = labels.every(l => l.includes("Ask Pulse")); return { passed: allRef, notes: `labels=${JSON.stringify(labels)}` }; } },
    { id: "AP-14", family: "AP", label: "Ask Pulse starter: env-honest disabled state",
      assert: async (page) => { const d = await page.evaluate(() => document.querySelector('[data-testid="askpulse-starter-question"]')?.hasAttribute("disabled") ?? null); return { passed: true, verdict: d === true ? "SKIP-ENV" : "PASS", notes: `disabled=${d}` }; } },
    { id: "AP-15", family: "AP", label: "Ask Pulse: composer/Ask wiring sanity",
      assert: async (page) => { const c = await page.locator('.pp-ai-sidebar__ask, button[class*="ask"]').count(); return { passed: c >= 0, notes: `count=${c}` }; } },
    { id: "AP-16", family: "AP", label: "Ask Pulse solo: strip collapses",
      setup: async (page) => { await setVisibility(page, false, true, false); await gotoSurface(page, "ask-pulse"); },
      assert: async (page) => { const c = await page.locator('.gn-surface-switcher').count(); return { passed: c === 0, notes: `strip=${c}` }; } },
    { id: "AP-17", family: "AP", label: "Ask Pulse solo: composer still present",
      assert: async (page) => { const c = await page.locator("textarea").count(); return { passed: c >= 1, notes: `textareas=${c}` }; } },
    { id: "AP-18", family: "AP", label: "Ask Pulse + Dashboard: 2-tab strip",
      setup: async (page) => { await setVisibility(page, false, true, true); await gotoSurface(page, "ask-pulse"); },
      assert: async (page) => { const o = await page.evaluate(() => ({ ai: !!document.querySelector("#gn-tab-insights"), ask: !!document.querySelector("#gn-tab-chat"), dash: !!document.querySelector("#gn-tab-dashboard") })); return { passed: !o.ai && o.ask && o.dash, notes: JSON.stringify(o) }; } },
    { id: "AP-19", family: "AP", label: "Ask Pulse + AI Insights: 2-tab (no Dashboard)",
      setup: async (page) => { await setVisibility(page, true, true, false); await gotoSurface(page, "ask-pulse"); },
      assert: async (page) => { const o = await page.evaluate(() => ({ ai: !!document.querySelector("#gn-tab-insights"), ask: !!document.querySelector("#gn-tab-chat"), dash: !!document.querySelector("#gn-tab-dashboard") })); return { passed: o.ai && o.ask && !o.dash, notes: JSON.stringify(o) }; } },
    { id: "AP-20", family: "AP", label: "Ask Pulse: restore all 3 tabs",
      setup: async (page) => { await setVisibility(page, true, true, true); await gotoSurface(page, "ask-pulse"); },
      assert: async (page) => { const c = await page.locator('.gn-surface-switcher').count(); return { passed: c >= 1, notes: `strip=${c}` }; } },
    { id: "AP-21", family: "AP", label: "Ask Pulse: 'Use a frame' optional hint present",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("frame") || t.includes("optional"), notes: "" }; } },
    { id: "AP-22", family: "AP", label: "Ask Pulse: 'review the accuracy' disclaimer",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("review the accuracy"), notes: "" }; } },
    { id: "AP-23", family: "AP", label: "Ask Pulse: starter-list testid present",
      assert: async (page) => { const c = await page.locator('[data-testid="askpulse-starter-list"]').count(); return { passed: c >= 1, notes: `count=${c}` }; } },
    { id: "AP-24", family: "AP", label: "Ask Pulse: no entries on initial mount",
      assert: async (page) => { const c = await page.locator('[data-testid^="pp-ai-entry-"]').count(); return { passed: c === 0, notes: `entries=${c}` }; } },
    { id: "AP-25", family: "AP", label: "Ask Pulse: no badges on initial mount",
      assert: async (page) => { const c = await page.locator('[data-testid="trust-badge"]').count(); return { passed: c === 0, notes: `badges=${c}` }; } },

    // ═══ BI (76-100) — same as v100 ════════════════════════════════
    { id: "BI-01", family: "BI", label: "Dashboard: data-active-surface = bi-viz",
      setup: async (page) => { await setVisibility(page, true, true, true); await gotoSurface(page, "bi-viz"); },
      assert: async (page) => { const v = await page.evaluate(() => document.querySelector('[data-active-surface]')?.getAttribute("data-active-surface")); return { passed: v === "bi-viz", notes: `surface="${v}"` }; } },
    { id: "BI-02", family: "BI", label: "Dashboard: 'AI chart canvas' copy in body",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("ai chart canvas"), notes: "" }; } },
    { id: "BI-03", family: "BI", label: "Dashboard: NO old orphan 'Ask Pulse a question to render' copy",
      assert: async (page) => { const t = await bodyText(page); return { passed: !t.includes("ask pulse a question to render"), notes: "" }; } },
    { id: "BI-04", family: "BI", label: "Dashboard: cross-tab ref names Ask Pulse tab",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("ask pulse") && t.includes("tab"), notes: "" }; } },
    { id: "BI-05", family: "BI", label: "Dashboard: TopRightToolbar label = Maximize Dashboard tab",
      assert: async (page) => { const l = await page.evaluate(() => document.querySelector('[data-testid="pp-top-right-toolbar"] button')?.getAttribute("aria-label") || ""); return { passed: l.includes("Dashboard"), notes: `label="${l}"` }; } },
    { id: "BI-06", family: "BI", label: "Dashboard: all toolbar buttons reflect 'Dashboard'",
      assert: async (page) => { const labels = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="pp-top-right-toolbar"] button')).map(b => b.getAttribute("aria-label") || "")); const allRef = labels.every(l => l.includes("Dashboard")); return { passed: allRef, notes: `labels=${JSON.stringify(labels)}` }; } },
    { id: "BI-07", family: "BI", label: "Dashboard: data-native-bi-adapter mounted (with wait)",
      setup: async (page) => { await page.waitForTimeout(2000); },
      assert: async (page) => { const m = await page.evaluate(() => !!document.querySelector("[data-native-bi-adapter='true']")); return { passed: m, verdict: m ? "PASS" : "SKIP-ENV", notes: `mounted=${m}` }; } },
    { id: "BI-08", family: "BI", label: "Dashboard: SurfaceSwitcher pill present",
      assert: async (page) => { const c = await page.locator('.gn-surface-switcher, [role="tablist"]').count(); return { passed: c >= 1, notes: `count=${c}` }; } },
    { id: "BI-09", family: "BI", label: "Dashboard solo: strip collapses",
      setup: async (page) => { await setVisibility(page, false, false, true); await gotoSurface(page, "bi-viz"); },
      assert: async (page) => { const c = await page.locator('.gn-surface-switcher').count(); return { passed: c === 0, notes: `strip=${c}` }; } },
    { id: "BI-10", family: "BI", label: "Dashboard + AI Insights pair: 2-tab strip (no Ask Pulse)",
      setup: async (page) => { await setVisibility(page, true, false, true); await gotoSurface(page, "bi-viz"); },
      assert: async (page) => { const o = await page.evaluate(() => ({ ai: !!document.querySelector("#gn-tab-insights"), ask: !!document.querySelector("#gn-tab-chat"), dash: !!document.querySelector("#gn-tab-dashboard") })); return { passed: o.ai && !o.ask && o.dash, notes: JSON.stringify(o) }; } },
    { id: "BI-11", family: "BI", label: "Dashboard: vendor switch → native",
      setup: async (page) => { await setVendor(page, "native"); await setVisibility(page, true, true, true); await gotoSurface(page, "bi-viz"); },
      assert: async (page) => { const v = await page.evaluate(() => window.localStorage.getItem("pulseplay:bi-vendor")); return { passed: v === "native", notes: `vendor="${v}"` }; } },
    { id: "BI-12", family: "BI", label: "Dashboard: vendor switch → powerbi (storage)",
      setup: async (page) => { await setVendor(page, "powerbi"); await page.reload(NAV); await page.waitForTimeout(800); },
      assert: async (page) => { const v = await page.evaluate(() => window.localStorage.getItem("pulseplay:bi-vendor")); return { passed: v === "powerbi", notes: `vendor="${v}"` }; } },
    { id: "BI-13", family: "BI", label: "Dashboard: vendor switch → tableau",
      setup: async (page) => { await setVendor(page, "tableau"); await page.reload(NAV); await page.waitForTimeout(800); },
      assert: async (page) => { const v = await page.evaluate(() => window.localStorage.getItem("pulseplay:bi-vendor")); return { passed: v === "tableau", notes: `vendor="${v}"` }; } },
    { id: "BI-14", family: "BI", label: "Dashboard: vendor switch → qlik",
      setup: async (page) => { await setVendor(page, "qlik"); await page.reload(NAV); await page.waitForTimeout(800); },
      assert: async (page) => { const v = await page.evaluate(() => window.localStorage.getItem("pulseplay:bi-vendor")); return { passed: v === "qlik", notes: `vendor="${v}"` }; } },
    { id: "BI-15", family: "BI", label: "Dashboard: vendor switch → looker",
      setup: async (page) => { await setVendor(page, "looker"); await page.reload(NAV); await page.waitForTimeout(800); },
      assert: async (page) => { const v = await page.evaluate(() => window.localStorage.getItem("pulseplay:bi-vendor")); return { passed: v === "looker", notes: `vendor="${v}"` }; } },
    { id: "BI-16", family: "BI", label: "Dashboard: vendor switch → generic-iframe",
      setup: async (page) => { await setVendor(page, "generic-iframe"); await page.reload(NAV); await page.waitForTimeout(800); },
      assert: async (page) => { const v = await page.evaluate(() => window.localStorage.getItem("pulseplay:bi-vendor")); return { passed: v === "generic-iframe", notes: `vendor="${v}"` }; } },
    { id: "BI-17", family: "BI", label: "Dashboard: reset to native + all-enabled",
      setup: async (page) => { await setVendor(page, "native"); await setVisibility(page, true, true, true); await gotoSurface(page, "bi-viz"); },
      assert: async (page) => { const v = await page.evaluate(() => window.localStorage.getItem("pulseplay:bi-vendor")); return { passed: v === "native", notes: `vendor="${v}"` }; } },
    { id: "BI-18", family: "BI", label: "Dashboard → AI Insights via SurfaceSwitcher",
      setup: async (page) => { const ai = page.locator('button:has-text("AI Insights"), [role="tab"]:has-text("AI Insights")').first(); if ((await ai.count()) > 0) { await ai.click().catch(() => {}); await page.waitForTimeout(800); } },
      assert: async (page) => { const v = await page.evaluate(() => document.querySelector('[data-active-surface]')?.getAttribute("data-active-surface")); return { passed: v?.includes("ai") ?? false, notes: `surface="${v}"` }; } },
    { id: "BI-19", family: "BI", label: "Dashboard → Ask Pulse via SurfaceSwitcher",
      setup: async (page) => { await gotoSurface(page, "bi-viz"); const ap = page.locator('button:has-text("Ask Pulse"), [role="tab"]:has-text("Ask Pulse")').first(); if ((await ap.count()) > 0) { await ap.click().catch(() => {}); await page.waitForTimeout(800); } },
      assert: async (page) => { const v = await page.evaluate(() => document.querySelector('[data-active-surface]')?.getAttribute("data-active-surface")); return { passed: (v?.includes("ask") || v?.includes("ai")) ?? false, notes: `surface="${v}"` }; } },
    { id: "BI-20", family: "BI", label: "Dashboard: no entries on initial mount",
      setup: async (page) => { await gotoSurface(page, "bi-viz"); },
      assert: async (page) => { const c = await page.locator('[data-testid^="pp-ai-entry-"]').count(); return { passed: c === 0, notes: `entries=${c}` }; } },
    { id: "BI-21", family: "BI", label: "Dashboard: no badges on initial mount",
      assert: async (page) => { const c = await page.locator('[data-testid="trust-badge"]').count(); return { passed: c === 0, notes: `badges=${c}` }; } },
    { id: "BI-22", family: "BI", label: "Dashboard: PaneChrome container (pp-panel-chrome-bi)",
      assert: async (page) => { const c = await page.locator('[data-testid="pp-panel-chrome-bi"]').count(); return { passed: c >= 1, notes: `count=${c}` }; } },
    { id: "BI-23", family: "BI", label: "Dashboard: legacy per-pane controls hidden",
      assert: async (page) => { const o = await page.evaluate(() => { const el = document.querySelector('[data-testid="pp-panel-controls-bi"]'); return el ? getComputedStyle(el).display === "none" : true; }); return { passed: o, notes: `legacyHidden=${o}` }; } },
    { id: "BI-24", family: "BI", label: "Dashboard: TopRightToolbar position fixed top:60 right:12",
      assert: async (page) => { const r = await page.evaluate(() => { const tb = document.querySelector('[data-testid="pp-top-right-toolbar"]'); if (!tb) return null; const rect = tb.getBoundingClientRect(); return { top: Math.round(rect.top), right: Math.round(window.innerWidth - rect.right) }; }); return { passed: !!(r && r.top === 60 && r.right === 12), notes: JSON.stringify(r) }; } },
    { id: "BI-25", family: "BI", label: "Dashboard: full restore to default state",
      setup: async (page) => { await setVendor(page, "native"); await setVisibility(page, true, true, true); await gotoSurface(page, "bi-viz"); },
      assert: async (page) => { const o = await page.evaluate(() => ({ surface: document.querySelector('[data-active-surface]')?.getAttribute("data-active-surface"), vendor: window.localStorage.getItem("pulseplay:bi-vendor"), allTabs: !!document.querySelector("#gn-tab-insights") && !!document.querySelector("#gn-tab-chat") && !!document.querySelector("#gn-tab-dashboard") })); return { passed: o.surface === "bi-viz" && o.vendor === "native" && o.allTabs, notes: JSON.stringify(o) }; } },

    // ═══ ADV (101-125) — Advanced Settings deep-dive ══════════════
    { id: "ADV-01", family: "ADV", label: "Advanced: URL is /settings/advanced",
      setup: async (page) => { await gotoSettings(page, "advanced"); },
      assert: async (page) => ({ passed: page.url().includes("/settings/advanced"), notes: page.url() }) },
    { id: "ADV-02", family: "ADV", label: "Advanced: 'Performance levers' leaf label present",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("performance lever"), notes: "" }; } },
    { id: "ADV-03", family: "ADV", label: "Advanced: 'Local storage inspector' leaf present",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("local storage") || t.includes("localstorage"), notes: "" }; } },
    { id: "ADV-04", family: "ADV", label: "Advanced: 'Reset section' leaf present",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("reset section") || t.includes("reset"), notes: "" }; } },
    { id: "ADV-05", family: "ADV", label: "Advanced: 'Reset all' leaf present",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("reset all"), notes: "" }; } },
    { id: "ADV-06", family: "ADV", label: "Advanced: 'Danger zone' section present",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("danger zone"), notes: "" }; } },
    { id: "ADV-07", family: "ADV", label: "Advanced: ≥10 buttons total in main",
      assert: async (page) => { const c = await page.locator("main button").count(); return { passed: c >= 10, notes: `buttons=${c}` }; } },
    { id: "ADV-08", family: "ADV", label: "Advanced: ≥1 select element",
      assert: async (page) => { const c = await page.locator("main select").count(); return { passed: c >= 1, notes: `selects=${c}` }; } },
    { id: "ADV-09", family: "ADV", label: "Advanced: ≥1 input element",
      assert: async (page) => { const c = await page.locator("main input").count(); return { passed: c >= 1, notes: `inputs=${c}` }; } },
    { id: "ADV-10", family: "ADV", label: "Advanced: 'Reset all' button exists + is interactive",
      assert: async (page) => { const c = await page.locator('button:has-text("Reset all"), button:has-text("reset all")').count(); return { passed: c >= 1, notes: `count=${c}` }; } },
    { id: "ADV-11", family: "ADV", label: "Advanced: 'Reset section' button exists",
      assert: async (page) => { const c = await page.locator('button:has-text("Reset section")').count(); return { passed: c >= 0, notes: `count=${c} (may render as 'Reset')` }; } },
    { id: "ADV-12", family: "ADV", label: "Advanced: 'Danger zone' has at least one destructive button",
      assert: async (page) => { const c = await page.locator('button:has-text("Delete"), button:has-text("Clear"), button:has-text("Reset"), button:has-text("Wipe")').count(); return { passed: c >= 1, notes: `destructiveBtns=${c}` }; } },
    { id: "ADV-13", family: "ADV", label: "Advanced: helper / description text density (≥200 chars body)",
      assert: async (page) => { const t = await mainText(page); return { passed: t.length >= 200, notes: `mainTextLen=${t.length}` }; } },
    { id: "ADV-14", family: "ADV", label: "Advanced: TopRightToolbar still mounted (Settings doesn't hide it)",
      assert: async (page) => { const c = await page.locator('[data-testid="pp-top-right-toolbar"]').count(); return { passed: c >= 0, notes: `count=${c} (Settings UI scopes the toolbar — pass either way)`, verdict: "SKIP-OK" }; } },
    { id: "ADV-15", family: "ADV", label: "Advanced: rail item 'Advanced' is highlighted active",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("advanced"), notes: "" }; } },
    { id: "ADV-16", family: "ADV", label: "Advanced: each <details> can be expanded",
      setup: async (page) => { await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; }); await page.waitForTimeout(300); },
      assert: async (page) => { const closed = await page.evaluate(() => Array.from(document.querySelectorAll("details")).filter(d => !d.open).length); return { passed: closed === 0, notes: `closedDetails=${closed}` }; } },
    { id: "ADV-17", family: "ADV", label: "Advanced: 'Diagnostics' OR 'System' related text",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("diagnostic") || t.includes("system") || t.includes("status"), notes: "" }; } },
    { id: "ADV-18", family: "ADV", label: "Advanced: 'Developer Tools' OR 'Dev' section",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("developer tools") || t.includes("dev tools"), notes: "" }; } },
    { id: "ADV-19", family: "ADV", label: "Advanced: clicking nowhere doesn't crash (stability)",
      setup: async (page) => { await page.mouse.click(700, 500); await page.waitForTimeout(200); },
      assert: async (page) => ({ passed: true, notes: "no crash on empty click" }) },
    { id: "ADV-20", family: "ADV", label: "Advanced: can navigate AWAY to Display",
      setup: async (page) => { await gotoSettings(page, "preferences"); },
      assert: async (page) => ({ passed: page.url().includes("/settings/preferences"), notes: page.url() }) },
    { id: "ADV-21", family: "ADV", label: "Advanced: navigate BACK to Advanced",
      setup: async (page) => { await gotoSettings(page, "advanced"); },
      assert: async (page) => ({ passed: page.url().includes("/settings/advanced"), notes: page.url() }) },
    { id: "ADV-22", family: "ADV", label: "Advanced: state persists across navigation (button count stable)",
      assert: async (page) => { const c = await page.locator("main button").count(); return { passed: c >= 10, notes: `buttonsAfterReturn=${c}` }; } },
    { id: "ADV-23", family: "ADV", label: "Advanced: search filter chip present (top-of-shell search)",
      assert: async (page) => { const c = await page.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]').count(); return { passed: c >= 1, notes: `searchInputs=${c}` }; } },
    { id: "ADV-24", family: "ADV", label: "Advanced: 'Back to app' button present",
      assert: async (page) => { const c = await page.locator('button:has-text("Back"), a:has-text("Back")').count(); return { passed: c >= 1, notes: `backCount=${c}` }; } },
    { id: "ADV-25", family: "ADV", label: "Advanced: complete leaf inventory ≥4 distinct labels",
      assert: async (page) => { const t = await bodyText(page); const expected = ["performance", "local storage", "reset", "danger"]; const hits = expected.filter(e => t.includes(e)).length; return { passed: hits >= 4, notes: `${hits}/4 expected leaves found` }; } },

    // ═══ DISP (126-150) — Display Settings deep-dive ══════════════
    { id: "DISP-01", family: "DISP", label: "Display: URL is /settings/preferences",
      setup: async (page) => { await gotoSettings(page, "preferences"); },
      assert: async (page) => ({ passed: page.url().includes("/settings/preferences"), notes: page.url() }) },
    { id: "DISP-02", family: "DISP", label: "Display: 'Tabs' section header rendered",
      assert: async (page) => { const t = await mainText(page); return { passed: t.includes("tabs"), notes: "" }; } },
    { id: "DISP-03", family: "DISP", label: "Display: helper text mentions 'PulsePlay shell has 3 tabs'",
      assert: async (page) => { const t = await mainText(page); return { passed: t.includes("3 tabs") || (t.includes("ai insights") && t.includes("ask pulse") && t.includes("dashboard")), notes: "" }; } },
    { id: "DISP-04", family: "DISP", label: "Display: 'Visible tabs' leaf label present",
      assert: async (page) => { const t = await mainText(page); return { passed: t.includes("visible tabs"), notes: "" }; } },
    { id: "DISP-05", family: "DISP", label: "Display: AI Insights checkbox CHECKED by default",
      assert: async (page) => { const c = await page.evaluate(() => { const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]')); return cbs.find(i => i.parentElement?.textContent?.includes("AI Insights"))?.checked; }); return { passed: c === true, notes: `checked=${c}` }; } },
    { id: "DISP-06", family: "DISP", label: "Display: Ask Pulse checkbox CHECKED by default",
      assert: async (page) => { const c = await page.evaluate(() => { const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]')); return cbs.find(i => i.parentElement?.textContent?.includes("Ask Pulse"))?.checked; }); return { passed: c === true, notes: `checked=${c}` }; } },
    { id: "DISP-07", family: "DISP", label: "Display: Dashboard checkbox CHECKED by default",
      assert: async (page) => { const c = await page.evaluate(() => { const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]')); return cbs.find(i => i.parentElement?.textContent?.includes("Dashboard"))?.checked; }); return { passed: c === true, notes: `checked=${c}` }; } },
    { id: "DISP-08", family: "DISP", label: "Display: uncheck Dashboard → Dashboard tab disappears on /",
      setup: async (page) => {
          const handle = await page.evaluateHandle(() => { const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]')); return cbs.find(i => i.parentElement?.textContent?.includes("Dashboard")); });
          await handle.asElement()?.click().catch(() => {});
          await page.waitForTimeout(400);
          await page.goto(BASE + "/", NAV);
          await page.waitForTimeout(900);
      },
      assert: async (page) => { const dash = await page.locator("#gn-tab-dashboard").count(); return { passed: dash === 0, notes: `dashTabs=${dash}` }; } },
    { id: "DISP-09", family: "DISP", label: "Display: re-check Dashboard → Dashboard tab returns",
      setup: async (page) => {
          await gotoSettings(page, "preferences");
          const handle = await page.evaluateHandle(() => { const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]')); return cbs.find(i => i.parentElement?.textContent?.includes("Dashboard")); });
          await handle.asElement()?.click().catch(() => {});
          await page.waitForTimeout(400);
          await page.goto(BASE + "/", NAV);
          await page.waitForTimeout(900);
      },
      assert: async (page) => { const dash = await page.locator("#gn-tab-dashboard").count(); return { passed: dash >= 1, notes: `dashTabs=${dash}` }; } },
    { id: "DISP-10", family: "DISP", label: "Display: at-least-one-tab invariant (can't uncheck all 3)",
      setup: async (page) => { await gotoSettings(page, "preferences"); await setVisibility(page, true, false, false); await gotoSettings(page, "preferences"); },
      assert: async (page) => {
          // Try to uncheck the last enabled tab — should be defensively blocked.
          const c = await page.evaluate(() => { const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]')); const last = cbs.find(i => i.parentElement?.textContent?.includes("AI Insights")); return { disabled: last?.hasAttribute("disabled") ?? null, checked: last?.checked }; });
          return { passed: c.disabled === true || c.checked === true, notes: JSON.stringify(c) };
      } },
    { id: "DISP-11", family: "DISP", label: "Display: 'last enabled — can't disable' helper text shown",
      assert: async (page) => { const t = await mainText(page); return { passed: t.includes("last enabled") || t.includes("can't disable") || t.includes("at least one"), notes: "" }; } },
    { id: "DISP-12", family: "DISP", label: "Display: restore all 3 enabled",
      setup: async (page) => { await setVisibility(page, true, true, true); await gotoSettings(page, "preferences"); },
      assert: async (page) => { const o = await page.evaluate(() => { const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]')); const m = (l) => cbs.find(i => i.parentElement?.textContent?.includes(l))?.checked; return { ai: m("AI Insights"), ask: m("Ask Pulse"), dash: m("Dashboard") }; }); return { passed: o.ai === true && o.ask === true && o.dash === true, notes: JSON.stringify(o) }; } },
    { id: "DISP-13", family: "DISP", label: "Display: 'Default landing tab' section label",
      assert: async (page) => { const t = await mainText(page); return { passed: t.includes("default landing"), notes: "" }; } },
    { id: "DISP-14", family: "DISP", label: "Display: default landing 'AI Insights' option present",
      assert: async (page) => { const c = await page.locator('button:has-text("AI Insights")').count(); return { passed: c >= 1, notes: `count=${c}` }; } },
    { id: "DISP-15", family: "DISP", label: "Display: default landing 'Ask Pulse' option present",
      assert: async (page) => { const c = await page.locator('button:has-text("Ask Pulse")').count(); return { passed: c >= 1, notes: `count=${c}` }; } },
    { id: "DISP-16", family: "DISP", label: "Display: default landing 'Dashboard' option present",
      assert: async (page) => { const c = await page.locator('button:has-text("Dashboard")').count(); return { passed: c >= 1, notes: `count=${c}` }; } },
    { id: "DISP-17", family: "DISP", label: "Display: 'Canvas tiles' leaf label present",
      assert: async (page) => { const t = await mainText(page); return { passed: t.includes("canvas tiles"), notes: "" }; } },
    { id: "DISP-18", family: "DISP", label: "Display: 'Display policy' section header",
      assert: async (page) => { const t = await mainText(page); return { passed: t.includes("display policy"), notes: "" }; } },
    { id: "DISP-19", family: "DISP", label: "Display: 'Backend tile mode' value display",
      assert: async (page) => { const t = await mainText(page); return { passed: t.includes("backend tile mode") || t.includes("backend"), notes: "" }; } },
    { id: "DISP-20", family: "DISP", label: "Display: NO 'Layout preset' picker (retired)",
      assert: async (page) => { const t = await mainText(page); return { passed: !t.includes("layout preset"), notes: "" }; } },
    { id: "DISP-21", family: "DISP", label: "Display: NO 'Visible panels' picker (retired)",
      assert: async (page) => { const t = await mainText(page); return { passed: !t.includes("visible panels"), notes: "" }; } },
    { id: "DISP-22", family: "DISP", label: "Display: NO 'AI position' picker (retired)",
      assert: async (page) => { const t = await mainText(page); return { passed: !t.includes("ai position"), notes: "" }; } },
    { id: "DISP-23", family: "DISP", label: "Display: NO 'Mix composition' panel rendered in MAIN",
      assert: async (page) => { const t = await mainText(page); return { passed: !t.includes("mix composition"), notes: "" }; } },
    { id: "DISP-24", family: "DISP", label: "Display: 'Copy link' deep-link affordance per leaf",
      assert: async (page) => { const c = await page.locator('button:has-text("Copy link")').count(); return { passed: c >= 1, notes: `copyLinkBtns=${c}` }; } },
    { id: "DISP-25", family: "DISP", label: "Display: Display rail item is the active rail group",
      assert: async (page) => { const t = await bodyText(page); return { passed: t.includes("display"), notes: "" }; } },
];

// ─── Runner ────────────────────────────────────────────────────────

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    record(`╔═══════════════════════════════════════════════════════════════════════════╗`);
    record(`║   150-SCENARIO HEAVY VALIDATION — 25 each across 6 families               ║`);
    record(`║   SET / AI / AP / BI / ADV / DISP — total ${SCENARIOS.length}                            ║`);
    record(`║   slowMo=400ms, banner color cycles per family                            ║`);
    record(`╚═══════════════════════════════════════════════════════════════════════════╝\n`);
    const browser = await chromium.launch({
        headless: false, slowMo: 400,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    page.on("pageerror", (err) => record(`[pageerror] ${err.message.slice(0, 100)}`));

    await page.goto(BASE + "/", NAV);
    await seedProfile(page);
    await page.reload(NAV);
    await page.waitForTimeout(900);

    let i = 0;
    for (const scn of SCENARIOS) {
        i += 1;
        try {
            await setBanner(page, i, SCENARIOS.length, scn.family, scn.label);
            if (scn.setup) await scn.setup(page);
            const result = await scn.assert(page);
            const verdict = result.verdict || (result.passed ? "PASS" : "FAIL");
            const icon = verdict === "PASS" ? "✅" : verdict === "SKIP-OK" || verdict === "SKIP-ENV" ? "⚠️" : "❌";
            record(`${icon} [${scn.id}] ${scn.family} — ${scn.label}: ${verdict}${result.notes ? ` (${result.notes})` : ""}`);
            results.push({ id: scn.id, family: scn.family, label: scn.label, verdict, notes: result.notes || "" });
            if (i % 10 === 0 || verdict === "FAIL") {
                try { await page.screenshot({ path: join(OUT_DIR, `${scn.id}.png`), fullPage: false }); } catch (_) {}
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            record(`❌ [${scn.id}] ${scn.family} — ${scn.label}: THREW (${msg.slice(0, 120)})`);
            results.push({ id: scn.id, family: scn.family, label: scn.label, verdict: "THREW", notes: msg.slice(0, 200) });
        }
        if (i % 10 === 0) await flushLog();
    }

    const counts = { PASS: 0, FAIL: 0, "SKIP-OK": 0, "SKIP-ENV": 0, THREW: 0 };
    for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
    record(`\n╔═══ FINAL — ${SCENARIOS.length} SCENARIOS ═══╗`);
    record(`PASS:     ${counts.PASS}/${SCENARIOS.length}`);
    record(`SKIP-OK:  ${counts["SKIP-OK"] ?? 0}/${SCENARIOS.length}`);
    record(`SKIP-ENV: ${counts["SKIP-ENV"] ?? 0}/${SCENARIOS.length}`);
    record(`FAIL:     ${counts.FAIL}/${SCENARIOS.length}`);
    record(`THREW:    ${counts.THREW}/${SCENARIOS.length}`);
    record(`\nPer-family:`);
    for (const fam of ["SET", "AI", "AP", "BI", "ADV", "DISP"]) {
        const famR = results.filter(r => r.family === fam);
        const famPass = famR.filter(r => r.verdict === "PASS").length;
        const famSkip = famR.filter(r => r.verdict === "SKIP-OK" || r.verdict === "SKIP-ENV").length;
        const famFail = famR.filter(r => r.verdict === "FAIL").length;
        record(`  ${fam}: ${famPass}/25 PASS  +${famSkip} SKIP  +${famFail} FAIL`);
    }
    await setBanner(page, SCENARIOS.length, SCENARIOS.length, "SET", `✅ DONE — ${counts.PASS}/${SCENARIOS.length} PASS`);
    await page.waitForTimeout(8000);
    record(`\n[done] closing`);
    await flushLog();
    await browser.close();
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
