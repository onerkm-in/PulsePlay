#!/usr/bin/env node
// playground/scripts/verify-beast-mode-e2e.mjs
//
// BEAST MODE end-to-end validation for the 2026-05-25 per-tab-visibility
// + TopRightToolbar ship (commits dfb579d → 329bd3c).
//
// Probes:
//   A. Boot
//   B. Settings → AI: every leaf + interactive controls
//   C. Settings → BI: every leaf
//   D. Settings → Advanced: every leaf
//   E. Settings → Display: per-tab checkboxes + landing + clean state
//   F. Settings rail navigation (4 groups)
//   G. Live tab toggle (Settings → strip updates)
//   H. TopRightToolbar mounted on each tab + 5 buttons + position
//   I. AI Insights tab — visual + empty-state quality
//   J. Ask Pulse tab — REAL chat: send 2 questions, capture replies + badges
//   K. Dashboard tab — empty state observation
//   L. Single-tab collapse for each tab
//   M. Adversarial composer (empty/whitespace/XSS/long)
//   N. TopRightToolbar interactive clicks (Maximize / Minimize / Pin)
//   O. Mobile 768×900
//   P. Final sweep: console + network errors

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".beast-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";

const log = [];
const errors = { console: [], page: [], net: [] };
const apiCalls = [];
const record = (line) => { log.push(line); console.log(line); };

const NAV = { waitUntil: "domcontentloaded", timeout: 20_000 };

async function flushLog() {
    try { await writeFile(join(OUT_DIR, "beast.log"), log.join("\n"), "utf-8"); } catch (_) {}
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
    record(`╔═══════════════════════════════════════════════════════════════════╗`);
    record(`║              PULSEPLAY BEAST-MODE E2E VALIDATION                  ║`);
    record(`║              Slow-paced @ slowMo=650ms — watch each step          ║`);
    record(`╠═══════════════════════════════════════════════════════════════════╣`);
    record(`║ CHECKLIST — what this run validates:                              ║`);
    record(`║                                                                   ║`);
    record(`║ A. Boot           — title, tabs (3), toolbar (5 btns), Ready pill ║`);
    record(`║ B. Settings AI    — every leaf renders, controls reachable        ║`);
    record(`║ C. Settings BI    — every leaf renders                            ║`);
    record(`║ D. Settings Adv   — every leaf renders                            ║`);
    record(`║ E. Settings Disp  — 3 checkboxes, landing, NO legacy pickers      ║`);
    record(`║ F. Rail nav       — AI / BI / Advanced / Display click + URL OK  ║`);
    record(`║ G. Live toggle    — uncheck Dashboard → strip updates immediately ║`);
    record(`║ H. Toolbar mount  — same 5 btns + position on all 3 tabs          ║`);
    record(`║ I. AI Insights    — sparkle icon, headline, bullets, 2 CTAs       ║`);
    record(`║ J. Ask Pulse REAL — 2 questions sent, replies + TrustBadges       ║`);
    record(`║ K. Dashboard      — empty state observation + KNOWN orphan-copy   ║`);
    record(`║ L. Tab collapse   — each tab as solo: AI / Ask / Dash             ║`);
    record(`║ M. Adversarial    — empty / whitespace / XSS / 5000-char          ║`);
    record(`║ N. Toolbar live   — click each of 5 buttons, observe state delta  ║`);
    record(`║ O. Mobile 768     — toolbar visible, no horizontal overflow       ║`);
    record(`║ P. Reload persist — tab visibility + profile survive reload       ║`);
    record(`║ Q. Keyboard nav   — Arrow keys cycle tabs                         ║`);
    record(`║ R. Final sweep    — console + page + network errors enumerated    ║`);
    record(`╚═══════════════════════════════════════════════════════════════════╝\n`);
    const browser = await chromium.launch({
        headless: false, slowMo: 650,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();

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
    await safe("H", () => probeHToolbarMounted(page));
    await safe("I", () => probeIAiInsightsTab(page));
    await safe("J", () => probeJAskPulseRealChat(page));
    await safe("K", () => probeKDashboardTab(page));
    await safe("L", () => probeLSingleTabCollapse(page));
    await safe("M", () => probeMAdversarialInputs(page));
    await safe("N", () => probeNToolbarInteractive(page));
    await safe("O", () => probeOMobileViewport(page));
    await safe("P", () => probePReloadPersistence(page));
    await safe("Q", () => probeQKeyboardNav(page));

    // Final sweep.
    record(`\n══════ FINAL SWEEP ══════`);
    record(`[summary] console.errors: ${errors.console.length}`);
    record(`[summary] pageerrors:     ${errors.page.length}`);
    record(`[summary] network 4xx/5xx/failed: ${errors.net.length}`);
    record(`[summary] total /api/* calls: ${apiCalls.length}`);
    const distinctApi = [...new Set(apiCalls.map(c => `${c.method} ${stripQuery(c.url)}`))];
    record(`[summary] distinct /api/* endpoints touched: ${distinctApi.length}`);
    for (const ep of distinctApi) record(`  • ${ep}`);
    if (errors.net.filter(e => !e.includes("ERR_ABORTED")).length > 0) {
        record(`\n[summary] REAL network failures (excluding Vite-HMR aborts):`);
        for (const e of errors.net.filter(e => !e.includes("ERR_ABORTED"))) record(`  ${e}`);
    } else {
        record(`[summary] no real network failures (ERR_ABORTED is Vite-HMR noise, ignored)`);
    }

    record(`\n[done] closing in 5 seconds`);
    await page.waitForTimeout(5000);
    await flushLog();
    await browser.close();
}

// ─── A: Boot ───────────────────────────────────────────────────────
async function probeABoot(page) {
    record(`\n[A] Boot — ${BASE}/`);
    await page.goto(BASE + "/", NAV);
    await seedProfile(page);
    await page.reload(NAV);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: join(OUT_DIR, "A-boot.png"), fullPage: false });
    const obs = await page.evaluate(() => ({
        title: document.title,
        strip: !!document.querySelector(".gn-surface-switcher"),
        insights: !!document.querySelector("#gn-tab-insights"),
        chat:     !!document.querySelector("#gn-tab-chat"),
        dashboard:!!document.querySelector("#gn-tab-dashboard"),
        toolbar: !!document.querySelector('[data-testid="pp-top-right-toolbar"]'),
        toolbarBtns: document.querySelectorAll('[data-testid="pp-top-right-toolbar"] button').length,
        pill: !!document.querySelector('[aria-label*="setup readiness"]') || !!document.querySelector('button:has-text("Ready")'),
    }));
    record(`[A] title="${obs.title}"  strip=${obs.strip}  tabs(AI/Ask/Dash)=${obs.insights}/${obs.chat}/${obs.dashboard}`);
    record(`[A] TopRightToolbar mounted=${obs.toolbar} buttons=${obs.toolbarBtns}  Ready pill present=${obs.pill}`);
}

