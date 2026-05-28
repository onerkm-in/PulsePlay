#!/usr/bin/env node
// 10-case headed regression on Ask Pulse against the `default` Genie profile
// (Sales Team space). Twin of probe-ask-pulse-live10.mjs but targeting Genie
// instead of powerbi-semantic-model.
//
// Genie path is LLM-backed (Databricks Genie's NL→SQL inside Unity Catalog),
// so timings will be 5-15s per question vs sub-1.3s for deterministic DAX.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/genie-asksulse-10-2026-05-26/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const PROFILE = "default";  // Genie space — Sales Team per proxy/config.json

const QUESTIONS = [
    // SIMPLE
    "What is the total sales?",
    "Show me sales by region",
    "How many orders do we have?",
    // MEDIUM
    "Top 5 customers by total sales",
    "Average order value",
    "Sales by product category",
    // COMPLEX
    "Sales trend over the past quarters",
    "Largest single order",
    "Most profitable region",
    "Year over year sales growth",
];

async function banner(page, text, color = "#10b981") {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__gen__");
        if (!b) {
            b = document.createElement("div");
            b.id = "__gen__";
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
    try { await page.screenshot({ path: join(OUT_DIR, filename), fullPage: false }); }
    catch (err) { console.warn(`  [warn] screenshot skipped: ${err?.message || err}`); }
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({
        headless: false, slowMo: 250,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });

    const results = [];

    // Use ONE persistent browser context + page across all iterations to
    // avoid hammering Vite with full reloads (Vite died on the per-iter
    // pattern under repeated page.goto load). Each iteration just clears
    // the chat thread and submits the next question.
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    page.on("pageerror", e => console.log("[pageerror]", e.message.slice(0, 200)));

    // One-time setup: navigate, set profile, land on Ask Pulse
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate((profile) => {
        try { window.localStorage.clear(); } catch { /* swallow */ }
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        window.localStorage.setItem("pulseplay:active-surface", "ask-pulse");
        window.localStorage.setItem("pulseplay:default-landing-surface", "ask-pulse");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile;
        ex.connectionMode = "proxy";
        ex.apiBaseUrl = window.location.origin + "/api";
        window.localStorage.setItem(k, JSON.stringify(ex));
    }, PROFILE);
    await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(2000);

    try {
        for (let i = 0; i < QUESTIONS.length; i++) {
            const question = QUESTIONS[i];
            console.log(`\n[${i + 1}/${QUESTIONS.length}] "${question}"`);

            try {
                await banner(page, `[${i + 1}/${QUESTIONS.length}] GENIE · "${question}" · ready`, "#06b6d4");

                const composer = page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first();
                if (await composer.count() === 0) {
                    console.log("  no composer found"); results.push({ question, verdict: "FAIL", reason: "no-composer" });
                    await safeScreenshot(page, `${String(i + 1).padStart(2, "0")}-no-composer.png`);
                    continue;
                }
                await composer.fill(question);
                await page.waitForTimeout(400);

                const send = page.locator("button.gn-send, button.pp-ai-sidebar__ask").first();
                if (await send.count() === 0) {
                    console.log("  no send button"); results.push({ question, verdict: "FAIL", reason: "no-send" });
                    continue;
                }

                const tSubmit = Date.now();
                await send.click();
                await banner(page, `[${i + 1}/${QUESTIONS.length}] submitting to Genie…`, "#06b6d4");

                // Genie is LLM-backed; give it up to 180s (some complex
                // queries take >60s; user feedback: timeouts were too short).
                let completedMs = null;
                let hasTable = false;
                let answerText = "";
                const deadline = tSubmit + 180_000;
                while (Date.now() < deadline) {
                    const probe = await page.evaluate(() => {
                        const msg = document.querySelectorAll(".gn-msg--assistant, [data-testid^=\"pp-ai-entry-\"]");
                        const last = msg[msg.length - 1];
                        if (!last) return null;
                        const text = (last.textContent || "").trim();
                        const tbl = last.querySelector("table");
                        const tableRows = tbl ? tbl.querySelectorAll("tbody tr, tr").length : 0;
                        const hasTable = tableRows >= 1;
                        const hasProgress = !!last.querySelector(".gn-chat-progress, .gn-progress-active");
                        const isError = /could not complete this request|share the support code|drafting the briefing|sorry, I (?:can'?t|cannot)|something went wrong/i.test(text);
                        return { len: text.length, hasTable, tableRows, hasProgress, isError, text: text.slice(0, 400) };
                    });
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
                    await page.waitForTimeout(300);
                }

                await page.waitForTimeout(2500);
                const verdict = (completedMs != null && hasTable) ? "PASS" : (completedMs != null && answerText.length > 80 ? "PASS-NO-TABLE" : "FAIL");
                await banner(page, `[${i + 1}/${QUESTIONS.length}] ${verdict} · ${completedMs ?? "—"}ms · ${hasTable ? "table✓" : "text-only"}`, verdict === "PASS" ? "#10b981" : verdict === "PASS-NO-TABLE" ? "#f59e0b" : "#ef4444");
                await safeScreenshot(page, `${String(i + 1).padStart(2, "0")}-${verdict.toLowerCase()}.png`);

                console.log(`  ${verdict}  completed=${completedMs ?? "—"}ms hasTable=${hasTable}`);
                console.log(`     preview: ${answerText.slice(0, 160).replace(/\n/g, " ↵ ")}`);
                results.push({ question, verdict, completedMs, hasTable, preview: answerText.slice(0, 240) });

                // Give Vite a breather between questions; don't tear down the context.
                await page.waitForTimeout(1500);
            } catch (iterErr) {
                console.log(`  [iter error] ${iterErr?.message?.slice(0, 200) || iterErr}`);
                results.push({ question, verdict: "FAIL", reason: "iter-exception", error: iterErr?.message?.slice(0, 200) });
            }
        }
    } finally {
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }

    console.log("\n=== Summary ===");
    for (const r of results) {
        console.log(`${r.verdict.padEnd(15)} ${r.completedMs ?? "—"}ms  ${r.question}`);
    }
    const pass = results.filter(r => r.verdict === "PASS").length;
    const passNoTable = results.filter(r => r.verdict === "PASS-NO-TABLE").length;
    const fail = results.filter(r => r.verdict === "FAIL").length;
    console.log(`\n[totals] ${pass} PASS · ${passNoTable} PASS-NO-TABLE · ${fail} FAIL  (of ${results.length})`);
    await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify({ pass, passNoTable, fail, total: results.length, results }, null, 2));
    console.log(`[done] artifacts → ${OUT_DIR}`);
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
