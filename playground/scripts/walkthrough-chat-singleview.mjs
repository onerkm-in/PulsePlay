#!/usr/bin/env node
// Watchable validation of the single-view Ask Pulse answer: Narrative + preferred
// Chart + Table stacked together (no per-representation tabs), SQL behind the
// </> toolbar button + the slim Answer/SQL switch. Headed + slow-mo.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/chat-singleview/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const PROFILE = "default";
const QUESTIONS = ["What is the total sales by region?", "Top 5 customers by total sales"];

async function banner(page, text, color = "#06b6d4") {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__wt__");
        if (!b) { b = document.createElement("div"); b.id = "__wt__"; document.body.appendChild(b); }
        Object.assign(b.style, { position: "fixed", top: "8px", left: "8px", right: "8px", zIndex: "99999", padding: "10px 14px", background: "rgba(15,23,42,0.95)", color: "#fff", font: "14px ui-monospace, monospace", borderRadius: "6px", pointerEvents: "none", borderLeft: `5px solid ${color}` });
        b.textContent = text;
    }, { text, color });
}
async function shot(page, name) { try { await page.screenshot({ path: join(OUT_DIR, name), fullPage: false }); } catch { /* */ } }

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const results = [];
    const browser = await chromium.launch({ headless: false, slowMo: 350, args: ["--window-position=60,40", "--window-size=1560,1080"] });
    const ctx = await browser.newContext({ viewport: { width: 1480, height: 980 } });
    const page = await ctx.newPage();
    page.on("pageerror", e => results.push({ pageerror: e.message.slice(0, 160) }));

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate((profile) => {
        try { window.localStorage.clear(); } catch { /* */ }
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        window.localStorage.setItem("pulseplay:active-surface", "ask-pulse");
        window.localStorage.setItem("pulseplay:default-landing-surface", "ask-pulse");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile; ex.connectionMode = "proxy"; ex.apiBaseUrl = window.location.origin + "/api";
        window.localStorage.setItem(k, JSON.stringify(ex));
    }, PROFILE);
    await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(2000);

    try {
        for (let i = 0; i < QUESTIONS.length; i++) {
            const q = QUESTIONS[i];
            await banner(page, `Single-view answer · "${q}"`, "#06b6d4");
            const composer = page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first();
            await composer.fill(q);
            await page.waitForTimeout(300);
            await page.locator("button.gn-send, button.pp-ai-sidebar__ask").first().click();
            await banner(page, `Single-view answer · submitting "${q}" to Genie…`, "#06b6d4");

            const t0 = Date.now();
            let r = { done: false, ms: null, narrative: false, chart: false, table: false, scrollCap: false, oldTabs: false, switch: false };
            const dl = t0 + 150_000;
            while (Date.now() < dl) {
                const p = await page.evaluate(() => {
                    const msgs = document.querySelectorAll(".gn-msg--assistant");
                    const last = msgs[msgs.length - 1];
                    if (!last) return null;
                    const progress = !!last.querySelector(".gn-chat-progress, .gn-progress-active");
                    const txt = (last.querySelector(".gn-msg-body")?.textContent || "").trim();
                    return {
                        progress,
                        narrative: txt.length > 20,
                        chart: !!last.querySelector(".gn-answer-section--chart .gn-chart-container"),
                        table: !!last.querySelector(".gn-answer-section--table .gn-table"),
                        scrollCap: !!last.querySelector(".gn-answer-table-scroll"),
                        oldTabs: !!last.querySelector(".gn-chart-toggles"),
                        switch: !!last.querySelector(".gn-answer-switch"),
                    };
                });
                if (p && !p.progress && (p.chart || p.table || p.narrative)) {
                    r = { done: true, ms: Date.now() - t0, ...p }; break;
                }
                await page.waitForTimeout(400);
            }
            // Let the reveal animation settle, then capture
            await page.waitForTimeout(1500);
            const verdict = (r.chart && r.table && r.scrollCap && !r.oldTabs) ? "PASS"
                : (r.narrative && !r.oldTabs) ? "PASS-NARRATIVE-ONLY" : "FAIL";
            await banner(page, `Single-view ${verdict} · narrative:${r.narrative?"✓":"✗"} chart:${r.chart?"✓":"✗"} table:${r.table?"✓":"✗"} scrollCap:${r.scrollCap?"✓":"✗"} oldTabs:${r.oldTabs?"PRESENT!":"gone"}`, verdict === "PASS" ? "#10b981" : verdict.startsWith("PASS") ? "#f59e0b" : "#ef4444");
            await page.waitForTimeout(1200);
            await shot(page, `${String(i + 1).padStart(2, "0")}-${verdict.toLowerCase()}.png`);
            await page.screenshot({ path: join(OUT_DIR, `${String(i + 1).padStart(2, "0")}-${verdict.toLowerCase()}-full.png`), fullPage: true }).catch(() => {});
            console.log(`[${i + 1}] ${verdict} ms=${r.ms} narrative=${r.narrative} chart=${r.chart} table=${r.table} scrollCap=${r.scrollCap} oldTabs=${r.oldTabs} switch=${r.switch}`);
            results.push({ q, verdict, ...r });

            // Click the SQL switch to confirm it still reaches the SQL view
            if (i === 0) {
                const sqlBtn = page.locator(".gn-answer-switch-btn", { hasText: /^SQL$/ }).first();
                if (await sqlBtn.count() > 0) {
                    await sqlBtn.click();
                    await page.waitForTimeout(1200);
                    await banner(page, "Single-view · SQL view reached via the slim switch (</> also works)", "#a855f7");
                    await shot(page, `${String(i + 1).padStart(2, "0")}-sql-view.png`);
                    const sqlShown = await page.evaluate(() => !!document.querySelector(".gn-msg--assistant .gn-sql-tabs, .gn-msg--assistant pre.gn-code, .gn-msg--assistant .gn-sqltabs"));
                    console.log(`    SQL switch → SQL view shown: ${sqlShown}`);
                    results.push({ q: q + " [SQL switch]", sqlShown });
                }
            }
            await page.waitForTimeout(1000);
        }
    } finally {
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }

    console.log("\n=== Summary ===");
    for (const r of results) if (r.verdict) console.log(`${r.verdict.padEnd(22)} ${r.q}`);
    await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify(results, null, 2));
    console.log(`\n[done] artifacts → ${OUT_DIR}`);
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
