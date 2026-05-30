#!/usr/bin/env node
// playground/scripts/verify-e2e-intense.mjs
//
// END-TO-END INTENSE smoke for the 2026-05-25 per-tab-visibility ship
// (commits dfb579d → b57b096). Probes:
//   A. Boot + cold-load health
//   B. Settings → AI:        every leaf renders + interactive controls reachable
//   C. Settings → BI:        every leaf renders
//   D. Settings → Advanced:  every leaf renders
//   E. Settings → Display:   per-tab checkboxes + default landing + display policy
//   F. Settings navigation:  rail click → URL update → group renders
//   G. Live tab-visibility toggle: toggle in Settings → strip updates on /
//   H. Each tab smoke:       AI Insights / Ask Pulse / Dashboard each render content
//   I. Single-tab collapse: each of the 3 tabs as solo main-page
//   J. Adversarial: empty submit / XSS / very-long / rapid-double-click
//   K. Toolbar enumeration on each tab (uniformity check)
//   L. Mobile viewport 768×900
//   M. Final console + network error sweep
//
// Per-probe try/catch + progressive log flush so partial runs preserve
// evidence. Headed Chromium @ slowMo=250ms.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".e2e-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";

const log = [];
const errors = { console: [], page: [], net: [] };
const apiCalls = [];
const record = (line) => { log.push(line); console.log(line); };

const NAV = { waitUntil: "domcontentloaded", timeout: 20_000 };

async function flushLog() {
    try { await writeFile(join(OUT_DIR, "e2e.log"), log.join("\n"), "utf-8"); } catch (_) {}
    try { await writeFile(join(OUT_DIR, "api-calls.json"), JSON.stringify(apiCalls, null, 2), "utf-8"); } catch (_) {}
    try { await writeFile(join(OUT_DIR, "errors.json"), JSON.stringify(errors, null, 2), "utf-8"); } catch (_) {}
}

async function safe(name, fn) {
    try { await fn(); }
    catch (err) {
        const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        record(`[${name}] ⚠️ probe threw — ${msg.split("\n")[0]}`);
    }
    await flushLog();
}

function stripQuery(u) { return u.split("?")[0]; }

