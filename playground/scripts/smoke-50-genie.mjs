#!/usr/bin/env node
// 50-question end-to-end regression smoke against the LIVE Genie `default`
// (Sales Team) space. Asks 50 varied questions on Ask Pulse, waits for each to
// complete, and verifies a real answer rendered (narrative and/or table, no
// error). One persistent page (Vite dies on per-iter reload). Headed.
//
// Verdicts: PASS (answer + table) · PASS-TEXT (answer, no table) · FAIL.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/smoke-50-genie/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const PROFILE = "default";
const PER_Q_TIMEOUT = 150_000;

const QUESTIONS = [
    // simple totals / counts
    "What is the total sales?", "How many orders do we have?", "What is the total profit?",
    "What is the total quantity sold?", "How many customers are there?", "What is the average order value?",
    "What is the overall profit margin?", "What is the return rate?",
    // by dimension
    "Show me sales by region", "Show me profit by region", "Sales by product category",
    "Profit by product category", "Orders by region", "Quantity by category",
    "Sales by customer segment", "Sales by year", "Profit by year", "Average discount by category",
    // top-N
    "Top 5 customers by total sales", "Top 10 products by sales", "Top 5 regions by profit",
    "Bottom 5 products by profit", "Top 5 customers by number of orders", "Top 3 categories by quantity",
    "What is the largest single order?", "Top 5 most profitable products",
    // trends / time
    "Sales trend over the past quarters", "Monthly sales for 2017", "Year over year sales growth",
    "Quarterly profit trend", "Sales by month", "How did profit change from 2016 to 2017?",
    // ratios / derived
    "Which region has the highest profit margin?", "Average profit per order", "Sales per customer",
    "Profit margin by category", "Which category has the best return rate?",
    // comparisons
    "Compare sales between West and East", "Which product category grew the most?",
    "Most profitable region", "Least profitable category", "Which customer segment is most profitable?",
    "Compare profit margin across regions",
    // specific / edge
    "What were the total sales in 2017?", "Which products have negative profit?",
    "Show sales above 500000", "How many orders were returned?",
    "What percentage of sales comes from the West region?", "Average order value by region",
    "Total discount given across all orders",
];

async function banner(page, text, color = "#06b6d4") {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__s50__"); if (!b) { b = document.createElement("div"); b.id = "__s50__"; document.body.appendChild(b); }
        Object.assign(b.style, { position: "fixed", top: "8px", left: "8px", right: "8px", zIndex: "99999", padding: "9px 13px", background: "rgba(15,23,42,0.95)", color: "#fff", font: "13px ui-monospace", borderRadius: "6px", pointerEvents: "none", borderLeft: `5px solid ${color}` });
        b.textContent = text;
    }, { text, color });
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 120, args: ["--window-position=50,30", "--window-size=1560,1060"] });
    const ctx = await browser.newContext({ viewport: { width: 1480, height: 940 } });
    const page = await ctx.newPage();
    const pageErrs = [];
    page.on("pageerror", e => pageErrs.push(e.message.slice(0, 160)));

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate((profile) => {
        try { localStorage.clear(); } catch { /* */ }
        localStorage.setItem("pulseplay:active-ai-profile", profile);
        localStorage.setItem("pulseplay:active-surface", "ask-pulse");
        localStorage.setItem("pulseplay:default-landing-surface", "ask-pulse");
        const k = "pulseplay:visual-settings:genieSettings"; const ex = JSON.parse(localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api";
        localStorage.setItem(k, JSON.stringify(ex));
    }, PROFILE);
    await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(2500);

    const results = [];
    for (let i = 0; i < QUESTIONS.length; i++) {
        const q = QUESTIONS[i];
        const idx = i + 1;
        try {
            await banner(page, `[${idx}/${QUESTIONS.length}] "${q}"`, "#06b6d4");
            const composer = page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first();
            if (await composer.count() === 0) { results.push({ idx, q, verdict: "FAIL", reason: "no-composer", ms: 0 }); continue; }
            await composer.fill(q);
            await page.waitForTimeout(150);
            const send = page.locator("button.gn-send, button.pp-ai-sidebar__ask").first();
            const t0 = Date.now();
            await send.click();

            let done = null, hasTable = false, isError = false, preview = "";
            const dl = t0 + PER_Q_TIMEOUT;
            while (Date.now() < dl) {
                const p = await page.evaluate(() => {
                    const msgs = document.querySelectorAll(".gn-msg--assistant, [data-testid^='pp-ai-entry-']");
                    const last = msgs[msgs.length - 1];
                    if (!last) return null;
                    const text = (last.textContent || "").trim();
                    const rows = last.querySelectorAll("table tbody tr, table tr").length;
                    const progress = !!last.querySelector(".gn-chat-progress, .gn-progress-active");
                    const err = /could not complete this request|share the support code|sorry, I (?:can'?t|cannot)|something went wrong|Proxy Offline/i.test(text);
                    return { len: text.length, hasTable: rows >= 1, progress, err, text: text.slice(0, 200) };
                });
                if (p && p.err) { done = Date.now() - t0; isError = true; preview = p.text; break; }
                if (p && !p.progress && (p.len > 40 || p.hasTable)) { done = Date.now() - t0; hasTable = p.hasTable; preview = p.text; break; }
                await page.waitForTimeout(300);
            }
            const verdict = isError ? "FAIL" : (done != null && hasTable) ? "PASS" : (done != null) ? "PASS-TEXT" : "TIMEOUT";
            const color = verdict === "PASS" ? "#10b981" : verdict === "PASS-TEXT" ? "#f59e0b" : "#ef4444";
            await banner(page, `[${idx}/${QUESTIONS.length}] ${verdict} · ${done ?? "—"}ms · "${q}"`, color);
            results.push({ idx, q, verdict, ms: done, hasTable, preview: preview.replace(/\s+/g, " ").slice(0, 120) });
            console.log(`${verdict.padEnd(10)} ${String(done ?? "—").padStart(6)}ms  [${idx}/50] ${q}`);
            await page.waitForTimeout(600);
        } catch (err) {
            results.push({ idx, q, verdict: "FAIL", reason: "exception", error: String(err?.message || err).slice(0, 140), ms: 0 });
            console.log(`FAIL (exc)  [${idx}/50] ${q} :: ${String(err?.message || err).slice(0, 100)}`);
        }
    }

    const pass = results.filter(r => r.verdict === "PASS").length;
    const passText = results.filter(r => r.verdict === "PASS-TEXT").length;
    const fail = results.filter(r => r.verdict === "FAIL" || r.verdict === "TIMEOUT").length;
    const ok = pass + passText;
    const times = results.filter(r => r.ms).map(r => r.ms);
    const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    console.log(`\n=== SMOKE 50 — ${ok}/${results.length} answered (${pass} with table, ${passText} text-only) · ${fail} fail/timeout · avg ${avg}ms ===`);
    for (const r of results) if (r.verdict === "FAIL" || r.verdict === "TIMEOUT") console.log(`  ${r.verdict}: [${r.idx}] ${r.q} ${r.reason || r.preview || ""}`);
    if (pageErrs.length) console.log(`\n[pageerrors] ${pageErrs.length}: ${[...new Set(pageErrs)].slice(0, 5).join(" | ")}`);
    await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify({ ok, pass, passText, fail, avg, total: results.length, results, pageErrs: [...new Set(pageErrs)] }, null, 2));
    await page.screenshot({ path: join(OUT_DIR, "final.png") }).catch(() => {});
    await page.waitForTimeout(1500);
    await ctx.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    console.log(`[done] → ${OUT_DIR}`);
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