// ─── B: Settings → AI ──────────────────────────────────────────────
async function probeBSettingsAi(page) {
    record(`\n[B] Settings → AI — every leaf renders`);
    await page.goto(BASE + "/settings/ai", NAV);
    await page.waitForTimeout(800);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await page.waitForTimeout(400);
    const obs = await page.evaluate(() => ({
        buttons: document.querySelectorAll("main button, [role=group] button").length,
        selects: document.querySelectorAll("select").length,
        inputs:  document.querySelectorAll('main input').length,
        leafLabels: Array.from(document.querySelectorAll("main h3, main h4, main strong"))
            .map(el => (el.textContent || "").trim()).filter(t => t && t.length < 50).slice(0, 30),
    }));
    record(`[B] controls: buttons=${obs.buttons} selects=${obs.selects} inputs=${obs.inputs}`);
    record(`[B] leaf labels sample (first 10): ${JSON.stringify(obs.leafLabels.slice(0, 10))}`);
    await page.screenshot({ path: join(OUT_DIR, "B-settings-ai.png"), fullPage: true });
}

// ─── C: Settings → BI ──────────────────────────────────────────────
async function probeCSettingsBi(page) {
    record(`\n[C] Settings → BI — every leaf renders`);
    await page.goto(BASE + "/settings/bi", NAV);
    await page.waitForTimeout(800);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await page.waitForTimeout(400);
    const obs = await page.evaluate(() => ({
        buttons: document.querySelectorAll("main button, [role=group] button").length,
        selects: document.querySelectorAll("select").length,
        inputs:  document.querySelectorAll('main input').length,
    }));
    record(`[C] controls: buttons=${obs.buttons} selects=${obs.selects} inputs=${obs.inputs}`);
    await page.screenshot({ path: join(OUT_DIR, "C-settings-bi.png"), fullPage: true });
}

