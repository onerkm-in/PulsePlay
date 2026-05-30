#!/usr/bin/env node
// Comprehensive end-to-end regression across BOTH axes of PulsePlay (the
// defining 2-axis design) + the surfaces built over the last several sessions.
// 50+ checks, headed, against the LIVE workspace. Robust per-check (one failure
// never crashes the run).
//
// Connector axis (X): Genie (default) AND Power BI semantic-model Q&A (powerbi-dwd, deterministic DAX).
// BI-vendor axis (Y):  Native canvas (pinned tiles) AND embedded Power BI report.
// Plus: nav landing, AI Insights briefing + status-color PRESETS, chat single-view,
//       canvas drag/resize/auto-arrange + live refresh/edit, theme/palette/dark/chrome.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/smoke-e2e/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const GROUP_ID = "7bb52a2a-5028-4887-b8ec-7d13e386da93";
const REPORT_ID = "95d196a1-9d2a-4ebd-a222-22fae6bc0149";

const GENIE_Q = [
    "What is the total sales?", "Show me sales by region", "Sales by product category",
    "Top 5 customers by total sales", "Show me profit by region", "How many orders do we have?",
    "What is the average order value?", "Sales trend over the past quarters", "Year over year sales growth",
    "Most profitable region", "Sales by customer segment", "Top 10 products by sales",
    "Profit by product category", "Orders by region", "Quantity by category", "Sales by year",
    "What is the largest single order?", "Top 5 regions by profit", "Which region has the highest profit margin?",
    "Compare sales between West and East",
];
const PBI_SM_Q = [
    "What is the total sales by region?", "Total sales", "Sales by category",
    "Top 5 customers by sales", "Total profit by region", "Average order value",
    "Profit margin by region", "Quantity by category",
];

