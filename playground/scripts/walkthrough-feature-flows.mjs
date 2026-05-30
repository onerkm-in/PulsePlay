#!/usr/bin/env node
// Watchable, slow-mo walkthrough of the three feature flows against the LIVE
// local stack (Vite 7001 → proxy 7000 → Databricks Genie `default` space).
//
//   1. AI Insights  — land on the tab, let runInsights() auto-fire, watch the
//                     multi-section briefing render (Genie-backed).
//   2. Ask Pulse    — ask a couple of Genie questions, watch submit→poll→render.
//   3. Dashboard    — observe the Dashboard tab state (native canvas today;
//                     Power BI visual render is exercised by a separate run).
//
// Headed + slowMo so a human can follow along. On-screen banner narrates each
// step; screenshots + summary.json land under docs/evidence.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/walkthrough-feature-flows/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const PROFILE = "default"; // Genie space — Sales Team per proxy/config.json

async function banner(page, text, color = "#10b981") {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__wt__");
        if (!b) {
            b = document.createElement("div");
            b.id = "__wt__";
            Object.assign(b.style, {
                position: "fixed", top: "8px", left: "8px", right: "8px", zIndex: "99999",
                padding: "10px 14px", background: "rgba(15,23,42,0.95)", color: "#fff",
                font: "14px ui-monospace, monospace", borderRadius: "6px",
                pointerEvents: "none", borderLeft: `5px solid ${color}`,
            });
            document.body.appendChild(b);
        }
        b.textContent = text;
    }, { text, color });
}

async function shot(page, name) {
    try { await page.screenshot({ path: join(OUT_DIR, name), fullPage: false }); }
    catch (err) { console.warn(`  [warn] screenshot skipped: ${err?.message || err}`); }
}