// ─── D: Settings → Advanced ────────────────────────────────────────
async function probeDSettingsAdvanced(page) {
    record(`\n[D] Settings → Advanced — every leaf renders`);
    await page.goto(BASE + "/settings/advanced", NAV);
    await page.waitForTimeout(800);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await page.waitForTimeout(400);
    const obs = await page.evaluate(() => ({
        buttons: document.querySelectorAll("main button, [role=group] button").length,
        selects: document.querySelectorAll("select").length,
        inputs:  document.querySelectorAll('main input').length,
    }));
    record(`[D] controls: buttons=${obs.buttons} selects=${obs.selects} inputs=${obs.inputs}`);
    await page.screenshot({ path: join(OUT_DIR, "D-settings-advanced.png"), fullPage: true });
}

// ─── E: Settings → Display ─────────────────────────────────────────
async function probeESettingsDisplay(page) {
    record(`\n[E] Settings → Display — per-tab + landing + clean state`);
    await page.goto(BASE + "/settings/preferences", NAV);
    await page.waitForTimeout(800);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await page.waitForTimeout(400);
    const obs = await page.evaluate(() => {
        const cb = (label) => {
            const inputs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
            const found = inputs.find(i => i.parentElement?.textContent?.includes(label));
            return found ? { checked: found.checked, disabled: found.disabled } : null;
        };
        return {
            cbAiInsights: cb("AI Insights"),
            cbAskPulse:   cb("Ask Pulse"),
            cbDashboard:  cb("Dashboard"),
            hasVisiblePanelsPicker: Array.from(document.querySelectorAll("button"))
                .some(b => /^AI only$|^BI only$|^Unified$|^Split$/.test((b.textContent || "").trim())),
            hasAiPositionPicker: Array.from(document.querySelectorAll("button"))
                .some(b => /^Left$|^Right$|^Top$|^Bottom$/.test((b.textContent || "").trim())),
            hasMixCompositionPanel: document.body.textContent?.includes("Mix composition") || false,
            landingOpts: Array.from(document.querySelectorAll("button"))
                .filter(b => /^AI Insights$|^Ask Pulse$|^Dashboard$/.test((b.textContent || "").trim())).length,
        };
    });
    record(`[E] AI Insights cb: ${JSON.stringify(obs.cbAiInsights)}`);
    record(`[E] Ask Pulse  cb: ${JSON.stringify(obs.cbAskPulse)}`);
    record(`[E] Dashboard  cb: ${JSON.stringify(obs.cbDashboard)}`);
    record(`[E] LEGACY hasVisiblePanelsPicker: ${obs.hasVisiblePanelsPicker} (expect false)`);
    record(`[E] LEGACY hasAiPositionPicker:    ${obs.hasAiPositionPicker}    (expect false)`);
    record(`[E] LEGACY hasMixCompositionPanel: ${obs.hasMixCompositionPanel} (expect false)`);
    record(`[E] Default landing option count:  ${obs.landingOpts} (expect 3)`);
    await page.screenshot({ path: join(OUT_DIR, "E-settings-display.png"), fullPage: true });
}

// ─── F: Settings rail navigation ───────────────────────────────────
async function probeFSettingsNavigation(page) {
    record(`\n[F] Settings rail navigation — click all 4 groups`);
    const groups = [
        { id: "ai",          label: "AI Setup" },
        { id: "bi",          label: "BI Setup" },
        { id: "advanced",    label: "Advanced" },
        { id: "preferences", label: "Display" },
    ];
    await page.goto(BASE + "/settings/ai", NAV);
    await page.waitForTimeout(500);
    for (const g of groups) {
        const link = page.locator(`a:has-text("${g.label}"), button:has-text("${g.label}")`).first();
        if ((await link.count()) === 0) { record(`[F] ⚠️ rail link "${g.label}" not found`); continue; }
        await link.click().catch(() => {});
        await page.waitForTimeout(500);
        const url = page.url();
        record(`[F] click "${g.label}" → url=${url.replace(BASE, "")}  ${url.includes(`/settings/${g.id}`) ? "✅" : "❌"}`);
    }
}

