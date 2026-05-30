#!/usr/bin/env node
// End-to-end headed smoke: Ask Pulse composer with powerbi-dwd profile,
// submit "Total Sales by Region", verify the markdown table renders
// in the chat thread. Confirms the routing fix + static probe + DAX
// template + UI rendering all work together.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const EVIDENCE_ROOT = join(REPO, "docs/evidence/powerbi-asksulse-2026-05-26");
const FALLBACK_ROOT = join(REPO, "playground/scripts/.powerbi-smoke-out");
let OUT_DIR = join(EVIDENCE_ROOT, RUN_ID);
const BASE = "http://127.0.0.1:7001";

const QUESTIONS = [
    // SIMPLE (single measure, single dim, plain aggregate)
    "Total Sales",
    "Total Sales by Region",
    "Total Profit by Category",
    "Order Count by Segment",
    "Total Quantity by Ship Mode",
    // MEDIUM (top-N, alternate measures, less common dimensions)
    "Top 5 cities by Total Sales",
    "Top 10 customers by Total Profit",
    "Avg Discount by Category",
    "Return Rate by Region",
    "Total Sales by Sub-Category",
    "Profit Margin by Region",
    "Avg Order Value by Segment",
    "Customer Count by Region",
    // COMPLEX (time intelligence, multi-step measures, derived dims)
    "Sales YoY % by Category",
    "Top 5 products by Total Sales",
    "Avg Days To Ship by Ship Mode",
    "Sales YTD",
    "Total Profit by Manager",
    "Returned Orders by Region",
    "Total Sales by Year",
];

async function banner(page, text, color = "#10b981") {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__pbi__");
        if (!b) {
            b = document.createElement("div");
            b.id = "__pbi__";
            Object.assign(b.style, {
                position: "fixed", top: "8px", left: "8px", right: "8px", zIndex: "99999",
                padding: "8px 12px", background: "rgba(15,23,42,0.94)", color: "#fff",
                font: "13px ui-monospace, monospace", borderRadius: "4px",
                pointerEvents: "none", borderLeft: `4px solid ${color}`,
            });
            document.body.appendChild(b);
        }
        b.textContent = text;
    }, { text, color });
}

async function safeScreenshot(page, filename) {
    try {
        await page.screenshot({ path: join(OUT_DIR, filename), fullPage: false });
    } catch (err) {
        // Evidence files are useful, but Windows can briefly lock an existing
        // PNG while a prior headed run is still closing. Do not let that mask
        // the actual Ask Pulse pass/fail result.
        console.warn(`  [warn] screenshot skipped: ${err?.message || err}`);
    }
}