async function clickTab(page, label) {
    const tab = page.locator("button", { hasText: new RegExp(`^${label}$`, "i") }).first();
    if (await tab.count() === 0) return false;
    await tab.click();
    await page.waitForTimeout(1200);
    return true;
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const results = [];
    const consoleErrs = [];
    const browser = await chromium.launch({
        headless: false, slowMo: 350,
        args: ["--window-position=60,40", "--window-size=1560,1080"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1480, height: 980 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => consoleErrs.push("[pageerror] " + e.message.slice(0, 200)));
    page.on("console", (m) => { if (m.type() === "error") consoleErrs.push("[console.error] " + m.text().slice(0, 200)); });

    try {
        // ── Setup: configure profile=default, proxy mode ──────────────────
        await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.evaluate((profile) => {
            try { window.localStorage.clear(); } catch { /* swallow */ }
            window.localStorage.setItem("pulseplay:active-ai-profile", profile);
            window.localStorage.setItem("pulseplay:active-surface", "ai-insights");
            window.localStorage.setItem("pulseplay:default-landing-surface", "ai-insights");
            const k = "pulseplay:visual-settings:genieSettings";
            const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
            ex.assistantProfile = profile;
            ex.connectionMode = "proxy";
            ex.apiBaseUrl = window.location.origin + "/api";
            window.localStorage.setItem(k, JSON.stringify(ex));
        }, PROFILE);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2500);
        await banner(page, "Walkthrough · profile=default (Genie · Sales Team) · proxy 7000 → Databricks", "#06b6d4");
        await shot(page, "00-loaded.png");

        // ── FLOW 1: AI Insights (auto-fires runInsights) ──────────────────
        console.log("\n[1] AI Insights — auto-briefing");
        await clickTab(page, "AI Insights");
        await banner(page, "FLOW 1/3 · AI Insights — waiting for the auto-briefing to render…", "#06b6d4");
        await shot(page, "01a-insights-start.png");

        const t1 = Date.now();
        let insights = { done: false, ms: null, len: 0, sections: 0, error: false, text: "" };
        const deadline1 = t1 + 180_000;
        while (Date.now() < deadline1) {
            const p = await page.evaluate(() => {
                const pane = document.querySelector(".gn-insights, .gn-insights-body, [data-testid='pp-panel-chrome-ai']") || document.body;
                const text = (pane.textContent || "").trim();
                const placeholder = !!document.querySelector(".gn-insights-placeholder");
                const progress = !!document.querySelector(".gn-progress-active, .gn-chat-progress, .gn-insights-running");
                const sections = document.querySelectorAll(".gn-insight-section, .gn-section, [data-section]").length;
                const isError = /could not complete this request|share the support code|sorry, I (?:can'?t|cannot)|something went wrong|failed to/i.test(text);
                return { len: text.length, placeholder, progress, sections, isError, text: text.slice(0, 300) };
            });
            if (p.isError) { insights = { done: true, ms: Date.now() - t1, len: p.len, sections: p.sections, error: true, text: p.text }; break; }
            if (!p.placeholder && !p.progress && (p.sections >= 1 || p.len > 600)) {
                insights = { done: true, ms: Date.now() - t1, len: p.len, sections: p.sections, error: false, text: p.text }; break;
            }
            await page.waitForTimeout(500);
        }
        const v1 = insights.error ? "FAIL" : insights.done ? "PASS" : "TIMEOUT";
        await banner(page, `FLOW 1/3 · AI Insights ${v1} · ${insights.ms ?? "—"}ms · ${insights.sections} sections`, v1 === "PASS" ? "#10b981" : "#ef4444");
        await page.waitForTimeout(1500);
        await shot(page, "01b-insights-result.png");
        console.log(`  ${v1} ms=${insights.ms} sections=${insights.sections} len=${insights.len}`);
        console.log(`  preview: ${insights.text.replace(/\n/g, " ↵ ").slice(0, 180)}`);
        results.push({ flow: "ai-insights", verdict: v1, ...insights });

        // ── FLOW 2: Ask Pulse (Genie chat) ────────────────────────────────
        console.log("\n[2] Ask Pulse — Genie chat");
        await clickTab(page, "Ask Pulse");
        await page.waitForTimeout(800);
        const questions = ["What is the total sales by region?", "Top 5 customers by total sales"];
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            await banner(page, `FLOW 2/3 · Ask Pulse — "${q}"`, "#06b6d4");
            const composer = page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first();
            if (await composer.count() === 0) { results.push({ flow: "ask-pulse", q, verdict: "FAIL", reason: "no-composer" }); await shot(page, `02-${i}-no-composer.png`); continue; }
            await composer.fill(q);
            await page.waitForTimeout(400);
            const send = page.locator("button.gn-send, button.pp-ai-sidebar__ask").first();
            if (await send.count() === 0) { results.push({ flow: "ask-pulse", q, verdict: "FAIL", reason: "no-send" }); continue; }
            const tq = Date.now();
            await send.click();
            await banner(page, `FLOW 2/3 · Ask Pulse — submitting to Genie…`, "#06b6d4");
            let r = { done: false, ms: null, hasTable: false, len: 0, error: false, text: "" };
            const dl = tq + 150_000;
            while (Date.now() < dl) {
                const p = await page.evaluate(() => {
                    const msg = document.querySelectorAll(".gn-msg--assistant, [data-testid^='pp-ai-entry-']");
                    const last = msg[msg.length - 1];
                    if (!last) return null;
                    const text = (last.textContent || "").trim();
                    const rows = last.querySelectorAll("table tbody tr, table tr").length;
                    const progress = !!last.querySelector(".gn-chat-progress, .gn-progress-active");
                    const isError = /could not complete this request|share the support code|sorry, I (?:can'?t|cannot)|something went wrong/i.test(text);
                    return { len: text.length, hasTable: rows >= 1, progress, isError, text: text.slice(0, 300) };
                });
                if (p && p.isError) { r = { done: true, ms: Date.now() - tq, hasTable: false, len: p.len, error: true, text: p.text }; break; }
                if (p && !p.progress && (p.len > 40 || p.hasTable)) { r = { done: true, ms: Date.now() - tq, hasTable: p.hasTable, len: p.len, error: false, text: p.text }; break; }
                await page.waitForTimeout(300);
            }
            const v = r.error ? "FAIL" : (r.done && r.hasTable) ? "PASS" : (r.done && r.len > 80) ? "PASS-NO-TABLE" : "TIMEOUT";
            await banner(page, `FLOW 2/3 · Ask Pulse ${v} · ${r.ms ?? "—"}ms · ${r.hasTable ? "table✓" : "text-only"}`, v.startsWith("PASS") ? "#10b981" : "#ef4444");
            await page.waitForTimeout(2000);
            await shot(page, `02-${i}-${v.toLowerCase()}.png`);
            console.log(`  [${i + 1}] ${v} ms=${r.ms} table=${r.hasTable} :: ${r.text.replace(/\n/g, " ↵ ").slice(0, 140)}`);
            results.push({ flow: "ask-pulse", q, verdict: v, ...r });
            await page.waitForTimeout(1200);
        }

        // ── FLOW 3: Dashboard (observe state) ─────────────────────────────
        console.log("\n[3] Dashboard — observe state");
        await clickTab(page, "Dashboard");
        await page.waitForTimeout(2500);
        await banner(page, "FLOW 3/3 · Dashboard — current state (native canvas; Power BI render is a separate run)", "#a855f7");
        const dash = await page.evaluate(() => {
            const iframe = document.querySelector("iframe");
            const empty = !!document.querySelector(".gn-bi-empty");
            const text = (document.querySelector(".gn-bi-pane, .gn-bi-canvas, [role='tabpanel']") || document.body).textContent || "";
            return { hasIframe: !!iframe, iframeSrc: iframe?.getAttribute("src") || null, empty, snippet: text.replace(/\s+/g, " ").trim().slice(0, 200) };
        });
        await shot(page, "03-dashboard.png");
        console.log(`  iframe=${dash.hasIframe} src=${dash.iframeSrc} empty=${dash.empty}`);
        console.log(`  snippet: ${dash.snippet}`);
        results.push({ flow: "dashboard", verdict: "OBSERVED", ...dash });

        await page.waitForTimeout(2500);
    } finally {
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }

    console.log("\n=== Summary ===");
    for (const r of results) console.log(`${(r.verdict || "?").padEnd(14)} ${r.flow}${r.q ? " · " + r.q : ""}`);
    if (consoleErrs.length) {
        console.log(`\n[console/page errors] ${consoleErrs.length}`);
        for (const e of consoleErrs.slice(0, 15)) console.log("  " + e);
    }
    await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify({ results, consoleErrs }, null, 2));
    console.log(`\n[done] artifacts → ${OUT_DIR}`);
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
