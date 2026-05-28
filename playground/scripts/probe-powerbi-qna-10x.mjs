#!/usr/bin/env node
// 10-iteration regression on the Power BI Q&A iframe surface at /powerbi/qna.
// Each iteration: fresh browser context → navigate → wait for PBI iframe to
// mount → settle 4s → capture mount-time, console errors, page errors.
// Pass per iteration = iframe mounted AND zero page errors.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/powerbi-qna-10x-2026-05-26/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const ITERATIONS = 10;
const MOUNT_TIMEOUT_MS = 30_000;
const SETTLE_MS = 4_000;

async function safeScreenshot(page, filename) {
    try { await page.screenshot({ path: join(OUT_DIR, filename), fullPage: false }); }
    catch (err) { console.warn(`  [warn] screenshot skipped: ${err?.message || err}`); }
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({
        headless: false, slowMo: 200,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });

    const results = [];

    try {
        for (let i = 0; i < ITERATIONS; i++) {
            const n = i + 1;
            console.log(`\n[${n}/${ITERATIONS}] Q&A embed iteration`);

            const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
            const page = await ctx.newPage();
            const consoleErrs = [];
            const pageErrs = [];
            page.on("console", (m) => { if (m.type() === "error") consoleErrs.push(m.text().slice(0, 180)); });
            page.on("pageerror", (e) => pageErrs.push(e.message.slice(0, 180)));

            try {
                const tStart = Date.now();
                await page.goto(BASE + "/powerbi/qna", { waitUntil: "domcontentloaded", timeout: 30_000 });

                await page.evaluate((n) => {
                    const b = document.createElement("div");
                    b.style.cssText = "position:fixed;top:8px;left:8px;right:8px;z-index:99999;padding:8px 12px;background:rgba(15,23,42,0.94);color:#fff;font:13px ui-monospace,monospace;border-radius:4px;border-left:4px solid #f97316;pointer-events:none;";
                    b.textContent = `POWERBI Q&A SMOKE iter ${n}/10`;
                    document.body.appendChild(b);
                }, n);

                // Wait for PBI iframe to appear
                const deadline = Date.now() + MOUNT_TIMEOUT_MS;
                let iframeAt = null;
                let iframeSize = null;
                while (Date.now() < deadline) {
                    const probe = await page.evaluate(() => {
                        const iframes = Array.from(document.querySelectorAll("iframe"));
                        const pbi = iframes.find(f => /powerbi|analysis\.windows/.test(f.src || ""));
                        return pbi ? { src: pbi.src.slice(0, 80), w: pbi.offsetWidth, h: pbi.offsetHeight } : null;
                    });
                    if (probe) { iframeAt = Date.now() - tStart; iframeSize = { w: probe.w, h: probe.h }; break; }
                    await page.waitForTimeout(300);
                }

                // Settle window for SDK init inside iframe
                await page.waitForTimeout(SETTLE_MS);
                await safeScreenshot(page, `${String(n).padStart(2, "0")}-after-settle.png`);

                const verdict = (iframeAt != null && pageErrs.length === 0)
                    ? (consoleErrs.length === 0 ? "PASS" : "PASS-WITH-WARNINGS")
                    : "FAIL";

                console.log(`  ${verdict}  iframeAt=${iframeAt ?? "—"}ms  size=${JSON.stringify(iframeSize)}  consoleErrs=${consoleErrs.length}  pageErrs=${pageErrs.length}`);
                if (consoleErrs.length > 0) consoleErrs.slice(0, 2).forEach(e => console.log(`     console: ${e}`));
                if (pageErrs.length > 0) pageErrs.slice(0, 2).forEach(e => console.log(`     pageerr: ${e}`));

                results.push({
                    iter: n, verdict, iframeAt, iframeSize,
                    consoleErrCount: consoleErrs.length, pageErrCount: pageErrs.length,
                    consoleErrSample: consoleErrs.slice(0, 3),
                    pageErrSample: pageErrs.slice(0, 3),
                });
            } finally {
                await ctx.close().catch(() => undefined);
            }
        }
    } finally {
        await browser.close().catch(() => undefined);
    }

    console.log("\n=== Summary ===");
    for (const r of results) {
        console.log(`${r.verdict.padEnd(20)} iter${r.iter}  iframeAt=${r.iframeAt ?? "—"}ms  consoleErrs=${r.consoleErrCount}  pageErrs=${r.pageErrCount}`);
    }
    const pass = results.filter(r => r.verdict === "PASS").length;
    const passWarn = results.filter(r => r.verdict === "PASS-WITH-WARNINGS").length;
    const fail = results.filter(r => r.verdict === "FAIL").length;
    console.log(`\n[totals] ${pass} PASS, ${passWarn} PASS-WITH-WARNINGS, ${fail} FAIL  (of ${results.length})`);

    await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify({ pass, passWarn, fail, total: results.length, results }, null, 2));
    console.log(`[done] artifacts → ${OUT_DIR}`);
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