// ─── G: Live tab toggle ────────────────────────────────────────────
async function probeGLiveTabToggle(page) {
    record(`\n[G] Live toggle — uncheck Dashboard, verify strip updates`);
    await page.goto(BASE + "/settings/preferences", NAV);
    await page.waitForTimeout(800);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await page.waitForTimeout(400);
    const dashCb = await page.evaluateHandle(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
        return inputs.find(i => i.parentElement?.textContent?.includes("Dashboard"));
    });
    const dashEl = dashCb.asElement();
    if (!dashEl) { record(`[G] FAIL: checkbox not found`); return; }
    await dashEl.click();
    await page.waitForTimeout(400);
    await page.goto(BASE + "/", NAV);
    await page.waitForTimeout(900);
    const obs = await page.evaluate(() => ({
        strip: !!document.querySelector(".gn-surface-switcher"),
        insights: !!document.querySelector("#gn-tab-insights"),
        chat:     !!document.querySelector("#gn-tab-chat"),
        dashboard:!!document.querySelector("#gn-tab-dashboard"),
    }));
    record(`[G] after uncheck Dashboard: strip=${obs.strip} AI=${obs.insights} Ask=${obs.chat} Dash=${obs.dashboard}`);
    record(`[G] expect strip=true, AI=true, Ask=true, Dash=false → ${obs.strip && obs.insights && obs.chat && !obs.dashboard ? "✅ PASS" : "❌ FAIL"}`);
    await page.screenshot({ path: join(OUT_DIR, "G-after-toggle.png"), fullPage: false });
    // Restore.
    await page.evaluate(() => {
        window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({ aiInsights: true, askPulse: true, dashboard: true }));
        window.dispatchEvent(new CustomEvent("pulseplay:display-change", { detail: { key: "pulseplay:tab-visibility", value: JSON.stringify({ aiInsights: true, askPulse: true, dashboard: true }) } }));
    });
    await page.reload(NAV);
    await page.waitForTimeout(700);
}

// ─── H: TopRightToolbar mounted ────────────────────────────────────
async function probeHToolbarMounted(page) {
    record(`\n[H] TopRightToolbar mounted on each tab — uniform position`);
    const tabs = [
        { id: "insights",  click: "#gn-tab-insights",  label: "AI Insights" },
        { id: "chat",      click: "#gn-tab-chat",      label: "Ask Pulse" },
        { id: "dashboard", click: "#gn-tab-dashboard", label: "Dashboard" },
    ];
    for (const t of tabs) {
        await page.goto(BASE + "/", NAV);
        await page.waitForTimeout(800);
        await page.locator(t.click).click().catch(() => {});
        await page.waitForTimeout(600);
        const obs = await page.evaluate(() => {
            const tb = document.querySelector('[data-testid="pp-top-right-toolbar"]');
            const rect = tb?.getBoundingClientRect();
            const btns = Array.from(tb?.querySelectorAll("button") || []).map(b => b.getAttribute("aria-label") || "");
            return {
                mounted: !!tb,
                position: rect ? { top: Math.round(rect.top), right: Math.round(window.innerWidth - rect.right) } : null,
                btnCount: btns.length,
                btnLabels: btns,
                legacyAiHidden: (() => {
                    const el = document.querySelector('[data-testid="pp-panel-controls-ai"]');
                    return el ? getComputedStyle(el).display === "none" : true;
                })(),
                legacyBiHidden: (() => {
                    const el = document.querySelector('[data-testid="pp-panel-controls-bi"]');
                    return el ? getComputedStyle(el).display === "none" : true;
                })(),
                legacyPulseHidden: (() => {
                    const el = document.querySelector('.gn-pane-action-cluster');
                    return el ? getComputedStyle(el).display === "none" : true;
                })(),
            };
        });
        record(`[H-${t.id}] mounted=${obs.mounted}  pos=${JSON.stringify(obs.position)}  btns=${obs.btnCount}`);
        record(`[H-${t.id}] labels: ${JSON.stringify(obs.btnLabels)}`);
        record(`[H-${t.id}] legacy hidden — AI:${obs.legacyAiHidden} BI:${obs.legacyBiHidden} Pulse:${obs.legacyPulseHidden}`);
    }
}

// ─── I: AI Insights tab ────────────────────────────────────────────
async function probeIAiInsightsTab(page) {
    record(`\n[I] AI Insights tab — empty-state quality`);
    await page.goto(BASE + "/", NAV);
    await page.waitForTimeout(900);
    await page.locator("#gn-tab-insights").click().catch(() => {});
    await page.waitForTimeout(700);
    const obs = await page.evaluate(() => {
        const t = (document.body.textContent || "").toLowerCase();
        return {
            hasInsightsHeadline: t.includes("ai insights"),
            hasConnectCTA: t.includes("connect ai assistant"),
            hasBrowseCTA: t.includes("browse knowledge packs"),
            hasBullets: (t.match(/headline.*trends.*risks.*recommended/) || []).length > 0,
            hasSparkle: !!document.querySelector('svg path[d*="L14 10 L21 12"]'),
        };
    });
    record(`[I] insights headline: ${obs.hasInsightsHeadline}`);
    record(`[I] Connect AI assistant CTA: ${obs.hasConnectCTA}`);
    record(`[I] Browse knowledge packs CTA: ${obs.hasBrowseCTA}`);
    record(`[I] Sparkle icon: ${obs.hasSparkle}`);
    record(`[I] Headline/Trends/Risks/Recommended bullets: ${obs.hasBullets}`);
    await page.screenshot({ path: join(OUT_DIR, "I-ai-insights.png"), fullPage: false });
}

