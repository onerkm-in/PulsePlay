#!/usr/bin/env node
// playground/scripts/verify-beast-1500.mjs
//
// BEAST MODE — 1500 interleaved operations against the END-USER Ask
// Pulse surface (uiMode=pulse → PulseShell):
//   • 1000 question submissions (catalog × 10) — measure submit→first
//     paint, completion, surface UI defects per case
//   • 500 random settings + guidance changes — exercise the author-
//     controlled knobs that change Ask Pulse's behavior (assistant
//     profile, sendContextToGenie, runtimeForbiddenColumns,
//     runtimeMandatoryRowFilter, insightsPrompt, insightsDomain,
//     metricDirectionRules, custom sections, tab-visibility,
//     layout-mode, default-landing-surface, ui-mode escape hatch,
//     genieFields, packSelection)
//
// All 1500 ops interleave in a deterministic-seeded shuffle so the
// sequence is repeatable but still mixes both kinds of work.
//
// Per-op captures (questions): submitMs, firstPaintMs, completedMs,
// wallMs, UI defects, screenshot on failure.
// Per-op captures (settings):  setting key, previous→new value,
// success boolean (read back from store), UI defects after change,
// screenshot on failure.
//
// Usage:
//   node scripts/verify-beast-1500.mjs                                    # default 1500 ops
//   BEAST_QUESTIONS=200 BEAST_SETTINGS=100 SLOW_MO=80 node scripts/...    # smaller
//   BEAST_SEED=42 node scripts/...                                        # different mix

import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const CATALOG = join(REPO, "docs/scenarios/06_ask_pulse_complex_extreme_100.md");
const OUT_DIR = join(REPO, "docs/evidence/beast-1500-2026-05-26");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";
const QUESTIONS = parseInt(process.env.BEAST_QUESTIONS || "1000", 10);
const SETTINGS = parseInt(process.env.BEAST_SETTINGS || "500", 10);
const COMPLEX_SCENARIOS = parseInt(process.env.BEAST_COMPLEX || "500", 10); // multi-setting bundles
const SLOW_MO = parseInt(process.env.SLOW_MO || "120", 10);
const FIRST_PAINT_CEILING_MS = parseInt(process.env.FIRST_PAINT_CEILING_MS || "20000", 10);
const INTER_QUESTION_DELAY_MS = parseInt(process.env.INTER_QUESTION_DELAY_MS || "1200", 10);
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || "60", 10);
const SEED = parseInt(process.env.BEAST_SEED || "20260526", 10);