async function seedProfile(page) {
    await page.evaluate((profile) => {
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        const k = "pulseplay:visual-settings:genieSettings";
        const existing = JSON.parse(window.localStorage.getItem(k) || "{}");
        existing.assistantProfile = profile;
        window.localStorage.setItem(k, JSON.stringify(existing));
        // Reset tab visibility to all-enabled for the baseline probes.
        window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({ aiInsights: true, askPulse: true, dashboard: true }));
        // Clear uiMode override — let the new "pulse" default take effect.
        window.localStorage.removeItem("pulseplay:ui-mode");
    }, PROFILE);
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    record(`[boot] launching HEADED Chromium @ slowMo=250ms — watch your screen`);
    const browser = await chromium.launch({
        headless: false,
        slowMo: 250,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();

    // Session-long sinks.
    page.on("console", (msg) => {
        if (msg.type() === "error") {
            const line = `[console.error] ${msg.text()}`;
            errors.console.push(line);
            record(line);
        }
    });
    page.on("pageerror", (err) => {
        const line = `[pageerror] ${err.message}`;
        errors.page.push(line);
        record(line);
    });
    page.on("requestfinished", async (req) => {
        const url = req.url();
        if (!url.includes("/api/")) return;
        const resp = await req.response();
        const status = resp ? resp.status() : "?";
        apiCalls.push({ method: req.method(), url, status });
        if (typeof status === "number" && status >= 400) {
            errors.net.push(`[net ${status}] ${req.method()} ${url}`);
        }
    });
    page.on("requestfailed", (req) => {
        errors.net.push(`[net FAIL] ${req.method()} ${req.url()} — ${req.failure()?.errorText || "?"}`);
    });

    await safe("A", () => probeABoot(page));
    await safe("B", () => probeBSettingsAi(page));
    await safe("C", () => probeCSettingsBi(page));
    await safe("D", () => probeDSettingsAdvanced(page));
    await safe("E", () => probeESettingsDisplay(page));
    await safe("F", () => probeFSettingsNavigation(page));
    await safe("G", () => probeGLiveTabToggle(page));
    await safe("H", () => probeHEachTabRenders(page));
    await safe("I", () => probeISingleTabCollapse(page));
    await safe("J", () => probeJAdversarialInputs(page));
    await safe("K", () => probeKToolbarUniformity(page));
    await safe("L", () => probeLMobileViewport(page));

    // Final sweep.
    record(`\n══════ FINAL SWEEP ══════`);
    record(`[summary] console.errors: ${errors.console.length}`);
    record(`[summary] pageerrors:     ${errors.page.length}`);
    record(`[summary] network 4xx/5xx/failed: ${errors.net.length}`);
    record(`[summary] total /api/* calls: ${apiCalls.length}`);
    const distinctApi = [...new Set(apiCalls.map(c => `${c.method} ${stripQuery(c.url)}`))];
    record(`[summary] distinct /api/* endpoints touched: ${distinctApi.length}`);
    for (const ep of distinctApi) record(`  • ${ep}`);
    if (errors.net.length > 0) {
        record(`\n[summary] network failures detail:`);
        for (const e of errors.net) record(`  ${e}`);
    }

    record(`\n[done] watch your screen — closing in 4 seconds`);
    await page.waitForTimeout(4000);
    await flushLog();
    await browser.close();
}

// ─── Probe A: Boot ─────────────────────────────────────────────────
async function probeABoot(page) {
    record(`\n[A] Boot — ${BASE}/`);
    await page.goto(BASE + "/", NAV);
    await seedProfile(page);
    await page.reload(NAV);
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(OUT_DIR, "A-boot.png"), fullPage: false });
    const title = await page.title();
    const tabsPresent = await page.evaluate(() => ({
        insights: !!document.querySelector("#gn-tab-insights"),
        chat:     !!document.querySelector("#gn-tab-chat"),
        dashboard:!!document.querySelector("#gn-tab-dashboard"),
        strip:    !!document.querySelector(".gn-surface-switcher"),
    }));
    record(`[A] title="${title}"  strip=${tabsPresent.strip}  AI=${tabsPresent.insights}  Ask=${tabsPresent.chat}  Dash=${tabsPresent.dashboard}`);
    record(`[A] expect all 3 tabs visible + strip mounted (default tabVisibility)`);
}

// ─── Probe B: Settings → AI leaves ─────────────────────────────────
async function probeBSettingsAi(page) {
    record(`\n[B] Settings → AI — every leaf renders`);
    await page.goto(BASE + "/settings/ai", NAV);
    await page.waitForTimeout(700);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await page.waitForTimeout(300);

    // Count visible leaves (rendered as <Leaf> with .pp-settings-leaf class or similar).
    const leafTitles = await page.evaluate(() => {
        // Leaf component renders text content; harvest visible h3/h4/strong labels in the main pane.
        const main = document.querySelector('main') || document.body;
        const candidates = Array.from(main.querySelectorAll('h2, h3, h4, strong, label'));
        return candidates
            .map(el => (el.textContent || "").trim())
            .filter(t => t && t.length < 60);
    });
    record(`[B] visible label-like text count in main pane: ${leafTitles.length}`);
    // Count interactive controls (inputs, buttons, selects).
    const controlCounts = await page.evaluate(() => ({
        buttons: document.querySelectorAll("main button, [role=group] button").length,
        selects: document.querySelectorAll("select").length,
        inputs:  document.querySelectorAll('main input').length,
    }));
    record(`[B] controls: buttons=${controlCounts.buttons}  selects=${controlCounts.selects}  inputs=${controlCounts.inputs}`);
    await page.screenshot({ path: join(OUT_DIR, "B-settings-ai.png"), fullPage: true });
}