// ─── J: Ask Pulse REAL chat ────────────────────────────────────────
async function probeJAskPulseRealChat(page) {
    record(`\n[J] Ask Pulse — REAL chat: 2 questions, capture replies + badges`);
    await page.goto(BASE + "/", NAV);
    await page.waitForTimeout(800);
    await page.locator("#gn-tab-chat").click().catch(() => {});
    await page.waitForTimeout(700);
    const composer = page.locator("textarea").first();
    if ((await composer.count()) === 0) { record(`[J] FAIL: composer not found`); return; }
    const askBtn = page.locator("button.pp-ai-sidebar__ask, button.gn-ask-btn, button:has-text('Ask')").filter({ visible: true }).first();
    const askExists = (await askBtn.count()) > 0;
    record(`[J] composer found, ask button found=${askExists}`);
    if (!askExists) {
        record(`[J] ⚠️ no Ask button — Pulse-side composer uses Enter-to-submit; trying that`);
    }
    const prompts = [
        "What is the total sales by category?",
        "Top 5 sub-categories by profit?",
    ];
    for (let i = 0; i < prompts.length; i++) {
        await composer.fill(prompts[i]);
        await page.waitForTimeout(400);
        if (askExists) {
            await askBtn.click().catch(() => {});
        } else {
            await composer.press("Enter");
        }
        record(`[J${i+1}] submitted "${prompts[i].slice(0, 50)}" — waiting up to 60s`);
        const final = await waitForLastEntryFinal(page, 60_000);
        record(`[J${i+1}] final status: ${final}`);
        await page.screenshot({ path: join(OUT_DIR, `J-chat-${i+1}.png`), fullPage: true });
    }
    const replyCounts = await page.evaluate(() => ({
        entries: document.querySelectorAll('[data-testid^="pp-ai-entry-"]').length,
        badges: document.querySelectorAll('[data-testid="trust-badge"]').length,
    }));
    record(`[J] total entries: ${replyCounts.entries}  badges: ${replyCounts.badges}`);
}

// ─── K: Dashboard tab ──────────────────────────────────────────────
async function probeKDashboardTab(page) {
    record(`\n[K] Dashboard tab — empty-state observation`);
    await page.goto(BASE + "/", NAV);
    await page.waitForTimeout(800);
    await page.locator("#gn-tab-dashboard").click().catch(() => {});
    await page.waitForTimeout(800);
    const obs = await page.evaluate(() => {
        const t = (document.body.textContent || "").toLowerCase();
        return {
            hasDashboardLabel: t.includes("dashboard"),
            hasIframe: document.querySelectorAll("iframe").length > 0,
            hasOrphanAskPulseCopy: /ask pulse a question/.test(t),
            hasNativeResultCanvasCopy: /native result canvas/.test(t),
        };
    });
    record(`[K] dashboard label: ${obs.hasDashboardLabel}`);
    record(`[K] iframe present: ${obs.hasIframe}`);
    record(`[K] ⚠️ orphan "Ask Pulse a question" copy: ${obs.hasOrphanAskPulseCopy} (KNOWN BUG)`);
    record(`[K] "Native result canvas" copy: ${obs.hasNativeResultCanvasCopy}`);
    await page.screenshot({ path: join(OUT_DIR, "K-dashboard.png"), fullPage: false });
}