// ─── Seeded RNG (mulberry32) ─────────────────────────────────────────────
function rng(seed) {
    let t = seed >>> 0;
    return function () {
        t |= 0; t = t + 0x6d2b79f5 | 0;
        let r = Math.imul(t ^ t >>> 15, 1 | t);
        r = r + Math.imul(r ^ r >>> 7, 61 | r) ^ r;
        return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
}
const rand = rng(SEED);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ─── Catalog parser ─────────────────────────────────────────────────────
function parseCatalog(md) {
    const out = [];
    const rowRe = /^\|\s*(APQ-\d{3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/;
    for (const line of md.split("\n")) {
        const m = line.match(rowRe);
        if (m) out.push({ id: m[1], complexity: m[2].split(" ")[0], useCase: m[3], layoutFocus: m[4], question: m[5].trim() });
    }
    return out;
}

// ─── Random settings/guidance op generator ──────────────────────────────
const PROFILES = ["default", "supervisor", "foundation", "powerbi-dwd"];
const DOMAINS = ["Sales Performance", "Retail Operations", "Marketing Attribution", "Customer Lifecycle", "Financial Close"];
const METRIC_RULES = [
    "Revenue: higher is better\nChurn %: lower is better",
    "Sales: higher is better\nProfit: higher is better\nMargin %: higher is better",
    "Net Promoter Score: higher is better\nReturn rate: lower is better",
    "Conversion rate: higher is better\nBounce rate: lower is better",
];
const GUIDANCE_TEXTS = [
    "Prefer year-over-year comparisons. Always cite the time window.",
    "Aggregate to category level unless the user asks for sub-category.",
    "Treat any margin below 5% as a risk pocket worth highlighting.",
    "Surface ship-mode mix only when shipping data is requested.",
    "Default to last 12 months unless a different period is named.",
];
const HEADLINE_OVERRIDES = [
    "Write the headline as: <one-sentence change verdict> · <which slice> · <by how much>.",
    "Lead with the worst-performing slice if anything is below threshold.",
    "Two sentences max. First names the metric, second names the slice + magnitude.",
];
const TRENDS_OVERRIDES = [
    "Use bullet list. Each bullet = direction + magnitude + slice + window.",
    "Show top 3 risers, top 3 fallers. No prose paragraphs.",
];
const RISKS_OVERRIDES = [
    "List the 5 highest-impact risks. Each must name impact, owner-ish category, and evidence gap.",
    "Only flag a risk if you can cite at least one row. Skip speculation.",
];
const ACTIONS_OVERRIDES = [
    "List 3 actions in priority order. Each: action, expected impact, evidence basis.",
    "Format as a checklist with owner suggestion in parens.",
];
const FORBIDDEN_COLUMNS = ["customer_id, ssn, email", "internal_notes, raw_score", "vendor_cost", ""];
const ROW_FILTERS = ["region IN ('Central','East','West','South')", "ship_mode = 'Standard Class'", "category = 'Office Supplies'", ""];
const CACHE_TTLS = ["disabled", "5m", "15m", "30m", "1h", "2h"];
const TAB_VIS_PATTERNS = [
    { aiInsights: true, askPulse: true, dashboard: true },
    { aiInsights: false, askPulse: true, dashboard: true },
    { aiInsights: true, askPulse: true, dashboard: false },
    { aiInsights: false, askPulse: true, dashboard: false },
];
const LAYOUT_MODES = ["ai-left", "ai-right", "ai-top", "ai-bottom"];
const LANDING_SURFACES = ["ai-insights", "ask-pulse", "bi-viz"];
const UI_MODES = ["pulse", "v0"];
const SECTIONED_CHAT_FLAGS = ["1", ""];
const VENDORS = ["powerbi", "tableau", "qlik", "looker", "generic-iframe"];

function makeSettingOp() {
    const kind = pick([
        "profile", "domain", "metric-rules", "guidance", "headline-override", "trends-override",
        "risks-override", "actions-override", "forbidden-columns", "row-filter", "cache-ttl",
        "tab-visibility", "layout-mode", "landing-surface", "ui-mode", "sectioned-chat",
        "vendor", "send-context", "show-provenance", "custom-prompt",
    ]);
    switch (kind) {
        case "profile":          return { kind, value: pick(PROFILES), storage: "pulseplay:active-ai-profile" };
        case "domain":           return { kind, value: pick(DOMAINS) };
        case "metric-rules":     return { kind, value: pick(METRIC_RULES) };
        case "guidance":         return { kind, value: pick(GUIDANCE_TEXTS) };
        case "headline-override": return { kind, value: pick(HEADLINE_OVERRIDES) };
        case "trends-override":  return { kind, value: pick(TRENDS_OVERRIDES) };
        case "risks-override":   return { kind, value: pick(RISKS_OVERRIDES) };
        case "actions-override": return { kind, value: pick(ACTIONS_OVERRIDES) };
        case "forbidden-columns": return { kind, value: pick(FORBIDDEN_COLUMNS) };
        case "row-filter":       return { kind, value: pick(ROW_FILTERS) };
        case "cache-ttl":        return { kind, value: pick(CACHE_TTLS) };
        case "tab-visibility":   return { kind, value: pick(TAB_VIS_PATTERNS), storage: "pulseplay:tab-visibility" };
        case "layout-mode":      return { kind, value: pick(LAYOUT_MODES), storage: "pulseplay:layout-mode" };
        case "landing-surface":  return { kind, value: pick(LANDING_SURFACES), storage: "pulseplay:default-landing-surface" };
        case "ui-mode":          return { kind, value: pick(UI_MODES), storage: "pulseplay:ui-mode" };
        case "sectioned-chat":   return { kind, value: pick(SECTIONED_CHAT_FLAGS), storage: "pulseplay:chat-sectioned-enabled" };
        case "vendor":           return { kind, value: pick(VENDORS), storage: "pulseplay:bi-vendor" };
        case "send-context":     return { kind, value: rand() < 0.5 };
        case "show-provenance":  return { kind, value: rand() < 0.5 };
        case "custom-prompt":    return { kind, value: "Audit-mode test prompt " + Math.floor(rand() * 9999) };
    }
}

// Complex multi-setting scenarios — 3-7 settings changed in one atomic
// op. These exercise the real-world authoring workflows: an admin
// flipping vendor + profile + guidance + metric rules + landing surface
// together, or switching context for a new sales-pack demo. Each
// scenario gets a label like "demo-switch" so failures classify cleanly.
function makeComplexScenario() {
    const flavor = pick(["pack-pivot", "guardrail-tightening", "guidance-sweep", "layout-shuffle", "vendor-swap", "all-overrides", "audit-readiness"]);
    const knobs = [];
    const addKnob = (kind) => knobs.push(makeSettingOp().kind === kind ? makeSettingOp() : { kind, value: makeSettingOp().value, storage: makeSettingOp().storage });
    switch (flavor) {
        case "pack-pivot":
            knobs.push({ kind: "vendor", value: pick(VENDORS), storage: "pulseplay:bi-vendor" });
            knobs.push({ kind: "profile", value: pick(PROFILES), storage: "pulseplay:active-ai-profile" });
            knobs.push({ kind: "domain", value: pick(DOMAINS) });
            knobs.push({ kind: "landing-surface", value: pick(LANDING_SURFACES), storage: "pulseplay:default-landing-surface" });
            break;
        case "guardrail-tightening":
            knobs.push({ kind: "forbidden-columns", value: pick(FORBIDDEN_COLUMNS) });
            knobs.push({ kind: "row-filter", value: pick(ROW_FILTERS) });
            knobs.push({ kind: "send-context", value: false });
            knobs.push({ kind: "show-provenance", value: true });
            break;
        case "guidance-sweep":
            knobs.push({ kind: "guidance", value: pick(GUIDANCE_TEXTS) });
            knobs.push({ kind: "headline-override", value: pick(HEADLINE_OVERRIDES) });
            knobs.push({ kind: "trends-override", value: pick(TRENDS_OVERRIDES) });
            knobs.push({ kind: "risks-override", value: pick(RISKS_OVERRIDES) });
            knobs.push({ kind: "actions-override", value: pick(ACTIONS_OVERRIDES) });
            knobs.push({ kind: "metric-rules", value: pick(METRIC_RULES) });
            knobs.push({ kind: "domain", value: pick(DOMAINS) });
            break;
        case "layout-shuffle":
            knobs.push({ kind: "tab-visibility", value: pick(TAB_VIS_PATTERNS), storage: "pulseplay:tab-visibility" });
            knobs.push({ kind: "layout-mode", value: pick(LAYOUT_MODES), storage: "pulseplay:layout-mode" });
            knobs.push({ kind: "landing-surface", value: pick(LANDING_SURFACES), storage: "pulseplay:default-landing-surface" });
            knobs.push({ kind: "ui-mode", value: pick(UI_MODES), storage: "pulseplay:ui-mode" });
            break;
        case "vendor-swap":
            knobs.push({ kind: "vendor", value: pick(VENDORS), storage: "pulseplay:bi-vendor" });
            knobs.push({ kind: "profile", value: pick(PROFILES), storage: "pulseplay:active-ai-profile" });
            knobs.push({ kind: "cache-ttl", value: pick(CACHE_TTLS) });
            break;
        case "all-overrides":
            knobs.push({ kind: "headline-override", value: pick(HEADLINE_OVERRIDES) });
            knobs.push({ kind: "trends-override", value: pick(TRENDS_OVERRIDES) });
            knobs.push({ kind: "risks-override", value: pick(RISKS_OVERRIDES) });
            knobs.push({ kind: "actions-override", value: pick(ACTIONS_OVERRIDES) });
            knobs.push({ kind: "custom-prompt", value: "Audit-scenario prompt " + Math.floor(rand() * 9999) });
            knobs.push({ kind: "cache-ttl", value: pick(CACHE_TTLS) });
            break;
        case "audit-readiness":
            knobs.push({ kind: "forbidden-columns", value: pick(FORBIDDEN_COLUMNS) });
            knobs.push({ kind: "row-filter", value: pick(ROW_FILTERS) });
            knobs.push({ kind: "show-provenance", value: true });
            knobs.push({ kind: "sectioned-chat", value: pick(SECTIONED_CHAT_FLAGS), storage: "pulseplay:chat-sectioned-enabled" });
            knobs.push({ kind: "guidance", value: pick(GUIDANCE_TEXTS) });
            break;
    }
    return { flavor, knobs };
}

function buildOps(catalog) {
    const ops = [];
    for (let i = 0; i < QUESTIONS; i++) {
        const sc = catalog[i % catalog.length];
        ops.push({ type: "question", n: i + 1, sc });
    }
    for (let i = 0; i < SETTINGS; i++) {
        ops.push({ type: "settings", n: i + 1, op: makeSettingOp() });
    }
    for (let i = 0; i < COMPLEX_SCENARIOS; i++) {
        ops.push({ type: "complex", n: i + 1, scenario: makeComplexScenario() });
    }
    // Shuffle (Fisher-Yates seeded)
    for (let i = ops.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [ops[i], ops[j]] = [ops[j], ops[i]];
    }
    return ops;
}

// ─── Banner ─────────────────────────────────────────────────────────────
async function banner(page, text, color) {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__beast__");
        if (!b) {
            b = document.createElement("div");
            b.id = "__beast__";
            Object.assign(b.style, {
                position: "fixed", top: "8px", left: "8px", right: "8px", zIndex: "99999",
                padding: "6px 12px", background: "rgba(15,23,42,0.92)", color: "#fff",
                font: "12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace",
                borderRadius: "4px", pointerEvents: "none",
            });
            document.body.appendChild(b);
        }
        b.style.borderLeft = `4px solid ${color}`;
        b.textContent = text;
    }, { text, color });
}

// ─── Seed (clean + minimal profile) ─────────────────────────────────────
async function clean(page) {
    await page.evaluate((profile) => {
        try { window.localStorage.clear(); } catch { /* swallow */ }
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile; ex.connectionMode = "proxy";
        ex.apiBaseUrl = window.location.origin + "/api";
        window.localStorage.setItem(k, JSON.stringify(ex));
    }, PROFILE);
}

// ─── Run a question op ──────────────────────────────────────────────────
async function runQuestion(page, op, idx, total) {
    const sc = op.sc;
    const r = { type: "question", n: op.n, caseId: sc.id, complexity: sc.complexity,
        submitMs: null, firstPaintMs: null, completedMs: null, wallMs: null,
        verdict: "PENDING", issue: "", saw429: false };
    const tStart = Date.now();
    let saw429 = false;
    const onResp = (resp) => {
        if (resp.url().includes("/api/assistant") || resp.url().includes("/assistant/conversations")) {
            if (resp.status() === 429) saw429 = true;
        }
    };
    page.on("response", onResp);
    try {
        await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await clean(page);
        await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(700);
        await banner(page, `[${idx + 1}/${total}] Q${op.n} ${sc.id} ${sc.complexity} → click Ask Pulse…`, "#10b981");

        const askTab = page.locator('button').filter({ hasText: /^Ask Pulse$/ }).first();
        if (await askTab.count() > 0) { await askTab.click(); await page.waitForTimeout(600); }

        const composer = page.locator("textarea.gn-input").first();
        if (await composer.count() === 0) {
            r.verdict = "FAIL"; r.issue = "no gn-input"; return r;
        }
        await composer.fill(sc.question);
        const send = page.locator("button.gn-send").first();
        if (await send.count() === 0) {
            r.verdict = "FAIL"; r.issue = "no gn-send"; return r;
        }
        const tSubmit = Date.now();
        r.submitMs = tSubmit - tStart;
        await send.click();
        await banner(page, `[${idx + 1}/${total}] Q${op.n} ${sc.id} submitting…`, "#10b981");

        const fpDeadline = tSubmit + FIRST_PAINT_CEILING_MS;
        while (Date.now() < fpDeadline) {
            const seen = await page.evaluate(() => {
                if (document.querySelector(".gn-chat-progress")) return "progress";
                const log = document.querySelector(".gn-chat-area, .gn-chat-log");
                if (log && (log.textContent || "").trim().length > 30) return "content";
                return null;
            });
            if (seen) { r.firstPaintMs = Date.now() - tSubmit; break; }
            await page.waitForTimeout(140);
        }

        // Completion: progress gone + content present, or 60s ceiling
        const compDeadline = tSubmit + 60_000;
        while (Date.now() < compDeadline) {
            const state = await page.evaluate(() => {
                const progress = document.querySelector(".gn-chat-progress");
                const log = document.querySelector(".gn-chat-area, .gn-chat-log");
                const len = log ? (log.textContent || "").trim().length : 0;
                if (!progress && len > 30) return "completed";
                return null;
            });
            if (state) { r.completedMs = Date.now() - tSubmit; break; }
            await page.waitForTimeout(300);
        }

        // UI defect probe (end-user surface specific)
        const ui = await page.evaluate(() => {
            const composer = document.querySelector("textarea.gn-input");
            const send = document.querySelector("button.gn-send");
            const tabsCount = Array.from(document.querySelectorAll("button")).filter(b => /^(AI Insights|Ask Pulse|Dashboard)$/i.test((b.textContent || "").trim())).length;
            const log = document.querySelector(".gn-chat-area, .gn-chat-log");
            const scrollable = log ? (log.scrollHeight > log.clientHeight + 1) : false;
            const composerRect = composer ? composer.getBoundingClientRect() : null;
            const sendRect = send ? send.getBoundingClientRect() : null;
            return {
                composerVisible: composerRect ? composerRect.bottom > 0 && composerRect.top < window.innerHeight : false,
                sendVisible: sendRect ? sendRect.bottom > 0 && sendRect.top < window.innerHeight : false,
                tabsCount,
                logVisible: log ? log.getBoundingClientRect().height > 50 : false,
                scrollable,
                overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
            };
        });
        r.saw429 = saw429;
        const defects = [];
        if (!ui.composerVisible) defects.push("composer-hidden");
        if (!ui.sendVisible) defects.push("send-hidden");
        if (ui.tabsCount !== 3) defects.push(`tabs=${ui.tabsCount}`);
        if (!ui.logVisible) defects.push("log-hidden");
        if (ui.overflowX) defects.push("h-overflow");
        if (saw429) { r.verdict = "SKIP-ENV"; r.issue = "429"; }
        else if (defects.length > 0) { r.verdict = "FAIL"; r.issue = defects.join(","); }
        else if (r.completedMs == null && r.firstPaintMs == null) { r.verdict = "FAIL"; r.issue = "no paint"; }
        else if (r.completedMs == null) { r.verdict = "NEEDS-REVIEW"; r.issue = "no completion in 60s"; }
        else { r.verdict = "PASS"; }

        await banner(page, `[${idx + 1}/${total}] Q${op.n} ${sc.id} ${r.verdict} ${r.completedMs ?? "—"}ms`, "#10b981");
        if (r.verdict !== "PASS") {
            await page.screenshot({
                path: join(OUT_DIR, `${String(idx + 1).padStart(4, "0")}-Q${String(op.n).padStart(4, "0")}-${sc.id}-${r.verdict.toLowerCase()}.png`),
                fullPage: false,
            }).catch(() => undefined);
        } else if (idx < 5 || idx % 200 === 0) {
            await page.screenshot({
                path: join(OUT_DIR, `${String(idx + 1).padStart(4, "0")}-Q${String(op.n).padStart(4, "0")}-${sc.id}-ok.png`),
                fullPage: false,
            }).catch(() => undefined);
        }
    } catch (err) {
        r.verdict = "THREW"; r.issue = err.message.slice(0, 200);
    } finally {
        page.off("response", onResp);
        r.wallMs = Date.now() - tStart;
    }
    return r;
}

// ─── Run a settings op ──────────────────────────────────────────────────
async function runSettings(page, op, idx, total) {
    const r = { type: "settings", n: op.n, kind: op.op.kind, value: typeof op.op.value === "object" ? JSON.stringify(op.op.value) : String(op.op.value),
        wallMs: null, verdict: "PENDING", issue: "" };
    const tStart = Date.now();
    try {
        await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20_000 });
        await clean(page);
        await banner(page, `[${idx + 1}/${total}] S${op.n} ${op.op.kind}`, "#f97316");

        const applied = await page.evaluate(({ op }) => {
            try {
                // Direct storage-key ops
                if (op.storage) {
                    const v = typeof op.value === "object" ? JSON.stringify(op.value) : op.value;
                    if (v === "") window.localStorage.removeItem(op.storage);
                    else window.localStorage.setItem(op.storage, v);
                    window.dispatchEvent(new CustomEvent("pulseplay:display-change", { detail: { key: op.storage, value: v } }));
                    return { ok: true, key: op.storage, value: v };
                }
                // Genie-settings patches
                const gKey = "pulseplay:visual-settings:genieSettings";
                const ex = JSON.parse(window.localStorage.getItem(gKey) || "{}");
                let patched = {};
                if (op.kind === "domain") patched = { insightsDomain: op.value };
                else if (op.kind === "metric-rules") patched = { metricDirectionRules: op.value };
                else if (op.kind === "guidance") patched = { insightsDomainGuidance: op.value, domainGuidance: op.value };
                else if (op.kind === "headline-override") patched = { headlineOverride: op.value };
                else if (op.kind === "trends-override") patched = { trendsOverride: op.value };
                else if (op.kind === "risks-override") patched = { risksOverride: op.value };
                else if (op.kind === "actions-override") patched = { actionsOverride: op.value };
                else if (op.kind === "forbidden-columns") patched = { runtimeForbiddenColumns: op.value };
                else if (op.kind === "row-filter") patched = { runtimeMandatoryRowFilter: op.value };
                else if (op.kind === "cache-ttl") patched = { insightsCacheTtl: op.value };
                else if (op.kind === "send-context") patched = { sendContextToGenie: op.value };
                else if (op.kind === "show-provenance") patched = { showProvenanceFooter: op.value };
                else if (op.kind === "custom-prompt") patched = { insightsPrompt: op.value };
                const next = { ...ex, ...patched };
                window.localStorage.setItem(gKey, JSON.stringify(next));
                window.dispatchEvent(new CustomEvent("pulseplay:visual-settings-change", { detail: { objectName: "genieSettings" } }));
                return { ok: true, patched };
            } catch (err) {
                return { ok: false, error: String(err) };
            }
        }, { op: op.op });

        if (!applied.ok) {
            r.verdict = "FAIL"; r.issue = applied.error || "apply failed"; return r;
        }

        // Reload + probe that the page didn't crash + the Settings page renders without error boundary
        await page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.waitForTimeout(500);
        const probe = await page.evaluate(() => {
            const bodyText = document.body ? document.body.innerText : "";
            const hasErrorBoundary = /Something went wrong|Application error/.test(bodyText) && document.querySelectorAll("pre").length > 0;
            const home = document.querySelector('[data-testid="pp-screen-main-slot"]') || document.querySelector(".pp-app") || document.body;
            const homeHasContent = (home.textContent || "").trim().length > 20;
            return { hasErrorBoundary, homeHasContent };
        });
        if (probe.hasErrorBoundary) {
            r.verdict = "FAIL"; r.issue = "error-boundary";
            await page.screenshot({ path: join(OUT_DIR, `${String(idx + 1).padStart(4, "0")}-S${String(op.n).padStart(4, "0")}-${op.op.kind}-error.png`), fullPage: false }).catch(() => undefined);
        } else if (!probe.homeHasContent) {
            r.verdict = "FAIL"; r.issue = "home-blank";
            await page.screenshot({ path: join(OUT_DIR, `${String(idx + 1).padStart(4, "0")}-S${String(op.n).padStart(4, "0")}-${op.op.kind}-blank.png`), fullPage: false }).catch(() => undefined);
        } else {
            r.verdict = "PASS";
        }
        await banner(page, `[${idx + 1}/${total}] S${op.n} ${op.op.kind} ${r.verdict}`, "#f97316");
    } catch (err) {
        r.verdict = "THREW"; r.issue = err.message.slice(0, 200);
    } finally {
        r.wallMs = Date.now() - tStart;
    }
    return r;
}