// ─── Probe C: Settings → BI leaves ─────────────────────────────────
async function probeCSettingsBi(page) {
    record(`\n[C] Settings → BI — every leaf renders`);
    await page.goto(BASE + "/settings/bi", NAV);
    await page.waitForTimeout(700);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await page.waitForTimeout(300);
    const controlCounts = await page.evaluate(() => ({
        buttons: document.querySelectorAll("main button, [role=group] button").length,
        selects: document.querySelectorAll("select").length,
        inputs:  document.querySelectorAll('main input').length,
    }));
    record(`[C] controls: buttons=${controlCounts.buttons}  selects=${controlCounts.selects}  inputs=${controlCounts.inputs}`);
    await page.screenshot({ path: join(OUT_DIR, "C-settings-bi.png"), fullPage: true });
}

// ─── Probe D: Settings → Advanced leaves ───────────────────────────
async function probeDSettingsAdvanced(page) {
    record(`\n[D] Settings → Advanced — every leaf renders`);
    await page.goto(BASE + "/settings/advanced", NAV);
    await page.waitForTimeout(700);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await page.waitForTimeout(300);
    const controlCounts = await page.evaluate(() => ({
        buttons: document.querySelectorAll("main button, [role=group] button").length,
        selects: document.querySelectorAll("select").length,
        inputs:  document.querySelectorAll('main input').length,
    }));
    record(`[D] controls: buttons=${controlCounts.buttons}  selects=${controlCounts.selects}  inputs=${controlCounts.inputs}`);
    await page.screenshot({ path: join(OUT_DIR, "D-settings-advanced.png"), fullPage: true });
}

// ─── Probe E: Settings → Display (per-tab visibility) ──────────────
async function probeESettingsDisplay(page) {
    record(`\n[E] Settings → Display — per-tab visibility checkboxes`);
    await page.goto(BASE + "/settings/preferences", NAV);
    await page.waitForTimeout(700);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await page.waitForTimeout(300);
    const observed = await page.evaluate(() => {
        const cb = (label) => {
            const inputs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
            const found = inputs.find(i => i.parentElement?.textContent?.includes(label));
            return found ? { checked: found.checked, disabled: found.disabled } : null;
        };
        return {
            cbAiInsights: cb("AI Insights"),
            cbAskPulse:   cb("Ask Pulse"),
            cbDashboard:  cb("Dashboard"),
            // Legacy controls should be GONE.
            hasVisiblePanelsPicker: Array.from(document.querySelectorAll("button"))
                .some(b => /^AI only$|^BI only$|^Unified$|^Split$/.test((b.textContent || "").trim())),
            hasAiPositionPicker: Array.from(document.querySelectorAll("button"))
                .some(b => /^Left$|^Right$|^Top$|^Bottom$/.test((b.textContent || "").trim())),
            hasMixCompositionPanel: document.body.textContent?.includes("Mix composition") || false,
            // Default landing should show 3 options.
            landingOpts: Array.from(document.querySelectorAll("button"))
                .filter(b => /^AI Insights$|^Ask Pulse$|^Dashboard$/.test((b.textContent || "").trim())).length,
        };
    });
    record(`[E] AI Insights cb: ${JSON.stringify(observed.cbAiInsights)}`);
    record(`[E] Ask Pulse  cb: ${JSON.stringify(observed.cbAskPulse)}`);
    record(`[E] Dashboard  cb: ${JSON.stringify(observed.cbDashboard)}`);
    record(`[E] LEGACY hasVisiblePanelsPicker: ${observed.hasVisiblePanelsPicker} (expect false)`);
    record(`[E] LEGACY hasAiPositionPicker:    ${observed.hasAiPositionPicker}    (expect false)`);
    record(`[E] LEGACY hasMixCompositionPanel: ${observed.hasMixCompositionPanel} (expect false)`);
    record(`[E] Default landing option count:  ${observed.landingOpts} (expect 3 when all tabs enabled)`);
    await page.screenshot({ path: join(OUT_DIR, "E-settings-display.png"), fullPage: true });
}