// ─── L: Single-tab collapse ────────────────────────────────────────
async function probeLSingleTabCollapse(page) {
    record(`\n[L] Single-tab collapse — each tab as solo main page`);
    const solos = [
        { id: "ai-only",   v: { aiInsights: true,  askPulse: false, dashboard: false } },
        { id: "ask-only",  v: { aiInsights: false, askPulse: true,  dashboard: false } },
        { id: "dash-only", v: { aiInsights: false, askPulse: false, dashboard: true  } },
    ];
    for (const s of solos) {
        await page.evaluate((v) => {
            window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify(v));
        }, s.v);
        await page.goto(BASE + "/", NAV);
        await page.waitForTimeout(900);
        const strip = await page.evaluate(() => !!document.querySelector(".gn-surface-switcher"));
        record(`[L-${s.id}] strip=${strip} (expect false) → ${strip === false ? "✅ PASS" : "❌ FAIL"}`);
        await page.screenshot({ path: join(OUT_DIR, `L-${s.id}.png`), fullPage: false });
    }
    // Restore.
    await page.evaluate(() => {
        window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({ aiInsights: true, askPulse: true, dashboard: true }));
    });
}

// ─── M: Adversarial composer ───────────────────────────────────────
async function probeMAdversarialInputs(page) {
    record(`\n[M] Adversarial composer inputs`);
    await page.goto(BASE + "/", NAV);
    await page.waitForTimeout(800);
    await page.locator("#gn-tab-chat").click().catch(() => {});
    await page.waitForTimeout(700);
    const composer = page.locator("textarea").first();
    if ((await composer.count()) === 0) { record(`[M] FAIL: composer not found`); return; }

    // M1: empty
    await composer.fill("");
    record(`[M1] empty fill OK`);
    // M2: whitespace
    await composer.fill("    \t  \n  ");
    record(`[M2] whitespace fill OK`);
    // M3: XSS
    await page.evaluate(() => {
        window.__probeAlertCalled = false;
        const orig = window.alert;
        window.alert = () => { window.__probeAlertCalled = true; };
        setTimeout(() => { window.alert = orig; }, 15_000);
    });
    await composer.fill(`<img src=x onerror=alert("XSS")><script>alert("XSS")</script>`);
    await page.waitForTimeout(300);
    const alertFired = await page.evaluate(() => window.__probeAlertCalled);
    record(`[M3] XSS fill alert=${alertFired} (expect false)`);
    // M4: very long
    await composer.fill("a".repeat(5000));
    const filledLen = await composer.inputValue().then(v => v.length);
    record(`[M4] very-long fill: ${filledLen} chars`);
    await composer.fill("");
}