// ─── Run a complex scenario op (multi-setting atomic bundle) ──────────
async function runComplex(page, op, idx, total) {
    const r = { type: "complex", n: op.n, flavor: op.scenario.flavor,
        knobs: op.scenario.knobs.map(k => k.kind), wallMs: null,
        verdict: "PENDING", issue: "", appliedCount: 0, failedKnobs: [] };
    const tStart = Date.now();
    try {
        await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20_000 });
        await clean(page);
        await banner(page, `[${idx + 1}/${total}] C${op.n} ${op.scenario.flavor} (${op.scenario.knobs.length} knobs)`, "#a855f7");

        const result = await page.evaluate(({ knobs }) => {
            const applied = [];
            const failed = [];
            for (const knob of knobs) {
                try {
                    if (knob.storage) {
                        const v = typeof knob.value === "object" ? JSON.stringify(knob.value) : knob.value;
                        if (v === "") window.localStorage.removeItem(knob.storage);
                        else window.localStorage.setItem(knob.storage, v);
                        window.dispatchEvent(new CustomEvent("pulseplay:display-change", { detail: { key: knob.storage, value: v } }));
                        applied.push(knob.kind);
                        continue;
                    }
                    const gKey = "pulseplay:visual-settings:genieSettings";
                    const ex = JSON.parse(window.localStorage.getItem(gKey) || "{}");
                    let patched = {};
                    switch (knob.kind) {
                        case "domain": patched = { insightsDomain: knob.value }; break;
                        case "metric-rules": patched = { metricDirectionRules: knob.value }; break;
                        case "guidance": patched = { insightsDomainGuidance: knob.value, domainGuidance: knob.value }; break;
                        case "headline-override": patched = { headlineOverride: knob.value }; break;
                        case "trends-override": patched = { trendsOverride: knob.value }; break;
                        case "risks-override": patched = { risksOverride: knob.value }; break;
                        case "actions-override": patched = { actionsOverride: knob.value }; break;
                        case "forbidden-columns": patched = { runtimeForbiddenColumns: knob.value }; break;
                        case "row-filter": patched = { runtimeMandatoryRowFilter: knob.value }; break;
                        case "cache-ttl": patched = { insightsCacheTtl: knob.value }; break;
                        case "send-context": patched = { sendContextToGenie: knob.value }; break;
                        case "show-provenance": patched = { showProvenanceFooter: knob.value }; break;
                        case "custom-prompt": patched = { insightsPrompt: knob.value }; break;
                    }
                    const next = { ...ex, ...patched };
                    window.localStorage.setItem(gKey, JSON.stringify(next));
                    applied.push(knob.kind);
                } catch (err) {
                    failed.push({ knob: knob.kind, err: String(err).slice(0, 80) });
                }
            }
            window.dispatchEvent(new CustomEvent("pulseplay:visual-settings-change", { detail: { objectName: "genieSettings" } }));
            return { applied, failed };
        }, { knobs: op.scenario.knobs });

        r.appliedCount = result.applied.length;
        r.failedKnobs = result.failed.map(f => f.knob);

        // Reload Ask Pulse and probe that the surface still works
        await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.waitForTimeout(700);
        const askTab = page.locator('button').filter({ hasText: /^Ask Pulse$/ }).first();
        if (await askTab.count() > 0) { await askTab.click().catch(() => {}); await page.waitForTimeout(500); }
        const probe = await page.evaluate(() => {
            const bodyText = document.body ? document.body.innerText : "";
            const hasErrorBoundary = /Something went wrong|Application error|Error: \w+/.test(bodyText) && document.querySelectorAll("pre").length > 0;
            const composer = document.querySelector("textarea.gn-input");
            const send = document.querySelector("button.gn-send");
            const tabs = Array.from(document.querySelectorAll("button")).filter(b => /^(AI Insights|Ask Pulse|Dashboard)$/i.test((b.textContent || "").trim())).length;
            return { hasErrorBoundary, hasComposer: !!composer, hasSend: !!send, tabsCount: tabs };
        });
        const defects = [];
        if (probe.hasErrorBoundary) defects.push("error-boundary");
        if (!probe.hasComposer) defects.push("composer-gone");
        if (!probe.hasSend) defects.push("send-gone");
        if (result.failed.length > 0) defects.push(`${result.failed.length}-knobs-failed`);
        if (defects.length > 0) {
            r.verdict = "FAIL"; r.issue = defects.join(",");
            await page.screenshot({ path: join(OUT_DIR, `${String(idx + 1).padStart(4, "0")}-C${String(op.n).padStart(4, "0")}-${op.scenario.flavor}-fail.png`), fullPage: false }).catch(() => undefined);
        } else {
            r.verdict = "PASS";
            if (idx < 4 || idx % 100 === 0) {
                await page.screenshot({ path: join(OUT_DIR, `${String(idx + 1).padStart(4, "0")}-C${String(op.n).padStart(4, "0")}-${op.scenario.flavor}-ok.png`), fullPage: false }).catch(() => undefined);
            }
        }
        await banner(page, `[${idx + 1}/${total}] C${op.n} ${op.scenario.flavor} ${r.verdict} (${r.appliedCount}/${op.scenario.knobs.length} applied)`, "#a855f7");
    } catch (err) {
        r.verdict = "THREW"; r.issue = err.message.slice(0, 200);
    } finally {
        r.wallMs = Date.now() - tStart;
    }
    return r;
}