// ─── Probe F: Settings navigation ──────────────────────────────────
async function probeFSettingsNavigation(page) {
    record(`\n[F] Settings rail navigation — click each group and confirm URL + render`);
    const groups = [
        { id: "ai",          label: "AI Setup" },
        { id: "bi",          label: "BI Setup" },
        { id: "advanced",    label: "Advanced" },
        { id: "preferences", label: "Display" },
    ];
    await page.goto(BASE + "/settings/ai", NAV);
    await page.waitForTimeout(500);
    for (const g of groups) {
        // Click rail link by visible text.
        const link = page.locator(`a:has-text("${g.label}"), button:has-text("${g.label}")`).first();
        const count = await link.count();
        if (count === 0) {
            record(`[F] ⚠️ rail link "${g.label}" not found`);
            continue;
        }
        await link.click().catch(() => {});
        await page.waitForTimeout(500);
        const url = page.url();
        const urlMatch = url.includes(`/settings/${g.id}`);
        record(`[F] click "${g.label}" → url=${url.replace(BASE, "")}  match=${urlMatch ? "✅" : "❌"}`);
    }
}

// ─── Probe G: Live tab-visibility toggle ───────────────────────────
async function probeGLiveTabToggle(page) {
    record(`\n[G] Live toggle — uncheck Dashboard in Settings, verify strip updates on /`);
    await page.goto(BASE + "/settings/preferences", NAV);
    await page.waitForTimeout(700);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await page.waitForTimeout(300);
    // Find Dashboard checkbox and uncheck.
    const beforeStrip = await page.evaluate(() => ({
        dash: !!document.querySelector("#gn-tab-dashboard"),
    }));
    const dashCb = await page.evaluateHandle(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
        return inputs.find(i => i.parentElement?.textContent?.includes("Dashboard"));
    });
    const dashEl = dashCb.asElement();
    if (!dashEl) {
        record(`[G] FAIL: Dashboard checkbox not found in Settings`);
        return;
    }
    await dashEl.click();
    await page.waitForTimeout(400);
    // Go back to / and verify Dashboard tab is gone.
    await page.goto(BASE + "/", NAV);
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => ({
        strip: !!document.querySelector(".gn-surface-switcher"),
        insights: !!document.querySelector("#gn-tab-insights"),
        chat:     !!document.querySelector("#gn-tab-chat"),
        dashboard:!!document.querySelector("#gn-tab-dashboard"),
    }));
    record(`[G] after uncheck Dashboard on /: strip=${after.strip}  AI=${after.insights}  Ask=${after.chat}  Dash=${after.dashboard}`);
    record(`[G] expect: strip=true, AI=true, Ask=true, Dash=false → ${after.strip && after.insights && after.chat && !after.dashboard ? "✅ PASS" : "❌ FAIL"}`);
    await page.screenshot({ path: join(OUT_DIR, "G-after-uncheck-dash.png"), fullPage: false });
    // Restore.
    await page.evaluate(() => {
        window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({ aiInsights: true, askPulse: true, dashboard: true }));
        window.dispatchEvent(new CustomEvent("pulseplay:display-change", { detail: { key: "pulseplay:tab-visibility", value: JSON.stringify({ aiInsights: true, askPulse: true, dashboard: true }) } }));
    });
    await page.reload(NAV);
    await page.waitForTimeout(700);
}