// ─── N: TopRightToolbar interactive — click each of 5 buttons ──────
async function probeNToolbarInteractive(page) {
    record(`\n[N] TopRightToolbar interactive — exercise each of 5 buttons individually`);
    await page.goto(BASE + "/", NAV);
    await page.waitForTimeout(800);

    const initialState = await page.evaluate(() => ({
        focus: document.querySelector('[data-viewport-focus]')?.getAttribute("data-viewport-focus"),
        pinned: document.querySelector('[data-layout-pinned]')?.getAttribute("data-layout-pinned"),
        toolbarBtns: Array.from(document.querySelectorAll('[data-testid="pp-top-right-toolbar"] button'))
            .map((b, i) => ({ i, label: b.getAttribute("aria-label") || "", title: b.getAttribute("title") || "" })),
    }));
    record(`[N] initial: focus="${initialState.focus}" pinned="${initialState.pinned}" btnCount=${initialState.toolbarBtns.length}`);
    record(`[N] buttons enumerated:`);
    for (const b of initialState.toolbarBtns) record(`     [${b.i}] aria="${b.label}"  title="${b.title}"`);

    const totalButtons = initialState.toolbarBtns.length;
    if (totalButtons < 5) {
        record(`[N] ⚠️ expected ≥5 toolbar buttons, got ${totalButtons}`);
    }

    // N1: Maximize (button 0)
    record(`\n[N1] click button[0] (Maximize)`);
    await page.locator('[data-testid="pp-top-right-toolbar"] button').nth(0).click().catch(() => {});
    await page.waitForTimeout(700);
    const afterMax = await page.evaluate(() => document.querySelector('[data-viewport-focus]')?.getAttribute("data-viewport-focus"));
    record(`[N1] data-viewport-focus="${afterMax}" (expect "ai" or non-null)`);
    await page.screenshot({ path: join(OUT_DIR, "N1-after-maximize.png"), fullPage: false });

    // Restore (re-click first button — if now Maximize→Restore is rendered)
    record(`\n[N1b] click button[0] again (now Restore)`);
    await page.locator('[data-testid="pp-top-right-toolbar"] button').nth(0).click().catch(() => {});
    await page.waitForTimeout(700);
    const afterRestore = await page.evaluate(() => document.querySelector('[data-viewport-focus]')?.getAttribute("data-viewport-focus"));
    record(`[N1b] data-viewport-focus="${afterRestore}" (expect "split" or null)`);

    // N2: Minimize (button 1)
    record(`\n[N2] click button[1] (Minimize)`);
    await page.locator('[data-testid="pp-top-right-toolbar"] button').nth(1).click().catch(() => {});
    await page.waitForTimeout(700);
    const afterMin = await page.evaluate(() => ({
        enabled: window.localStorage.getItem("pulseplay:enabled-components"),
        focus: document.querySelector('[data-viewport-focus]')?.getAttribute("data-viewport-focus"),
    }));
    record(`[N2] enabledComponents="${afterMin.enabled}"  focus="${afterMin.focus}"`);
    await page.screenshot({ path: join(OUT_DIR, "N2-after-minimize.png"), fullPage: false });

    // Restore via Show all (or manual state)
    await page.evaluate(() => {
        window.localStorage.setItem("pulseplay:enabled-components", "mix");
        window.dispatchEvent(new CustomEvent("pulseplay:display-change", { detail: { key: "pulseplay:enabled-components", value: "mix" } }));
    });
    await page.reload(NAV);
    await page.waitForTimeout(900);

    // N3: Pin (button 2)
    record(`\n[N3] click button[2] (Pin)`);
    await page.locator('[data-testid="pp-top-right-toolbar"] button').nth(2).click().catch(() => {});
    await page.waitForTimeout(700);
    const afterPin = await page.evaluate(() => ({
        pinned: document.querySelector('[data-layout-pinned]')?.getAttribute("data-layout-pinned"),
        storage: window.localStorage.getItem("pulseplay:pinned-viewport-pane"),
    }));
    record(`[N3] data-layout-pinned="${afterPin.pinned}"  storage="${afterPin.storage}" (expect non-null)`);
    await page.screenshot({ path: join(OUT_DIR, "N3-after-pin.png"), fullPage: false });

    // Unpin
    record(`\n[N3b] click button[2] again (Unpin)`);
    await page.locator('[data-testid="pp-top-right-toolbar"] button').nth(2).click().catch(() => {});
    await page.waitForTimeout(500);
    const afterUnpin = await page.evaluate(() => ({
        pinned: document.querySelector('[data-layout-pinned]')?.getAttribute("data-layout-pinned"),
        storage: window.localStorage.getItem("pulseplay:pinned-viewport-pane"),
    }));
    record(`[N3b] data-layout-pinned="${afterUnpin.pinned}"  storage="${afterUnpin.storage}" (expect null)`);

    // N4: Open in separate page (button 3) — track if new tab opens via popup
    record(`\n[N4] click button[3] (Open in separate page)`);
    const before4 = page.url();
    const popupPromise = page.context().waitForEvent("page", { timeout: 3000 }).catch(() => null);
    await page.locator('[data-testid="pp-top-right-toolbar"] button').nth(3).click().catch(() => {});
    await page.waitForTimeout(700);
    const popup = await popupPromise;
    if (popup) {
        const popupUrl = popup.url();
        record(`[N4] popup opened: ${popupUrl.replace(BASE, "")}`);
        await popup.close().catch(() => {});
    } else {
        record(`[N4] no popup detected (may navigate inline or be blocked) — current url: ${page.url().replace(BASE, "")}`);
    }
    if (page.url() !== before4) {
        await page.goBack().catch(() => {});
        await page.waitForTimeout(500);
    }

    // N5: Pop out as window (button 4) — D1 BUG: known React unmount race
    record(`\n[N5] click button[4] (Pop out as window) — KNOWN BUG D1 may fire`);
    const before5 = page.url();
    await page.locator('[data-testid="pp-top-right-toolbar"] button').nth(4).click().catch(() => {});
    await page.waitForTimeout(900);
    const after5 = await page.evaluate(() => ({
        floatingSlot: document.querySelectorAll('[data-testid="pp-screen-floating-slot"]').length,
    }));
    record(`[N5] floating-slot count: ${after5.floatingSlot} (expect 1 if pop-out succeeded)`);
    await page.screenshot({ path: join(OUT_DIR, "N5-after-popout.png"), fullPage: false });

    // Restore state — close any floating + reset.
    await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent("pulseplay:viewport-action", { detail: { action: "dock", pane: "ai" } }));
    });
    await page.waitForTimeout(500);
    await page.reload(NAV);
    await page.waitForTimeout(800);
}