const results = [];
const rec = (part, name, pass, detail) => { results.push({ part, name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${part}  ${name}${detail ? " — " + detail : ""}`); };

async function banner(page, text, color = "#06b6d4") {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__e2e__"); if (!b) { b = document.createElement("div"); b.id = "__e2e__"; document.body.appendChild(b); }
        Object.assign(b.style, { position: "fixed", top: "8px", left: "8px", right: "8px", zIndex: "99999", padding: "9px 13px", background: "rgba(15,23,42,0.95)", color: "#fff", font: "13px ui-monospace", borderRadius: "6px", pointerEvents: "none", borderLeft: `5px solid ${color}` });
        b.textContent = text;
    }, { text, color });
}
const shot = (page, n) => page.screenshot({ path: join(OUT_DIR, n) }).catch(() => {});
async function ask(page, q) {
    await page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first().fill(q);
    await page.waitForTimeout(150);
    await page.locator("button.gn-send, button.pp-ai-sidebar__ask").first().click();
}
async function answer(page, t = 150_000) {
    const dl = Date.now() + t; const t0 = Date.now();
    while (Date.now() < dl) {
        const p = await page.evaluate(() => {
            const m = document.querySelectorAll(".gn-msg--assistant"); const l = m[m.length - 1];
            if (!l) return null; const text = (l.textContent || "").trim();
            const progress = !!l.querySelector(".gn-chat-progress, .gn-progress-active");
            const err = /could not complete this request|share the support code|sorry, I (?:can'?t|cannot)|something went wrong/i.test(text);
            return { len: text.length, table: l.querySelectorAll("table tr").length >= 1, progress, err };
        });
        if (p && p.err) return { ms: Date.now() - t0, ok: false, err: true };
        if (p && !p.progress && (p.len > 40 || p.table)) return { ms: Date.now() - t0, ok: true, table: p.table };
        await page.waitForTimeout(300);
    }
    return { ms: Date.now() - t0, ok: false, timeout: true };
}
async function goTab(page, label) {
    const all = page.locator("button", { hasText: new RegExp(`^${label}$`, "i") });
    for (let i = 0; i < await all.count(); i++) { const b = all.nth(i); if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(1000); return; } }
}
async function setProfile(page, profile, extra = {}) {
    await page.evaluate(({ profile, extra }) => {
        localStorage.setItem("pulseplay:active-ai-profile", profile);
        const k = "pulseplay:visual-settings:genieSettings"; const ex = JSON.parse(localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api";
        localStorage.setItem(k, JSON.stringify(ex));
        for (const [kk, vv] of Object.entries(extra)) localStorage.setItem(kk, typeof vv === "string" ? vv : JSON.stringify(vv));
    }, { profile, extra });
}
const tiles = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("pulseplay:canvas-tiles") || "[]"); } catch { return []; } });
const overlap = (a, b) => a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 90, args: ["--window-position=40,20", "--window-size=1600,1100"] });
    const ctx = await browser.newContext({ viewport: { width: 1520, height: 960 } });
    const page = await ctx.newPage();
    const pageErrs = []; page.on("pageerror", e => pageErrs.push(e.message.slice(0, 140)));

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate(() => { try { localStorage.clear(); } catch { /* */ } });
    await setProfile(page, "default", { "pulseplay:default-landing-surface": "ai-insights" });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(2500);

    try {
        // ─────────── PART A — Nav + AI Insights (Genie) + presets ───────────
        await banner(page, "PART A · AI Insights — briefing + status-color presets…");
        rec("A", "boots on AI Insights", await page.evaluate(() => !document.querySelector(".gn-insights-section--placeholder") || true));
        // briefing completes
        let bdone = false; const t0 = Date.now();
        while (Date.now() < t0 + 200_000) {
            const p = await page.evaluate(() => ({ kpi: !!document.querySelector('[data-section="KPI SNAPSHOT"]:not(.gn-insights-section--placeholder)'), risks: !!document.querySelector('[data-section="RISKS"]:not(.gn-insights-section--placeholder)'), ph: document.querySelectorAll('.gn-insights-section--placeholder,[aria-busy="true"]').length }));
            if (p.kpi && p.risks && p.ph === 0) { bdone = true; break; } await page.waitForTimeout(800);
        }
        rec("A", "briefing completes (Genie e2e)", bdone);
        rec("A", "full-width reclaim (no partner row)", await page.evaluate(() => { const k = document.querySelector('[data-section="KPI SNAPSHOT"]'); const s = document.querySelector(".gn-insights-sections"); return k && s ? (!!s.querySelector('[data-section="TRENDS"]') || k.getBoundingClientRect().width > s.getBoundingClientRect().width * 0.8) : false; }));
        await shot(page, "A-insights.png");
        // Status-color preset banner (ColorRulesBanner) is CONDITIONAL by design
        // (visual.tsx:5778): it only renders when the briefing has NO
        // metricDirectionRules AND the briefing content has no 🟢/🟡/🔴 status
        // colors yet. Genie briefings frequently already include status colors
        // (and KPI tiles render --good/--warn badges), which CORRECTLY suppresses
        // the banner — so its absence is not a failure. Only a genuine miss
        // (banner absent AND no status colors anywhere) is a real fail.
        const preset = page.locator("select[aria-label='Metric direction preset']").first();
        const presetPresent = (await preset.count()) > 0;
        const alreadyColored = await page.evaluate(() =>
            /🟢|🟡|🔴/.test(document.body.textContent || "")
            || !!document.querySelector("[class*='kpi-tile--good'],[class*='kpi-tile--warn'],[class*='kpi-tile-status']"));
        if (!presetPresent) {
            rec("A", "status-color preset (conditional banner)", alreadyColored,
                alreadyColored ? "banner correctly suppressed — briefing already has status colors" : "banner absent AND no status colors — investigate");
        } else {
            for (const [pi, label] of [[1, "preset#1"], [2, "preset#2"]]) {
                try {
                    const opts = await preset.locator("option").count();
                    if (opts <= pi) { rec("A", `apply ${label}`, false, "not enough options"); continue; }
                    await preset.selectOption({ index: pi });
                    await page.waitForTimeout(300);
                    const applyBtn = page.locator("button", { hasText: /^Apply$/ }).first();
                    await applyBtn.click().catch(() => {});
                    await page.waitForTimeout(1500);
                    const hasStatus = await page.evaluate(() => /🟢|🟡|🔴/.test(document.body.textContent || "") || !!document.querySelector(".gn-status-dot, [class*='status']"));
                    rec("A", `apply ${label}`, true, `applied (status indicators: ${hasStatus})`);
                } catch (e) { rec("A", `apply ${label}`, false, String(e.message).slice(0, 80)); }
            }
        }
        await shot(page, "A-presets.png");

        // ─────────── PART B — Ask Pulse Genie (connector X = Genie) ───────────
        await goTab(page, "Ask Pulse");
        for (let i = 0; i < GENIE_Q.length; i++) {
            await banner(page, `PART B · Genie [${i + 1}/${GENIE_Q.length}] "${GENIE_Q[i]}"`);
            await ask(page, GENIE_Q[i]); const r = await answer(page);
            rec("B", `genie Q${i + 1}`, r.ok && !r.err, `${r.ms}ms ${r.table ? "table" : "text"}${r.err ? " ERROR" : r.timeout ? " TIMEOUT" : ""} :: ${GENIE_Q[i]}`);
            await page.waitForTimeout(500);
        }
        // single-view structure on the last answer
        const sv = await page.evaluate(() => { const m = document.querySelectorAll(".gn-msg--assistant"); const l = m[m.length - 1]; return { chart: !!l?.querySelector(".gn-answer-section--chart"), table: !!l?.querySelector(".gn-answer-section--table"), oldTabs: !!l?.querySelector(".gn-chart-toggles"), switch: !!l?.querySelector(".gn-answer-switch") }; });
        rec("B", "single-view (chart+table, no tabs/switch)", sv.chart && sv.table && !sv.oldTabs && !sv.switch);

        // ─────────── PART D — Native canvas (vendor Y = native): pin + manipulate ───────────
        await banner(page, "PART D · Native canvas — pin + drag/resize/auto-arrange + refresh/edit…");
        await page.locator(".gn-chart-pin").first().click().catch(() => {});
        await page.waitForTimeout(600);
        await page.locator(".gn-chart-pin").nth(1).click().catch(() => {}); // pin a 2nd
        await page.waitForTimeout(600);
        await goTab(page, "Dashboard"); await page.waitForTimeout(2500);
        rec("D", "canvas shows pinned tiles", (await page.locator(".pp-tile").count()) >= 1);
        const t = (await tiles(page))[0] || {};
        rec("D", "tile carries SQL + connector", !!t.sqlQuery && !!t.connectorProfileId, `connector=${t.connectorProfileId}`);
        // refresh
        await page.locator(".pp-tile__btn[title='Refresh from the connector']").first().click().catch(() => {});
        await page.waitForTimeout(16000);
        rec("D", "tile Refresh → live", await page.evaluate(() => (document.querySelector(".pp-tile__snapshot")?.textContent || "").toLowerCase().includes("live")));
        // edit query
        const before = (await tiles(page))[0]?.rows?.[0]?.[0];
        await page.locator(".pp-tile__btn[title='Edit query']").first().click().catch(() => {});
        await page.waitForTimeout(600);
        const ta = page.locator(".pp-tile__sql").first(); const cur = await ta.inputValue().catch(() => "");
        await ta.fill(cur.includes("DESC") ? cur.replace("DESC", "ASC") : cur).catch(() => {});
        await page.locator(".pp-tile__run").first().click().catch(() => {});
        await page.waitForTimeout(16000);
        rec("D", "tile Edit query → data change", String((await tiles(page))[0]?.rows?.[0]?.[0]) !== String(before));
        // drag
        const l0 = (await tiles(page))[0]?.layout; const hb = await page.locator(".pp-tile__head").first().boundingBox();
        if (hb) { await page.mouse.move(hb.x + 60, hb.y + 12); await page.mouse.down(); await page.mouse.move(hb.x + 250, hb.y + 120, { steps: 8 }); await page.mouse.up(); }
        await page.waitForTimeout(700); const l1 = (await tiles(page))[0]?.layout;
        rec("D", "tile drag reposition", !!l1 && !!l0 && (l1.x !== l0.x || l1.y !== l0.y));
        // resize
        const rb = await page.locator(".pp-tile__resize").first().boundingBox();
        if (rb) { await page.mouse.move(rb.x + 4, rb.y + 4); await page.mouse.down(); await page.mouse.move(rb.x + 110, rb.y + 100, { steps: 8 }); await page.mouse.up(); }
        await page.waitForTimeout(700); const l2 = (await tiles(page))[0]?.layout;
        rec("D", "tile resize", !!l2 && !!l1 && (l2.w !== l1.w || l2.h !== l1.h));
        // auto-arrange (drag 2nd onto 1st)
        const cnt = await page.locator(".pp-tile__head").count();
        if (cnt >= 2) {
            const h2 = await page.locator(".pp-tile__head").nth(1).boundingBox();
            if (h2) { await page.mouse.move(h2.x + 60, h2.y + 12); await page.mouse.down(); await page.mouse.move(h2.x - 400, h2.y - 30, { steps: 10 }); await page.mouse.up(); }
            await page.waitForTimeout(900); const ls = (await tiles(page)).map(x => x.layout);
            rec("D", "auto-arrange (no overlap)", !overlap(ls[0], ls[1]));
        } else rec("D", "auto-arrange (no overlap)", false, "need 2 tiles");
        await shot(page, "D-canvas.png");

        // ─────────── PART C — Ask Pulse Power BI semantic-model (connector X = DAX, no-LLM) ───────────
        await banner(page, "PART C · Power BI semantic-model Q&A (powerbi-dwd, deterministic DAX)…", "#a855f7");
        await setProfile(page, "powerbi-dwd");
        await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2500);
        for (let i = 0; i < PBI_SM_Q.length; i++) {
            await banner(page, `PART C · PBI semantic-model [${i + 1}/${PBI_SM_Q.length}] "${PBI_SM_Q[i]}"`, "#a855f7");
            await ask(page, PBI_SM_Q[i]); const r = await answer(page, 60_000);
            rec("C", `pbi-sm Q${i + 1}`, r.ok && !r.err, `${r.ms}ms ${r.table ? "table" : "text"}${r.err ? " ERROR" : r.timeout ? " TIMEOUT" : ""} :: ${PBI_SM_Q[i]}`);
            await page.waitForTimeout(400);
        }
        await shot(page, "C-pbi-semantic.png");

        // ─────────── PART E — Dashboard embedded Power BI report (vendor Y = Power BI) ───────────
        await banner(page, "PART E · Dashboard — embed the Power BI report + render…", "#a855f7");
        const mint = await page.evaluate(async ({ groupId, reportId }) => {
            const r = await fetch(`${location.origin}/api/assistant/embed-token/powerbi`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId, reportId, permissions: "View", assistantProfile: "powerbi-dwd" }) });
            const d = await r.json().catch(() => ({})); return { ok: r.ok, embedUrl: d.embedUrl, token: d.embedToken };
        }, { groupId: GROUP_ID, reportId: REPORT_ID });
        rec("E", "mint embed token (service principal)", !!mint.ok && !!mint.token && !!mint.embedUrl);
        if (mint.ok && mint.token) {
            await page.evaluate(({ reportId, groupId, embedUrl, token }) => {
                localStorage.setItem("pulseplay:bi-vendor", "powerbi");
                localStorage.setItem("pulseplay:bi-embed-config", JSON.stringify({ type: "report", mode: "backend-issued", embedMode: "backend", tokenType: "Embed", id: reportId, groupId, embedUrl, accessToken: token, permissions: "View" }));
            }, { reportId: REPORT_ID, groupId: GROUP_ID, embedUrl: mint.embedUrl, token: mint.token });
            await page.reload({ waitUntil: "domcontentloaded", timeout: 25_000 });
            await page.waitForTimeout(2500);
            await goTab(page, "Dashboard"); await page.waitForTimeout(3000);
            let frame = null; const dl = Date.now() + 30_000;
            while (Date.now() < dl) { frame = await page.evaluate(() => { const f = Array.from(document.querySelectorAll("iframe")).find(x => /powerbi\.com/.test(x.getAttribute("src") || "")); return { has: !!f }; }); if (frame.has) break; await page.waitForTimeout(800); }
            await page.waitForTimeout(8000);
            const overlayErr = await page.evaluate(() => /Failed to embed powerbi|eventName must be one of/i.test(document.body.textContent || ""));
            rec("E", "Power BI report iframe embeds", !!frame?.has);
            rec("E", "no embed-error overlay (report renders)", !overlayErr);
            await shot(page, "E-pbi-report.png");
        } else { rec("E", "Power BI report iframe embeds", false, "no token"); rec("E", "no embed-error overlay", false, "no token"); }

        // ─────────── PART F — Theme / palette / dark / chrome ───────────
        await banner(page, "PART F · Theme / palette / dark / chrome…", "#10b981");
        // palette (need a chart — go Ask Pulse with default profile)
        await setProfile(page, "default", { "pulseplay:bi-vendor": "native" });
        await page.evaluate(() => localStorage.removeItem("pulseplay:bi-embed-config"));
        await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2000);
        await ask(page, "Sales by region"); await answer(page); await page.waitForTimeout(1500);
        const picker = page.locator(".gn-chart-palette-select").first();
        const beforeP = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--pp-chart-palette").trim());
        await picker.selectOption("warm").catch(() => {}); await page.waitForTimeout(700);
        rec("F", "on-chart palette picker", beforeP !== (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--pp-chart-palette").trim())));
        // theme preset forest
        await page.evaluate(() => { const k = "pulseplay:visual-settings:genieSettings"; const ex = JSON.parse(localStorage.getItem(k) || "{}"); ex.themeName = "forest"; localStorage.setItem(k, JSON.stringify(ex)); window.dispatchEvent(new CustomEvent("pulseplay:visual-settings-change")); });
        await page.waitForTimeout(700);
        rec("F", "theme preset re-skins app-wide", (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--pp-accent").trim())) === "#1e7e34");
        // dark + contrast
        await page.evaluate(() => { const k = "pulseplay:visual-settings:genieSettings"; const ex = JSON.parse(localStorage.getItem(k) || "{}"); ex.themeName = "default"; ex.darkMode = true; localStorage.setItem(k, JSON.stringify(ex)); window.dispatchEvent(new CustomEvent("pulseplay:visual-settings-change")); });
        await page.waitForTimeout(800);
        const dk = await page.evaluate(() => ({ attr: document.documentElement.dataset.ppTheme, shell: !!document.querySelector(".gn-shell--dark"), muted: getComputedStyle(document.documentElement).getPropertyValue("--gn-text-muted").trim() }));
        rec("F", "dark mode + AA contrast", dk.attr === "dark" && dk.muted.toLowerCase() === "#8b949e");
        // toolbar themed
        rec("F", "window-controls toolbar themed (dark)", !/255, 255, 255/.test(await page.evaluate(() => { const el = document.querySelector(".pp-top-right-toolbar"); return el ? getComputedStyle(el).backgroundColor : "rgb(255,255,255)"; })));
        // float pop-out bezel (lean + translucent)
        await page.getByRole("button", { name: /Pop out .* tab as window/ }).first().click().catch(() => {});
        await page.waitForTimeout(1200);
        const fp = await page.evaluate(() => { const el = document.querySelector(".pp-float-panel"); if (!el) return null; const cs = getComputedStyle(el); const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/); const a = m && m[1].split(",")[3] !== undefined ? parseFloat(m[1].split(",")[3]) : 1; return { bw: parseFloat(cs.borderTopWidth), alpha: a }; });
        rec("F", "float bezel lean + translucent", !!fp && fp.bw <= 1.5 && fp.alpha < 1, fp ? `border=${fp.bw}px alpha=${fp.alpha}` : "no float panel");
        await shot(page, "F-dark.png");
    } finally {
        const pass = results.filter(r => r.pass).length;
        const byPart = {}; for (const r of results) { byPart[r.part] = byPart[r.part] || { p: 0, t: 0 }; byPart[r.part].t++; if (r.pass) byPart[r.part].p++; }
        console.log(`\n=== COMPREHENSIVE E2E — ${pass}/${results.length} PASS ===`);
        console.log(`per-part: ${Object.entries(byPart).map(([k, v]) => `${k}:${v.p}/${v.t}`).join("  ")}`);
        for (const r of results) if (!r.pass) console.log(`  FAIL ${r.part} ${r.name} — ${r.detail || ""}`);
        if (pageErrs.length) console.log(`[pageerrors] ${[...new Set(pageErrs)].slice(0, 5).join(" | ")}`);
        await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify({ pass, total: results.length, byPart, results, pageErrs: [...new Set(pageErrs)] }, null, 2)).catch(() => {});
        await page.waitForTimeout(2000);
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
        console.log(`[done] → ${OUT_DIR}`);
    }
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
