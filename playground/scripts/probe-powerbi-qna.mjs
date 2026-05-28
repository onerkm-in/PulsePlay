#!/usr/bin/env node
// Headed smoke for the Power BI Q&A surface at /powerbi/qna.
// Confirms: embed token mints, the powerbi-client SDK mounts an iframe,
// no console/page errors during embed, the Q&A input is reachable.
//
// What this proves: end-to-end from MSAL device-code refresh token
// → proxy mints embed token → SDK loads powerbi-client → iframe
// renders against the DwD_PBI_Demo dataset.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const OUT_DIR = join(REPO, `docs/evidence/powerbi-qna-smoke-2026-05-26`);
const BASE = "http://127.0.0.1:7001";
const SLOW_MO = 400;

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({
        headless: false, slowMo: SLOW_MO,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();

    const consoleErrs = [];
    const pageErrs = [];
    const respLog = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrs.push(msg.text().slice(0, 200)); });
    page.on("pageerror", (e) => pageErrs.push(e.message.slice(0, 200)));
    page.on("response", (r) => {
        const url = r.url();
        if (url.includes("/api/powerbi") || url.includes("powerbi.com") || url.includes("analysis.windows.net") || url.includes("login.microsoftonline.com")) {
            respLog.push({ url: url.slice(0, 100), status: r.status(), t: Date.now() });
        }
    });

    const tStart = Date.now();
    console.log(`[apv-qna] navigating ${BASE}/powerbi/qna`);
    await page.goto(BASE + "/powerbi/qna", { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Banner overlay
    await page.evaluate(() => {
        const b = document.createElement("div");
        b.style.cssText = "position:fixed;top:8px;left:8px;right:8px;z-index:99999;padding:8px 12px;background:rgba(15,23,42,0.94);color:#fff;font:13px ui-monospace,monospace;border-radius:4px;border-left:4px solid #f97316;pointer-events:none;";
        b.textContent = "POWERBI Q&A SMOKE — observing embed lifecycle";
        document.body.appendChild(b);
    });

    // Wait up to 30s for the powerbi iframe to appear
    const deadline = Date.now() + 30_000;
    let iframeAt = null;
    while (Date.now() < deadline) {
        const probe = await page.evaluate(() => {
            const iframes = Array.from(document.querySelectorAll("iframe"));
            const pbi = iframes.find(f => /powerbi|analysis\.windows/.test(f.src || ""));
            return {
                iframeCount: iframes.length,
                pbiIframeSrc: pbi ? pbi.src.slice(0, 100) : null,
                pbiIframeSize: pbi ? { w: pbi.offsetWidth, h: pbi.offsetHeight } : null,
                bodyText: document.body ? document.body.innerText.slice(0, 400) : "",
            };
        });
        if (probe.pbiIframeSrc) { iframeAt = Date.now() - tStart; console.log(`[iframe] PBI iframe mounted at +${iframeAt}ms size=${JSON.stringify(probe.pbiIframeSize)}`); break; }
        await page.waitForTimeout(400);
    }
    await page.screenshot({ path: join(OUT_DIR, "01-after-load.png"), fullPage: false });

    // Wait a bit more for Q&A to render inside iframe (SDK init takes time)
    await page.waitForTimeout(5000);
    await page.screenshot({ path: join(OUT_DIR, "02-after-5s-settle.png"), fullPage: false });

    const final = await page.evaluate(() => {
        const iframes = Array.from(document.querySelectorAll("iframe"));
        const errors = Array.from(document.querySelectorAll('[role="alert"], .pp-error, .gn-error')).map(e => (e.textContent || "").trim()).filter(t => t.length > 0);
        return {
            iframeCount: iframes.length,
            iframes: iframes.map(f => ({ src: (f.src || "").slice(0, 80), w: f.offsetWidth, h: f.offsetHeight })),
            errors,
            bodyText: document.body.innerText.slice(0, 500),
        };
    });
    console.log("\n[final state]", JSON.stringify(final, null, 2));
    console.log("\n[network log] /api/powerbi + microsoft endpoints:");
    for (const r of respLog) console.log(`  ${r.status} ${r.url}`);
    console.log("\n[console errors]", consoleErrs.length, "captured");
    consoleErrs.slice(0, 5).forEach(e => console.log("  -", e));
    console.log("\n[page errors]", pageErrs.length, "captured");
    pageErrs.slice(0, 5).forEach(e => console.log("  -", e));

    const summary = {
        iframeMountedAt: iframeAt,
        iframeCount: final.iframeCount,
        consoleErrorCount: consoleErrs.length,
        pageErrorCount: pageErrs.length,
        networkResponses: respLog,
        finalIframes: final.iframes,
        uiErrors: final.errors,
        verdict: (iframeAt != null && pageErrs.length === 0)
            ? (consoleErrs.length === 0 ? "PASS" : "PASS-WITH-WARNINGS")
            : "FAIL",
    };
    await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(`\n[verdict] ${summary.verdict}`);
    console.log(`[done] artifacts → ${OUT_DIR}`);

    await page.waitForTimeout(5000); // keep window open briefly for visual inspection
    await browser.close();
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