// ─── Probe H: Each tab renders content ─────────────────────────────
async function probeHEachTabRenders(page) {
    record(`\n[H] Each tab renders — click AI Insights / Ask Pulse / Dashboard`);
    await page.goto(BASE + "/", NAV);
    await page.waitForTimeout(800);
    // AI Insights (active by default).
    const insightsContent = await page.evaluate(() => {
        const t = (document.body.textContent || "").toLowerCase();
        return {
            hasInsightsLabel: t.includes("ai insights"),
            hasCTA: t.includes("connect ai assistant") || t.includes("browse knowledge"),
        };
    });
    record(`[H] AI Insights body: insights-label=${insightsContent.hasInsightsLabel} cta=${insightsContent.hasCTA}`);
    await page.screenshot({ path: join(OUT_DIR, "H-tab-ai-insights.png"), fullPage: false });

    // Ask Pulse — click and check composer.
    await page.locator("#gn-tab-chat").click().catch(() => {});
    await page.waitForTimeout(700);
    const askContent = await page.evaluate(() => {
        return {
            hasTextarea: document.querySelectorAll("textarea").length > 0,
            hasAskBtn:   document.querySelectorAll(".pp-ai-sidebar__ask, button.gn-ask-btn, button:has-text('Ask')").length > 0,
        };
    });
    record(`[H] Ask Pulse body: textareas=${askContent.hasTextarea} ask-affordance=${askContent.hasAskBtn}`);
    await page.screenshot({ path: join(OUT_DIR, "H-tab-ask-pulse.png"), fullPage: false });

    // Dashboard — click and check BI canvas.
    await page.locator("#gn-tab-dashboard").click().catch(() => {});
    await page.waitForTimeout(700);
    const dashContent = await page.evaluate(() => {
        const t = (document.body.textContent || "").toLowerCase();
        return {
            hasDashboardLabel: t.includes("dashboard"),
            hasIframe: document.querySelectorAll("iframe").length > 0,
            hasEmptyState: t.includes("native result canvas") || t.includes("connect bi") || t.includes("ask pulse a question"),
        };
    });
    record(`[H] Dashboard body: dashboard-label=${dashContent.hasDashboardLabel} iframes=${dashContent.hasIframe} empty-state=${dashContent.hasEmptyState}`);
    await page.screenshot({ path: join(OUT_DIR, "H-tab-dashboard.png"), fullPage: false });
}

// ─── Probe I: Single-tab collapse (3 cases) ────────────────────────
async function probeISingleTabCollapse(page) {
    record(`\n[I] Single-tab collapse — each tab as solo main page`);
    const solos = [
        { id: "ai-only",  label: "AI Insights only",  v: { aiInsights: true,  askPulse: false, dashboard: false } },
        { id: "ask-only", label: "Ask Pulse only",    v: { aiInsights: false, askPulse: true,  dashboard: false } },
        { id: "dash-only",label: "Dashboard only",    v: { aiInsights: false, askPulse: false, dashboard: true  } },
    ];
    for (const s of solos) {
        await page.evaluate((v) => {
            window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify(v));
        }, s.v);
        await page.goto(BASE + "/", NAV);
        await page.waitForTimeout(900);
        const obs = await page.evaluate(() => ({
            strip: !!document.querySelector(".gn-surface-switcher"),
            insights: !!document.querySelector("#gn-tab-insights"),
            chat:     !!document.querySelector("#gn-tab-chat"),
            dashboard:!!document.querySelector("#gn-tab-dashboard"),
        }));
        const stripHidden = obs.strip === false;
        record(`[I-${s.id}] strip=${obs.strip} (expect false) → ${stripHidden ? "✅ PASS" : "❌ FAIL"}`);
        await page.screenshot({ path: join(OUT_DIR, `I-${s.id}.png`), fullPage: false });
    }
    // Restore all-enabled.
    await page.evaluate(() => {
        window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({ aiInsights: true, askPulse: true, dashboard: true }));
    });
}

// ─── Probe J: Adversarial composer inputs ──────────────────────────
async function probeJAdversarialInputs(page) {
    record(`\n[J] Adversarial inputs on Ask Pulse composer`);
    await page.goto(BASE + "/", NAV);
    await page.waitForTimeout(800);
    // Switch to Ask Pulse tab.
    await page.locator("#gn-tab-chat").click().catch(() => {});
    await page.waitForTimeout(700);
    const composer = page.locator("textarea").first();
    if ((await composer.count()) === 0) {
        record(`[J] FAIL: composer not found on Ask Pulse tab`);
        return;
    }

    // J1: empty
    await composer.fill("");
    record(`[J1] empty fill OK`);
    // J2: whitespace
    await composer.fill("    \t  \n  ");
    record(`[J2] whitespace fill OK`);
    // J3: XSS during fill (must NOT execute alert)
    const alertFiredBefore = await page.evaluate(() => {
        window.__probeAlertCalled = false;
        const orig = window.alert;
        window.alert = () => { window.__probeAlertCalled = true; };
        setTimeout(() => { window.alert = orig; }, 15_000);
        return window.__probeAlertCalled;
    });
    await composer.fill(`<img src=x onerror=alert("XSS")><script>alert("XSS")</script>`);
    await page.waitForTimeout(300);
    const alertFired = await page.evaluate(() => window.__probeAlertCalled);
    record(`[J3] XSS-during-fill alert=${alertFired} (expect false; before=${alertFiredBefore})`);
    // J4: very long
    await composer.fill("a".repeat(5000));
    const filledLen = await composer.inputValue().then(v => v.length);
    record(`[J4] very-long fill accepted ${filledLen} chars (expect 5000 unless capped)`);
    // J5: reset
    await composer.fill("");
}

