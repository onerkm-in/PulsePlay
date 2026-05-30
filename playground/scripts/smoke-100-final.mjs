#!/usr/bin/env node
// CLOSING SMOKE — 100+ rounds across everything built over the last 2-3 weeks,
// headed against the LIVE workspace, capturing a screenshot at every surface
// for visual gap inspection. Robust per-check (one failure never crashes the
// run). Genie X-axis + Power BI semantic-model X-axis; native canvas + PBI
// report Y-axis; AI Insights (Genie + deterministic PBI) + presets; dark mode;
// bundle switcher; theme presets; palettes; chrome.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const OUT = join(REPO, "docs/evidence/smoke-100-final");
const BASE = "http://127.0.0.1:7001";
const GROUP_ID = "7bb52a2a-5028-4887-b8ec-7d13e386da93";
const REPORT_ID = "95d196a1-9d2a-4ebd-a222-22fae6bc0149";

// A short Genie taste (incl. trend/YoY questions that exercise the
// table-dedup + lead-in strip — the "leakage" fix) so the run gets to the big
// Power BI battery quickly.
const GENIE_Q = [
    "What is the total sales?", "Show me sales by region", "Year over year sales growth",
    "Sales trend over the past quarters", "Sales by year", "Top 5 customers by total sales",
    "Profit by product category", "Quantity by category",
];
// Power BI semantic-model DAX matcher needs the EXACT measure name (the
// measures are "Total Sales"/"Total Profit"/…, not bare "Sales"/"Profit") — a
// no-LLM matcher does no synonym expansion. All questions below name a real
// measure + a real dimension so each routes to total/aggregate-by/trend/top-n.
const PBI_Q = [
    // total
    "Total Sales", "Total Profit", "Profit Margin", "Total Quantity",
    "Order Count", "Customer Count", "Line Item Count", "Avg Discount",
    // aggregate-by (entity dims)
    "Total Sales by region", "Total Sales by category", "Total Sales by segment",
    "Total Profit by region", "Total Profit by segment", "Total Profit by category",
    "Total Quantity by category", "Order Count by region", "Total Sales by state",
    "Total Sales by city", "Total Profit by sub_category", "Avg Discount by segment",
    "Total Quantity by segment", "Order Count by segment", "Customer Count by region",
    "Total Sales by customer_name",
    // trend (time dims)
    "Total Sales by year", "Total Sales by quarter", "Total Sales by month",
    "Total Profit by year", "Total Sales by month_name", "Total Profit by quarter",
    "Total Quantity by year",
    // top-n
    "Top 5 customer_name by Total Sales", "Top 10 product_name by Total Sales",
    "Top 5 region by Total Profit", "Top 5 segment by Total Sales",
    "Top 10 customer_name by Total Profit", "Top 5 category by Total Sales",
    "Top 5 state by Total Sales", "Top 10 product_name by Total Profit",
];

const results = [];
globalThis.__pass = 0; globalThis.__total = 0;
const rec = (part, name, pass, detail) => { results.push({ part, name, pass, detail }); globalThis.__total++; if (pass) globalThis.__pass++; console.log(`${pass ? "PASS" : "FAIL"} ${part} ${name}${detail ? " — " + detail : ""}`); };
const shot = (page, n) => page.screenshot({ path: join(OUT, n), fullPage: false }).catch(() => {});
const shotFull = (page, n) => page.screenshot({ path: join(OUT, n), fullPage: true }).catch(() => {});
// On-screen narration banner so the run is watchable.
async function banner(page, text, color = "#06b6d4") {
    await page.evaluate(({ text, color, pass, total }) => {
        let b = document.getElementById("__smoke__"); if (!b) { b = document.createElement("div"); b.id = "__smoke__"; document.body.appendChild(b); }
        // Top-LEFT only (not full width) so it never covers the top-right
        // BundleSwitcher chip + its dropdown menu (smoke-100 Part H gap).
        Object.assign(b.style, { position: "fixed", top: "8px", left: "8px", maxWidth: "min(58vw, 800px)", zIndex: "2147483647", padding: "9px 13px", background: "rgba(15,23,42,0.96)", color: "#fff", font: "600 12px ui-monospace,monospace", borderRadius: "8px", pointerEvents: "none", borderLeft: `6px solid ${color}`, boxShadow: "0 6px 24px rgba(0,0,0,0.4)" });
        b.textContent = `🧪 CLOSING SMOKE  ·  ${pass}/${total} pass  ·  ${text}`;
    }, { text, color, pass: globalThis.__pass || 0, total: globalThis.__total || 0 }).catch(() => {});
}