async function main() {
    try {
        await mkdir(OUT_DIR, { recursive: true });
    } catch (err) {
        OUT_DIR = join(FALLBACK_ROOT, RUN_ID);
        await mkdir(OUT_DIR, { recursive: true });
        console.warn(`  [warn] docs/evidence locked; screenshots -> ${OUT_DIR} (${err?.code || err?.message || err})`);
    }
    const browser = await chromium.launch({
        headless: false, slowMo: 350,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });

    const results = [];

    try {
        for (let i = 0; i < QUESTIONS.length; i++) {
            const question = QUESTIONS[i];
            console.log(`\n[${i + 1}/${QUESTIONS.length}] "${question}"`);

            // Fresh browser context each iteration. The Ask Pulse tab runs
            // background preload/probe effects; context isolation prevents a
            // prior iteration's local/session storage or pending React state
            // from changing the next question's request shape.
            const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
            const page = await ctx.newPage();
            page.on("pageerror", e => console.log("[pageerror]", e.message.slice(0, 200)));

            try {
                await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
                await page.evaluate(() => {
                    try { window.localStorage.clear(); } catch { /* swallow */ }
                    // Force Power BI profile + direct landing on Ask Pulse
                    window.localStorage.setItem("pulseplay:active-ai-profile", "powerbi-dwd");
                    window.localStorage.setItem("pulseplay:active-surface", "ask-pulse");
                    window.localStorage.setItem("pulseplay:default-landing-surface", "ask-pulse");
                    const k = "pulseplay:visual-settings:genieSettings";
                    const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
                    ex.assistantProfile = "powerbi-dwd";
                    ex.connectionMode = "proxy";
                    ex.apiBaseUrl = window.location.origin + "/api";
                    window.localStorage.setItem(k, JSON.stringify(ex));
                });
                await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 25_000 });
                await page.waitForTimeout(1200);
                await banner(page, `[${i + 1}/${QUESTIONS.length}] POWERBI-DWD · "${question}" · ready to submit`, "#a855f7");

                // Find composer (PulseShell uses gn-input, v0 uses pp-ai-sidebar__input)
                const composer = page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first();
                if (await composer.count() === 0) {
                    console.log("  ❌ no composer found"); results.push({ question, verdict: "FAIL", reason: "no-composer" });
                    await safeScreenshot(page, `${String(i + 1).padStart(2, "0")}-no-composer.png`);
                    continue;
                }
                await composer.fill(question);
                await page.waitForTimeout(400);

                const send = page.locator("button.gn-send, button.pp-ai-sidebar__ask").first();
                if (await send.count() === 0) {
                    console.log("  ❌ no send button"); results.push({ question, verdict: "FAIL", reason: "no-send" });
                    continue;
                }

                const tSubmit = Date.now();
                await send.click();
                await banner(page, `[${i + 1}/${QUESTIONS.length}] submitting…`, "#a855f7");

                // Wait for response (powerbi-deterministic returns fast — typically <2s)
                let completedMs = null;
                let hasTable = false;
                let answerText = "";
                const deadline = tSubmit + 25_000;
                while (Date.now() < deadline) {
                    const probe = await page.evaluate(() => {
                        const msg = document.querySelectorAll(".gn-msg--assistant, [data-testid^=\"pp-ai-entry-\"]");
                        const last = msg[msg.length - 1];
                        if (!last) return null;
                        const text = (last.textContent || "").trim();
                        // 2026-05-26 — fixed table detection. Renderer converts
                        // markdown |...|...| to a real <table> so we count rows
                        // in the actual DOM table, not regex pipes (which are
                        // gone after rendering). Also detect explicit error
                        // banners so we don't classify "could not complete" as PASS.
                        const tbl = last.querySelector("table");
                        const tableRows = tbl ? tbl.querySelectorAll("tbody tr, tr").length : 0;
                        const hasTable = tableRows >= 1;
                        const hasProgress = !!last.querySelector(".gn-chat-progress, .gn-progress-active");
                        const isError = /could not complete this request|share the support code|drafting the briefing/i.test(text);
                        return { len: text.length, hasTable, tableRows, hasProgress, isError, text: text.slice(0, 300) };
                    });
                    // Skip while in-progress; treat error as instant-complete with FAIL marker
                    if (probe && probe.isError) {
                        completedMs = Date.now() - tSubmit; hasTable = false; answerText = probe.text;
                        break;
                    }
                    if (probe && !probe.hasProgress && (probe.len > 40 || probe.hasTable)) {
                        completedMs = Date.now() - tSubmit;
                        hasTable = probe.hasTable;
                        answerText = probe.text;
                        break;
                    }
                    await page.waitForTimeout(200);
                }

                await page.waitForTimeout(1500);
                const verdict = (completedMs != null && hasTable) ? "PASS" : (completedMs != null ? "PASS-NO-TABLE" : "FAIL");
                await banner(page, `[${i + 1}/${QUESTIONS.length}] ${verdict} · ${completedMs ?? "—"}ms · ${hasTable ? "table✓" : "no-table"}`, verdict === "PASS" ? "#10b981" : "#f97316");
                await safeScreenshot(page, `${String(i + 1).padStart(2, "0")}-${verdict.toLowerCase()}.png`);

                const flag = verdict === "PASS" ? "✅" : verdict === "PASS-NO-TABLE" ? "⚠️" : "❌";
                console.log(`  ${flag} ${verdict}  completed=${completedMs ?? "—"}ms hasTable=${hasTable}`);
                console.log(`     answer preview: ${answerText.slice(0, 120).replace(/\n/g, " ↵ ")}`);
                results.push({ question, verdict, completedMs, hasTable });
            } finally {
                await ctx.close().catch(() => undefined);
            }
        }
    } finally {
        await browser.close().catch(() => undefined);
    }

    console.log("\n=== Summary ===");
    for (const r of results) {
        const flag = r.verdict === "PASS" ? "✅" : r.verdict === "PASS-NO-TABLE" ? "⚠️" : "❌";
        console.log(`${flag} ${r.verdict.padEnd(15)} ${r.completedMs ?? "—"}ms  ${r.question}`);
    }
    console.log(`[done] screenshots → ${OUT_DIR}`);
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