// ─── Probe K: Toolbar enumeration per tab (uniformity check) ───────
async function probeKToolbarUniformity(page) {
    record(`\n[K] Toolbar enumeration on each tab — check cross-cutting affordances are uniform`);
    const tabIds = [
        { tab: "insights",  click: "#gn-tab-insights",  label: "AI Insights" },
        { tab: "chat",      click: "#gn-tab-chat",      label: "Ask Pulse" },
        { tab: "dashboard", click: "#gn-tab-dashboard", label: "Dashboard (delegates to BI pane)" },
    ];
    const perTab = {};
    for (const t of tabIds) {
        // Restore all-enabled in case earlier probes left state changed.
        await page.evaluate(() => {
            window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({ aiInsights: true, askPulse: true, dashboard: true }));
        });
        await page.goto(BASE + "/", NAV);
        await page.waitForTimeout(800);
        await page.locator(t.click).click().catch(() => {});
        await page.waitForTimeout(600);
        const btns = await page.evaluate(() => {
            return Array.from(document.querySelectorAll("button"))
                .filter(b => {
                    const r = b.getBoundingClientRect();
                    return r.top < 220 && r.width > 0 && r.height > 0;
                })
                .map(b => b.getAttribute("aria-label") || b.getAttribute("title") || (b.textContent || "").trim().slice(0, 40))
                .filter(Boolean);
        });
        perTab[t.label] = btns;
        record(`[K] ${t.label} header buttons (${btns.length}):`);
        for (const b of btns) record(`     • ${b}`);
    }
    // Uniformity check: which cross-cutting affordances appear on all 3?
    const expectAll = ["Maximize", "Minimize", "Pop out", "Open ", "separate page"];
    record(`\n[K] Uniformity: cross-cutting verbs ("Maximize", "Minimize", "Pop out") that appear on all 3 tabs:`);
    for (const verb of ["Maximize", "Minimize", "Pop out"]) {
        const hits = Object.entries(perTab).map(([t, btns]) => ({
            tab: t, has: btns.some(b => b.toLowerCase().includes(verb.toLowerCase())),
        }));
        const allHave = hits.every(h => h.has);
        record(`     "${verb}": ${hits.map(h => `${h.tab}=${h.has?"Y":"N"}`).join("  ")}  → ${allHave ? "✅ uniform" : "❌ inconsistent"}`);
    }
}

// ─── Probe L: Mobile viewport ──────────────────────────────────────
async function probeLMobileViewport(page) {
    record(`\n[L] Mobile viewport 768×900`);
    await page.setViewportSize({ width: 768, height: 900 });
    await page.waitForTimeout(700);
    await page.goto(BASE + "/", NAV);
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(OUT_DIR, "L-mobile-768.png"), fullPage: false });
    const obs = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        overflowX: getComputedStyle(document.body).overflowX,
        stripVisible: !!document.querySelector(".gn-surface-switcher"),
    }));
    record(`[L] strip visible: ${obs.stripVisible}`);
    record(`[L] horizontal overflow: scrollWidth=${obs.scrollWidth} clientWidth=${obs.clientWidth} (overflow=${obs.scrollWidth > obs.clientWidth})`);
    // Settings on mobile.
    await page.goto(BASE + "/settings/preferences", NAV);
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT_DIR, "L-mobile-settings.png"), fullPage: true });
    // Reset viewport.
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.waitForTimeout(400);
}

main().catch(async (err) => {
    console.error("[FAIL]", err);
    process.exitCode = 1;
});