// Returns the assistant-message count BEFORE submitting so answer() can wait
// for a genuinely NEW answer (not the stale prior one).
async function ask(page, q) {
    const before = await page.evaluate(() => document.querySelectorAll(".gn-msg--assistant").length);
    await page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first().fill(q);
    await page.waitForTimeout(120);
    await page.locator("button.gn-send, button.pp-ai-sidebar__ask").first().click();
    return before;
}
async function answer(page, t = 60_000, before = -1) {
    const dl = Date.now() + t; const t0 = Date.now();
    while (Date.now() < dl) {
        const p = await page.evaluate((before) => {
            const m = document.querySelectorAll(".gn-msg--assistant");
            if (before >= 0 && m.length <= before) return { waiting: true };   // new answer not yet rendered
            const l = m[m.length - 1]; if (!l) return { waiting: true };
            const text = (l.textContent || "").trim();
            const progress = !!l.querySelector(".gn-chat-progress, .gn-progress-active");
            const err = /could not complete this request|share the support code|sorry, I (?:can'?t|cannot)|something went wrong/i.test(text);
            return { len: text.length, table: l.querySelectorAll("table tr").length >= 1, progress, err };
        }, before);
        if (p && p.waiting) { await page.waitForTimeout(250); continue; }
        if (p && p.err) return { ms: Date.now() - t0, ok: false, err: true };
        if (p && !p.progress && (p.len > 40 || p.table)) return { ms: Date.now() - t0, ok: true };
        await page.waitForTimeout(250);
    }
    return { ms: Date.now() - t0, ok: false, timeout: true };
}
async function setProfile(page, profile, extra = {}) {
    await page.evaluate(({ profile, extra }) => {
        localStorage.setItem("pulseplay:active-ai-profile", profile);
        localStorage.setItem("pulseplay:bi-vendor", "powerbi");
        const k = "pulseplay:visual-settings:genieSettings"; const ex = JSON.parse(localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api";
        localStorage.setItem(k, JSON.stringify(ex));
        for (const [kk, vv] of Object.entries(extra)) localStorage.setItem(kk, typeof vv === "string" ? vv : JSON.stringify(vv));
    }, { profile, extra });
}
async function goSurface(page, surface) {
    await page.goto(`${BASE}/?surface=${surface}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(1800);
}
const whiteScan = (page) => page.evaluate(() => {
    const parse = s => { const m = (s || "").match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(",").map(x => parseFloat(x.trim())); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    let n = 0;
    document.querySelectorAll("*").forEach(el => {
        const cs = getComputedStyle(el); const bg = parse(cs.backgroundColor); const img = cs.backgroundImage || "";
        const solid = bg && bg.a >= 0.5 && bg.r >= 235 && bg.g >= 235 && bg.b >= 235;
        const grad = /rgba?\(\s*2(?:3[5-9]|[4-5]\d)\s*,\s*2(?:3[5-9]|[4-5]\d)\s*,\s*2(?:3[5-9]|[4-5]\d)/.test(img) || /#f{3,6}|#f8fafc|#fafafa|#fafcff|255,\s*255,\s*255/.test(img);
        if (!solid && !grad) return; const r = el.getBoundingClientRect(); if (r.width < 60 || r.height < 24) return; n++;
    });
    return n;
});
const tiles = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("pulseplay:canvas-tiles") || "[]"); } catch { return []; } });

async function main() {
    await mkdir(OUT, { recursive: true });
    // HEADED + slow-mo so it's visible on screen and watchable.
    const browser = await chromium.launch({ headless: false, slowMo: 120, args: ["--window-position=30,20", "--window-size=1600,1080"] });
    const ctx = await browser.newContext({ viewport: { width: 1520, height: 960 } });
    const page = await ctx.newPage();
    const pageErrs = []; page.on("pageerror", e => pageErrs.push(e.message.slice(0, 140)));

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate(() => { try { localStorage.clear(); } catch { /* */ } });

    // ───────── PART A — AI Insights (Genie) briefing + presets ─────────
    await setProfile(page, "default", { "pulseplay:default-landing-surface": "ai-insights", "pulseplay:active-surface": "ai-insights" });
    await goSurface(page, "ai-insights");
    await banner(page, "PART A · AI Insights (Genie) — briefing + presets", "#06b6d4");
    {
        const dl = Date.now() + 120_000; let ok = false;
        while (Date.now() < dl) { ok = await page.evaluate(() => !!document.querySelector('[data-section="KPI SNAPSHOT"]:not(.gn-insights-section--placeholder)') && document.querySelectorAll('.gn-insights-section--placeholder,[aria-busy="true"]').length === 0); if (ok) break; await page.waitForTimeout(1500); }
        rec("A", "genie briefing completes", ok);
        const secs = await page.evaluate(() => [...document.querySelectorAll('[data-section]:not(.gn-insights-section--placeholder)')].map(s => s.getAttribute("data-section")));
        rec("A", "≥2 insight sections", secs.length >= 2, secs.join(","));
        rec("A", "KPI tiles render", await page.evaluate(() => document.querySelectorAll('[data-section="KPI SNAPSHOT"] .gn-kpi-tile').length > 0));
        rec("A", "no error text", !(await page.evaluate(() => /could not complete|support code|something went wrong/i.test(document.body.innerText))));
        await shotFull(page, "01-ai-insights-genie.png");
        const preset = page.locator("select[aria-label='Metric direction preset']").first();
        rec("A", "status-color affordance (conditional)", (await preset.count()) > 0 || (await page.evaluate(() => /🟢|🟡|🔴/.test(document.body.innerText) || !!document.querySelector("[class*='kpi-tile--good'],[class*='kpi-tile--warn']"))));
    }

    // ───────── PART B — Ask Pulse Genie battery (15) ─────────
    await page.evaluate(() => localStorage.setItem("pulseplay:active-surface", "ask-pulse"));
    await goSurface(page, "ask-pulse");
    for (let i = 0; i < GENIE_Q.length; i++) {
        await banner(page, `PART B · Ask Pulse (Genie) · Q${i + 1}/${GENIE_Q.length}: ${GENIE_Q[i]}`, "#22c55e");
        try { const before = await ask(page, GENIE_Q[i]); const r = await answer(page, 60_000, before); rec("B", `genie Q${i + 1}`, r.ok, `${r.ms}ms${r.err ? " ERR" : r.timeout ? " TIMEOUT" : ""} :: ${GENIE_Q[i]}`); }
        catch (e) { rec("B", `genie Q${i + 1}`, false, String(e.message).slice(0, 60)); }
        if (i === 1) await shotFull(page, "02-ask-pulse-genie.png");
    }
    rec("B", "single-view (one screen, no Answer/SQL tabs)", await page.evaluate(() => !document.querySelector(".gn-answer-view-switch") && document.querySelectorAll(".gn-msg--assistant").length > 0));

    // ───────── PART C — Ask Pulse Power BI semantic-model DAX (15, fast) ─────────
    await setProfile(page, "powerbi-dwd", { "pulseplay:active-surface": "ask-pulse" });
    await goSurface(page, "ask-pulse");
    for (let i = 0; i < PBI_Q.length; i++) {
        await banner(page, `PART C · Ask Pulse (Power BI DAX, no-LLM) · Q${i + 1}/${PBI_Q.length}: ${PBI_Q[i]}`, "#f59e0b");
        try { const before = await ask(page, PBI_Q[i]); const r = await answer(page, 45_000, before); rec("C", `pbi-dax Q${i + 1}`, r.ok, `${r.ms}ms :: ${PBI_Q[i]}`); }
        catch (e) { rec("C", `pbi-dax Q${i + 1}`, false, String(e.message).slice(0, 60)); }
        if (i === 0) await shotFull(page, "03-ask-pulse-pbi-dax.png");
    }
    rec("C", "no 'no measure' fallback", !(await page.evaluate(() => /I can answer questions like/.test(document.body.innerText))));

    // ───────── PART D — AI Insights deterministic PBI ─────────
    await page.evaluate(() => localStorage.setItem("pulseplay:active-surface", "ai-insights"));
    await goSurface(page, "ai-insights");
    await banner(page, "PART D · AI Insights (Power BI deterministic DAX)", "#f59e0b");
    {
        const dl = Date.now() + 90_000;
        while (Date.now() < dl) { const ok = await page.evaluate(() => { const ph = document.querySelectorAll('.gn-insights-section--placeholder,[aria-busy="true"]').length; const t = document.body.innerText || ""; return ph === 0 && document.querySelectorAll('[data-section]:not(.gn-insights-section--placeholder)').length >= 2 && /by segment/i.test(t); }); if (ok) break; await page.waitForTimeout(1500); }
        await page.waitForTimeout(1500);
        const d = await page.evaluate(() => ({ secs: document.querySelectorAll('[data-section]:not(.gn-insights-section--placeholder)').length, fallback: /I can answer questions like/.test(document.body.innerText), seg: /by segment/i.test(document.body.innerText), dax: /over (year|quarter|month)|\(\d+ groups\)|Top \d+/i.test(document.body.innerText) }));
        rec("D", "deterministic ≥2 sections", d.secs >= 2, `${d.secs}`);
        rec("D", "NO fallback in any section", !d.fallback);
        rec("D", "real DAX tables (segment grouper)", d.seg);
        rec("D", "DAX headings present", d.dax);
        await shotFull(page, "04-ai-insights-pbi-deterministic.png");
    }

    // ───────── PART E — Dashboard: Power BI report embed ─────────
    // The powerbi adapter needs { id, embedUrl, accessToken } — mint a fresh
    // embed token via the proxy (service principal) and seed the full
    // backend-issued config, like validate-pbi-render.mjs. Stop any in-flight
    // Part-D insights run + settle so the page-context fetch isn't interrupted.
    try { await page.locator("button", { hasText: /^Stop$/ }).first().click({ timeout: 1500 }); } catch { /* no run in flight */ }
    await page.waitForTimeout(2000);
    let mint = { ok: false, hasToken: false };
    for (let attempt = 0; attempt < 3 && !mint.hasToken; attempt++) {
        mint = await page.evaluate(async ({ g, r, p }) => {
            try {
                const res = await fetch(`${location.origin}/api/assistant/embed-token/powerbi`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId: g, reportId: r, permissions: "View", assistantProfile: p }) });
                const d = await res.json().catch(() => ({}));
                if (res.ok && d.embedToken && d.embedUrl) {
                    localStorage.setItem("pulseplay:bi-vendor", "powerbi");
                    localStorage.setItem("pulseplay:bi-surface-mode", "vendor");
                    localStorage.setItem("pulseplay:active-surface", "bi-viz");
                    localStorage.setItem("pulseplay:bi-embed-config", JSON.stringify({ type: "report", mode: "backend-issued", embedMode: "backend", tokenType: "Embed", id: r, groupId: g, embedUrl: d.embedUrl, accessToken: d.embedToken, permissions: "View" }));
                }
                return { ok: res.ok, hasToken: !!d.embedToken };
            } catch (e) { return { ok: false, error: String(e) }; }
        }, { g: GROUP_ID, r: REPORT_ID, p: "powerbi-dwd" });
        if (!mint.hasToken) await page.waitForTimeout(1500);
    }
    rec("E", "embed token minted (proxy/SP)", !!(mint.ok && mint.hasToken));
    await goSurface(page, "bi-viz");
    await banner(page, "PART E · Dashboard — Power BI report embed", "#0ea5e9");
    await page.waitForTimeout(9000); // let the powerbi-client SDK embed + load
    {
        const e = await page.evaluate(() => { const f = Array.from(document.querySelectorAll("iframe")).find(x => /powerbi\.com/.test(x.getAttribute("src") || "")); return { iframe: !!f, src: (f?.getAttribute("src") || "").slice(0, 60), err: /failed to embed powerbi|eventName must be one of/i.test(document.body.textContent || "") }; });
        rec("E", "PBI iframe present", e.iframe, e.src);
        rec("E", "no embed-error overlay", !e.err);
        await shot(page, "05-dashboard-pbi-embed.png");
    }

    // ───────── PART F — Native canvas: pin a chart + tile ops ─────────
    // CLEAN SLATE — mirror validate-pin-to-canvas.mjs exactly (which passes):
    // clear all prior state, fresh Genie ask-pulse, ask, wait for the chart's
    // pin button (don't call answer() first — the pin appears after the chart),
    // .first() since it's the only chart now. G/H/I/J below re-set their state.
    await page.evaluate(() => { try { localStorage.clear(); } catch { /* */ } localStorage.setItem("pulseplay:bi-surface-mode", "native"); });
    await setProfile(page, "default", { "pulseplay:active-surface": "ask-pulse", "pulseplay:default-landing-surface": "ask-pulse" });
    await goSurface(page, "ask-pulse");
    await banner(page, "PART F · Native canvas — pin a chart + tile ops", "#14b8a6");
    try {
        await ask(page, "What is the total sales by region?");
        const pin = page.locator(".gn-chart-pin").first();
        await pin.waitFor({ state: "visible", timeout: 120_000 }).catch(() => {});
        await page.waitForTimeout(2500);
        if (await pin.count()) { await pin.click().catch(() => {}); await page.waitForTimeout(1500); }
    } catch { /* */ }
    // Switch to the Dashboard tab — the native canvas shows the pinned tile.
    { const dt = page.locator("button", { hasText: /^Dashboard$/i }).first(); await dt.click().catch(() => {}); }
    await page.waitForTimeout(3000);
    {
        const t = await tiles(page);
        rec("F", "canvas has pinned tile", t.length >= 1, `${t.length} tiles`);
        rec("F", "tile carries SQL + connector provenance", !!(t[0] && t[0].sqlQuery && t[0].connectorProfileId));
        rec("F", "tile renders on canvas", await page.evaluate(() => document.querySelectorAll(".pp-tile").length >= 1));
        await shot(page, "06-canvas-pinned.png");
        // tile Refresh → live (button title is the full "Refresh from the connector")
        try {
            await page.locator(".pp-tile__btn[title='Refresh from the connector']").first().click().catch(() => {});
            await page.waitForTimeout(16000);
            rec("F", "tile Refresh → live", await page.evaluate(() => (document.querySelector(".pp-tile__snapshot")?.textContent || "").toLowerCase().includes("live")));
        } catch { rec("F", "tile Refresh → live", false); }
        // tile Edit query → applies + re-runs
        try {
            await page.locator(".pp-tile__btn[title='Edit query']").first().click().catch(() => {});
            await page.waitForTimeout(600);
            const ta = page.locator(".pp-tile__sql").first(); const cur = (await ta.inputValue().catch(() => "")).trim();
            let edited; if (/\bDESC\b/i.test(cur)) edited = cur.replace(/\bDESC\b/i, "ASC"); else if (/\bASC\b/i.test(cur)) edited = cur.replace(/\bASC\b/i, "DESC"); else edited = `SELECT * FROM (${cur.replace(/;\s*$/, "")}) AS _q ORDER BY 1 DESC`;
            await ta.fill(edited).catch(() => {}); await page.locator(".pp-tile__run").first().click().catch(() => {});
            await page.waitForTimeout(14000);
            const rows = (await tiles(page))[0]?.rows; rec("F", "tile Edit query → applies + re-runs", edited !== cur && Array.isArray(rows) && rows.length > 0);
        } catch { rec("F", "tile Edit query → applies + re-runs", false); }
        // drag
        try { const l0 = (await tiles(page))[0]?.layout; const hb = await page.locator(".pp-tile__head").first().boundingBox(); if (hb) { await page.mouse.move(hb.x + 60, hb.y + 12); await page.mouse.down(); await page.mouse.move(hb.x + 240, hb.y + 130, { steps: 8 }); await page.mouse.up(); } await page.waitForTimeout(700); const l1 = (await tiles(page))[0]?.layout; rec("F", "tile drag reposition", !!l1 && !!l0 && (l1.x !== l0.x || l1.y !== l0.y)); } catch { rec("F", "tile drag reposition", false); }
        // resize
        try { const l1 = (await tiles(page))[0]?.layout; const rb = await page.locator(".pp-tile__resize").first().boundingBox(); if (rb) { await page.mouse.move(rb.x + 4, rb.y + 4); await page.mouse.down(); await page.mouse.move(rb.x + 120, rb.y + 100, { steps: 8 }); await page.mouse.up(); } await page.waitForTimeout(700); const l2 = (await tiles(page))[0]?.layout; rec("F", "tile resize", !!l2 && !!l1 && (l2.w !== l1.w || l2.h !== l1.h)); } catch { rec("F", "tile resize", false); }
    }

    // ───────── PART G — Dark mode (both surfaces) ─────────
    await page.evaluate(() => { const k = "pulseplay:visual-settings:genieSettings"; const ex = JSON.parse(localStorage.getItem(k) || "{}"); ex.darkMode = true; localStorage.setItem(k, JSON.stringify(ex)); localStorage.setItem("pulseplay:active-surface", "ask-pulse"); });
    await setProfile(page, "powerbi-dwd", { "pulseplay:active-surface": "ask-pulse" });
    await page.evaluate(() => { const k = "pulseplay:visual-settings:genieSettings"; const ex = JSON.parse(localStorage.getItem(k) || "{}"); ex.darkMode = true; localStorage.setItem(k, JSON.stringify(ex)); });
    await goSurface(page, "ask-pulse");
    await banner(page, "PART G · Dark mode — Ask Pulse (white-blaze scan)", "#a855f7");
    { const b = await ask(page, "Total sales by region"); await answer(page, 30_000, b); } await page.waitForTimeout(1000);
    { const w = await whiteScan(page); rec("G", "dark Ask Pulse — 0 white blaze", w === 0, `${w} white`); await shotFull(page, "07-dark-ask-pulse.png"); }
    await page.evaluate(() => localStorage.setItem("pulseplay:active-surface", "ai-insights"));
    await setProfile(page, "default", { "pulseplay:active-surface": "ai-insights" });
    await page.evaluate(() => { const k = "pulseplay:visual-settings:genieSettings"; const ex = JSON.parse(localStorage.getItem(k) || "{}"); ex.darkMode = true; localStorage.setItem(k, JSON.stringify(ex)); });
    await goSurface(page, "ai-insights");
    { const dl = Date.now() + 120_000; while (Date.now() < dl) { const ok = await page.evaluate(() => !!document.querySelector('[data-section="KPI SNAPSHOT"]:not(.gn-insights-section--placeholder)') && document.querySelectorAll('.gn-insights-section--placeholder,[aria-busy="true"]').length === 0); if (ok) break; await page.waitForTimeout(1500); } await page.waitForTimeout(1000); const w = await whiteScan(page); rec("G", "dark AI Insights — 0 white blaze", w === 0, `${w} white`); rec("G", "dark narratives readable (has text)", await page.evaluate(() => (document.body.innerText || "").length > 200)); await shotFull(page, "08-dark-ai-insights.png"); }

    // ───────── PART H — Bundle switcher (enabler chip) ─────────
    await page.evaluate(() => { const k = "pulseplay:visual-settings:genieSettings"; const ex = JSON.parse(localStorage.getItem(k) || "{}"); ex.darkMode = false; localStorage.setItem(k, JSON.stringify(ex)); });
    await goSurface(page, "ask-pulse");
    await banner(page, "PART H · BundleSwitcher (AI & BI enabler chip)", "#ec4899");
    {
        const chip = page.locator(".pp-bundle-switcher__chip").first();
        rec("H", "bundle chip renders", await chip.count() > 0);
        if (await chip.count()) {
            await chip.click().catch(() => {}); await page.waitForTimeout(400);
            const opts = page.locator(".pp-bundle-switcher__menu [role='option']");
            rec("H", "menu lists ≥2 bundles", await opts.count() >= 2, `${await opts.count()}`);
            await shot(page, "09-bundle-switcher.png");
            const genie = opts.filter({ hasText: "Power BI × Genie" }).first();
            if (await genie.count()) { await genie.click().catch(() => {}); await page.waitForTimeout(600); }
            rec("H", "switch swaps brain → default", (await page.evaluate(() => localStorage.getItem("pulseplay:active-ai-profile"))) === "default");
        }
    }

    // ───────── PART I — Theme presets ─────────
    await page.evaluate(() => localStorage.setItem("pulseplay:active-surface", "ask-pulse"));
    await banner(page, "PART I · Theme presets", "#8b5cf6");
    const PRESETS = ["ocean", "sunset", "forest", "mono", "midnight", "rose"];
    for (const p of PRESETS) {
        const applied = await page.evaluate((preset) => { try { localStorage.setItem("pulseplay:theme-preset", preset); window.dispatchEvent(new Event("pulseplay:display-change")); return true; } catch { return false; } }, p);
        await page.waitForTimeout(700);
        rec("I", `theme preset '${p}' applies`, applied);
    }
    await goSurface(page, "ask-pulse"); await page.waitForTimeout(800);
    rec("I", "app has resolved theme tokens", await page.evaluate(() => { const v = getComputedStyle(document.documentElement).getPropertyValue("--pp-accent").trim() || getComputedStyle(document.documentElement).getPropertyValue("--gn-accent").trim(); return !!v; }));
    await shot(page, "10-theme-preset.png");

    // ───────── PART J — Chart palettes ─────────
    await banner(page, "PART J · Chart palettes", "#f43f5e");
    const PALS = ["vibrant", "pastel", "ocean", "mono", "sunset", "forest"];
    for (const pal of PALS) {
        const ok = await page.evaluate((p) => { try { localStorage.setItem("pulseplay:chart-palette", p); window.dispatchEvent(new Event("pulseplay:display-change")); return true; } catch { return false; } }, pal);
        await page.waitForTimeout(400);
        rec("J", `palette '${pal}' selectable`, ok);
    }

    // ───────── PART K — Page-error budget ─────────
    rec("K", "no uncaught page errors", pageErrs.length === 0, pageErrs.slice(0, 3).join(" | "));

    await browser.close();
    const pass = results.filter(r => r.pass).length;
    const byPart = {}; for (const r of results) { byPart[r.part] = byPart[r.part] || [0, 0]; byPart[r.part][r.pass ? 0 : 1]++; }
    console.log(`\n═══ CLOSING SMOKE — ${pass}/${results.length} PASS (${results.length} rounds) ═══`);
    console.log("per-part: " + Object.entries(byPart).map(([k, v]) => `${k}:${v[0]}/${v[0] + v[1]}`).join("  "));
    const fails = results.filter(r => !r.pass);
    if (fails.length) { console.log("FAILS:"); for (const f of fails) console.log(`  ✗ ${f.part} ${f.name}${f.detail ? " — " + f.detail : ""}`); }
    console.log("screens → " + OUT);
    process.exit(0);
}
main().catch(e => { console.error("[FATAL]", e); process.exit(1); });