// ─── P: Reload persistence ─────────────────────────────────────────
async function probePReloadPersistence(page) {
    record(`\n[P] Reload state persistence`);
    // Set non-default state.
    await page.evaluate(() => {
        window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({ aiInsights: true, askPulse: false, dashboard: true }));
    });
    await page.goto(BASE + "/", NAV);
    await page.waitForTimeout(900);
    const before = await page.evaluate(() => ({
        tabVis: window.localStorage.getItem("pulseplay:tab-visibility"),
        profile: window.localStorage.getItem("pulseplay:active-ai-profile"),
        uiMode: window.localStorage.getItem("pulseplay:ui-mode"),
        askTabPresent: !!document.querySelector("#gn-tab-chat"),
    }));
    record(`[P] before reload: tabVis=${before.tabVis} profile="${before.profile}" askTab=${before.askTabPresent}`);
    await page.reload(NAV);
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => ({
        tabVis: window.localStorage.getItem("pulseplay:tab-visibility"),
        profile: window.localStorage.getItem("pulseplay:active-ai-profile"),
        uiMode: window.localStorage.getItem("pulseplay:ui-mode"),
        askTabPresent: !!document.querySelector("#gn-tab-chat"),
    }));
    record(`[P] after  reload: tabVis=${after.tabVis} profile="${after.profile}" askTab=${after.askTabPresent}`);
    const tabVisPersisted = before.tabVis === after.tabVis;
    const profilePersisted = before.profile === after.profile;
    const askHiddenStillHidden = !before.askTabPresent && !after.askTabPresent;
    record(`[P] tabVisibility persisted: ${tabVisPersisted ? "✅" : "❌"}`);
    record(`[P] profile persisted:       ${profilePersisted ? "✅" : "❌"}`);
    record(`[P] Ask Pulse stays hidden after reload: ${askHiddenStillHidden ? "✅" : "❌"}`);
    // Restore all-enabled.
    await page.evaluate(() => {
        window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({ aiInsights: true, askPulse: true, dashboard: true }));
    });
}

// ─── Q: Keyboard navigation ────────────────────────────────────────
async function probeQKeyboardNav(page) {
    record(`\n[Q] Keyboard navigation — Arrow keys cycle tabs`);
    await page.goto(BASE + "/", NAV);
    await page.waitForTimeout(900);
    // Focus the AI Insights tab.
    await page.locator("#gn-tab-insights").focus().catch(() => {});
    await page.waitForTimeout(400);
    const focused0 = await page.evaluate(() => document.activeElement?.id || "");
    record(`[Q] initial focus: "${focused0}"`);
    // Arrow Right → should focus Ask Pulse
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
    const focused1 = await page.evaluate(() => document.activeElement?.id || "");
    record(`[Q] after ArrowRight: "${focused1}" (expect "gn-tab-chat")`);
    // Arrow Right → should focus Dashboard
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
    const focused2 = await page.evaluate(() => document.activeElement?.id || "");
    record(`[Q] after 2nd ArrowRight: "${focused2}" (expect "gn-tab-dashboard")`);
    // Home → AI Insights
    await page.keyboard.press("Home");
    await page.waitForTimeout(400);
    const focused3 = await page.evaluate(() => document.activeElement?.id || "");
    record(`[Q] after Home: "${focused3}" (expect "gn-tab-insights")`);
    // End → Dashboard
    await page.keyboard.press("End");
    await page.waitForTimeout(400);
    const focused4 = await page.evaluate(() => document.activeElement?.id || "");
    record(`[Q] after End: "${focused4}" (expect "gn-tab-dashboard")`);
}

// ─── O: Mobile viewport ────────────────────────────────────────────
async function probeOMobileViewport(page) {
    record(`\n[O] Mobile viewport 768×900`);
    await page.setViewportSize({ width: 768, height: 900 });
    await page.waitForTimeout(700);
    await page.goto(BASE + "/", NAV);
    await page.waitForTimeout(900);
    const obs = await page.evaluate(() => ({
        toolbar: !!document.querySelector('[data-testid="pp-top-right-toolbar"]'),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        overflowX: getComputedStyle(document.body).overflowX,
    }));
    record(`[O] toolbar visible: ${obs.toolbar}`);
    record(`[O] overflow: scrollWidth=${obs.scrollWidth} clientWidth=${obs.clientWidth} (overflow=${obs.scrollWidth > obs.clientWidth})`);
    await page.screenshot({ path: join(OUT_DIR, "O-mobile.png"), fullPage: false });
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.waitForTimeout(400);
}

main().catch(async (err) => {
    console.error("[FAIL]", err);
    process.exitCode = 1;
});