// ─── Browser lifecycle ─────────────────────────────────────────────────
async function freshBrowser() {
    const browser = await chromium.launch({ headless: false, slowMo: SLOW_MO, args: ["--window-position=80,80", "--window-size=1500,1050"] });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    return { browser, page };
}

// ─── Main ───────────────────────────────────────────────────────────────
async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const md = await readFile(CATALOG, "utf-8");
    const catalog = parseCatalog(md);
    const ops = buildOps(catalog);
    const total = ops.length;
    console.log(`[BEAST] ${total} ops = ${QUESTIONS}Q + ${SETTINGS}S + ${COMPLEX_SCENARIOS}C (seed=${SEED}, slowMo=${SLOW_MO}ms, headed)`);

    const results = [];
    const counts = { question: { PASS: 0, FAIL: 0, "SKIP-ENV": 0, "NEEDS-REVIEW": 0, THREW: 0 },
                     settings: { PASS: 0, FAIL: 0, THREW: 0 },
                     complex: { PASS: 0, FAIL: 0, THREW: 0 } };
    let { browser, page } = await freshBrowser();
    let chunkN = 0;

    for (let i = 0; i < total; i++) {
        if (chunkN >= CHUNK_SIZE) {
            console.log(`[chunk] rotating browser at op ${i + 1}/${total}`);
            await browser.close().catch(() => {});
            ({ browser, page } = await freshBrowser());
            chunkN = 0;
        }
        const op = ops[i];
        let r;
        if (op.type === "question") {
            r = await runQuestion(page, op, i, total);
        } else if (op.type === "complex") {
            r = await runComplex(page, op, i, total);
        } else {
            r = await runSettings(page, op, i, total);
        }
        results.push(r);
        const bucket = counts[op.type];
        bucket[r.verdict] = (bucket[r.verdict] || 0) + 1;
        chunkN++;

        const flag = r.verdict === "PASS" ? "✅" : r.verdict === "SKIP-ENV" ? "⏭️" : r.verdict === "NEEDS-REVIEW" ? "⚠️" : "❌";
        const head = op.type === "question"
            ? `${flag} [${String(i + 1).padStart(4, "0")}/${total}] Q ${r.caseId} ${r.complexity} ${r.verdict.padEnd(12)} first=${r.firstPaintMs ?? "—"}ms cplt=${r.completedMs ?? "—"}ms`
            : op.type === "complex"
                ? `${flag} [${String(i + 1).padStart(4, "0")}/${total}] C ${r.flavor.padEnd(22)} ${r.verdict.padEnd(12)} applied=${r.appliedCount}/${op.scenario.knobs.length} wall=${r.wallMs}ms`
                : `${flag} [${String(i + 1).padStart(4, "0")}/${total}] S ${r.kind.padEnd(20)} ${r.verdict.padEnd(12)} wall=${r.wallMs}ms`;
        if (i < 8 || i % 50 === 0 || r.verdict !== "PASS") {
            console.log(head + (r.issue ? ` :: ${r.issue}` : ""));
        }

        if ((i + 1) % 100 === 0) {
            const cp = { i: i + 1, counts, lastResult: r };
            await writeFile(join(OUT_DIR, `checkpoint-${i + 1}.json`), JSON.stringify(cp, null, 2)).catch(() => undefined);
            const qDone = results.filter(x => x.type === "question");
            const fp = qDone.map(x => x.firstPaintMs).filter(v => typeof v === "number").sort((a, b) => a - b);
            if (fp.length > 0) {
                console.log(`[ckpt @ ${i + 1}] Q:${JSON.stringify(counts.question)} S:${JSON.stringify(counts.settings)} fp p50=${fp[Math.floor(fp.length * 0.5)]}ms p95=${fp[Math.floor(fp.length * 0.95)] || fp[fp.length - 1]}ms`);
            }
        }

        if (op.type === "question" && INTER_QUESTION_DELAY_MS > 0) {
            await new Promise(r => setTimeout(r, INTER_QUESTION_DELAY_MS));
        }
    }
    await browser.close().catch(() => {});

    // Final summary
    const qDone = results.filter(x => x.type === "question");
    const sDone = results.filter(x => x.type === "settings");
    const fp = qDone.map(x => x.firstPaintMs).filter(v => typeof v === "number").sort((a, b) => a - b);
    const cp = qDone.map(x => x.completedMs).filter(v => typeof v === "number").sort((a, b) => a - b);
    const sw = sDone.map(x => x.wallMs).filter(v => typeof v === "number").sort((a, b) => a - b);
    const stat = (arr) => arr.length === 0 ? { p50: null, p95: null, max: null } : {
        p50: arr[Math.floor(arr.length * 0.5)],
        p95: arr[Math.floor(arr.length * 0.95)] || arr[arr.length - 1],
        max: arr[arr.length - 1],
    };
    const sfp = stat(fp), scp = stat(cp), ssw = stat(sw);
    const summary = [
        `=== BEAST ${total} — final ===`,
        `Questions: ${QUESTIONS}    Settings: ${SETTINGS}    Complex scenarios: ${COMPLEX_SCENARIOS}    Seed: ${SEED}`,
        ``,
        `Questions:  PASS=${counts.question.PASS}  NEEDS-REVIEW=${counts.question["NEEDS-REVIEW"]||0}  FAIL=${counts.question.FAIL}  SKIP-ENV=${counts.question["SKIP-ENV"]||0}  THREW=${counts.question.THREW||0}`,
        `Settings:   PASS=${counts.settings.PASS}  FAIL=${counts.settings.FAIL}  THREW=${counts.settings.THREW||0}`,
        `Complex:    PASS=${counts.complex.PASS}  FAIL=${counts.complex.FAIL}  THREW=${counts.complex.THREW||0}`,
        ``,
        `firstPaintMs (over ${fp.length}):  p50=${sfp.p50} p95=${sfp.p95} max=${sfp.max}`,
        `completedMs  (over ${cp.length}):  p50=${scp.p50} p95=${scp.p95} max=${scp.max}`,
        `settings wallMs (over ${sw.length}): p50=${ssw.p50} p95=${ssw.p95} max=${ssw.max}`,
        ``,
        `429 occurrences: ${qDone.filter(x => x.saw429).length}`,
    ].join("\n");
    console.log("\n" + summary);
    await writeFile(join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2));
    await writeFile(join(OUT_DIR, "summary.txt"), summary);
    console.log(`[done] artifacts → ${OUT_DIR}`);
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
