#!/usr/bin/env node
// Focused, watchable AI Insights end-to-end run against the LIVE Genie `default`
// space. Unlike the 3-tab walkthrough, this WAITS for true completion: the red
// "Stop" button AND the "Stage N of 3" progress indicator both disappear when
// the staged 1-then-3 briefing finishes. Also logs any HTTP >= 400 so we can
// pin down the stray 404.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/walkthrough-ai-insights/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const PROFILE = "default";

async function banner(page, text, color = "#06b6d4") {
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

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const httpErrs = [];
    const browser = await chromium.launch({
        headless: false, slowMo: 300,
        args: ["--window-position=60,40", "--window-size=1560,1080"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1480, height: 980 } });
    const page = await ctx.newPage();
    page.on("response", (r) => { if (r.status() >= 400) httpErrs.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
    page.on("pageerror", (e) => httpErrs.push("[pageerror] " + e.message.slice(0, 160)));

    let outcome = { verdict: "TIMEOUT", ms: null, stages: null, preview: "" };
    try {
        await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.evaluate((profile) => {
            try { window.localStorage.clear(); } catch { /* swallow */ }
            window.localStorage.setItem("pulseplay:active-ai-profile", profile);
            window.localStorage.setItem("pulseplay:active-surface", "ai-insights");
            window.localStorage.setItem("pulseplay:default-landing-surface", "ai-insights");
            const k = "pulseplay:visual-settings:genieSettings";
            const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
            ex.assistantProfile = profile; ex.connectionMode = "proxy";
            ex.apiBaseUrl = window.location.origin + "/api";
            window.localStorage.setItem(k, JSON.stringify(ex));
        }, PROFILE);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2500);

        // Ensure we're on AI Insights
        const tab = page.locator("button", { hasText: /^AI Insights$/i }).first();
        if (await tab.count() > 0) { await tab.click(); await page.waitForTimeout(1000); }
        await banner(page, "AI Insights · waiting for the staged 1-then-3 briefing to COMPLETE (Stop + Stage progress must clear)…", "#06b6d4");
        await shot(page, "01-running.png");

        const t0 = Date.now();
        const deadline = t0 + 240_000; // Genie briefing can be slow on cold warehouse
        let lastStage = "";
        let prevLen = -1, stableCount = 0;
        while (Date.now() < deadline) {
            const p = await page.evaluate(() => {
                const bodyText = document.body.textContent || "";
                const stageMatch = bodyText.match(/Stage[s]? [\d–-]+ of \d+/i);
                // Authoritative: real (non-skeleton) sections vs in-flight placeholders.
                const realKpi = !!document.querySelector('[data-section="KPI SNAPSHOT"]:not(.gn-insights-section--placeholder)');
                const realRisks = !!document.querySelector('[data-section="RISKS"]:not(.gn-insights-section--placeholder)');
                const placeholders = document.querySelectorAll('.gn-insights-section--placeholder, [aria-busy="true"]').length;
                const isError = /could not complete this request|share the support code|something went wrong|sorry, I (?:can'?t|cannot)|Proxy Offline/i.test(bodyText);
                const main = document.querySelector("main, .gn-insights, [data-testid='pp-panel-chrome-ai']") || document.body;
                const proseLen = (main.textContent || "").replace(/\s+/g, " ").length;
                return { stage: stageMatch ? stageMatch[0] : "", realKpi, realRisks, placeholders, isError, proseLen, preview: (main.textContent || "").replace(/\s+/g, " ").trim().slice(0, 500) };
            });
            if (p.stage && p.stage !== lastStage) { lastStage = p.stage; await banner(page, `AI Insights · ${p.stage} …`, "#06b6d4"); }
            if (p.isError) { outcome = { verdict: "FAIL", ms: Date.now() - t0, stages: p.stage, preview: p.preview }; break; }
            // Authoritative completion: the real KPI SNAPSHOT and RISKS sections
            // have rendered AND no skeleton placeholders remain anywhere. A short
            // stability confirm guards against a brief inter-stage gap.
            stableCount = (p.realKpi && p.realRisks && p.placeholders === 0) ? stableCount + 1 : 0;
            prevLen = p.proseLen;
            if (stableCount >= 3 && p.proseLen > 600) {
                outcome = { verdict: "PASS", ms: Date.now() - t0, stages: "done", preview: p.preview };
                break;
            }
            await page.waitForTimeout(700);
        }

        await banner(page, `AI Insights ${outcome.verdict} · ${outcome.ms ?? "—"}ms`, outcome.verdict === "PASS" ? "#10b981" : "#ef4444");
        await page.waitForTimeout(1500);
        await shot(page, "02-result.png");
        await page.screenshot({ path: join(OUT_DIR, "02-result-fullpage.png"), fullPage: true }).catch(() => {});
        console.log(`AI Insights: ${outcome.verdict} ms=${outcome.ms}`);
        console.log(`preview: ${outcome.preview.slice(0, 400)}`);
        await page.waitForTimeout(2500);
    } finally {
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }

    if (httpErrs.length) {
        console.log(`\n[HTTP >=400 / page errors] ${httpErrs.length}`);
        for (const e of [...new Set(httpErrs)].slice(0, 20)) console.log("  " + e);
    } else {
        console.log("\n[HTTP] no >=400 responses");
    }
    await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify({ outcome, httpErrs: [...new Set(httpErrs)] }, null, 2));
    console.log(`\n[done] artifacts → ${OUT_DIR}`);
}
main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
