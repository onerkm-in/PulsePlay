#!/usr/bin/env node
// Validate the Power BI report VISUAL render in the Dashboard tab (unverified #3:
// "token minted ≠ rendered"). Mints a fresh embed token via the proxy, seeds
// vendor=powerbi + the backend-issued embed config, loads the Dashboard, and
// confirms the powerbi-client SDK embeds + loads the report (iframe on
// app.powerbi.com, no adapter error). Headed.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/pbi-render/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const PROFILE = "powerbi-dwd";
const GROUP_ID = "7bb52a2a-5028-4887-b8ec-7d13e386da93";
const REPORT_ID = "95d196a1-9d2a-4ebd-a222-22fae6bc0149"; // SalesPerformance

async function banner(page, text, color = "#06b6d4") {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__pbi__"); if (!b) { b = document.createElement("div"); b.id = "__pbi__"; document.body.appendChild(b); }
        Object.assign(b.style, { position: "fixed", top: "8px", left: "8px", right: "8px", zIndex: "99999", padding: "10px 14px", background: "rgba(15,23,42,0.95)", color: "#fff", font: "14px ui-monospace", borderRadius: "6px", pointerEvents: "none", borderLeft: `5px solid ${color}` });
        b.textContent = text;
    }, { text, color });
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 250, args: ["--window-position=50,30", "--window-size=1580,1090"] });
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 940 } });
    const page = await ctx.newPage();
    const consoleErrs = [];
    page.on("console", m => { if (m.type() === "error") consoleErrs.push(m.text().slice(0, 200)); });
    page.on("pageerror", e => consoleErrs.push("[pageerror] " + e.message.slice(0, 200)));

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });

    // 1. Mint a fresh embed token via the proxy (through the Vite /api proxy).
    await banner(page, "Power BI render · minting embed token via the proxy (service principal)…", "#06b6d4");
    const mint = await page.evaluate(async ({ groupId, reportId, profile }) => {
        try {
            const r = await fetch(`${location.origin}/api/assistant/embed-token/powerbi`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ groupId, reportId, permissions: "View", assistantProfile: profile }),
            });
            const d = await r.json().catch(() => ({}));
            return { ok: r.ok, status: r.status, embedUrl: d.embedUrl, hasToken: !!d.embedToken, tokenLen: (d.embedToken || "").length, error: d.error };
        } catch (e) { return { ok: false, error: String(e) }; }
    }, { groupId: GROUP_ID, reportId: REPORT_ID, profile: PROFILE });
    console.log("mint:", JSON.stringify({ ...mint, embedUrl: (mint.embedUrl || "").slice(0, 80) }));
    if (!mint.ok || !mint.hasToken || !mint.embedUrl) { console.log(`\nVERDICT: FAIL — token mint failed: ${mint.status} ${mint.error || ""}`); await browser.close(); return; }

    // 2. Seed vendor=powerbi + the backend-issued embed config, then reload.
    await page.evaluate(async ({ groupId, reportId, profile }) => {
        const r = await fetch(`${location.origin}/api/assistant/embed-token/powerbi`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId, reportId, permissions: "View", assistantProfile: profile }) });
        const d = await r.json();
        localStorage.setItem("pulseplay:bi-vendor", "powerbi");
        localStorage.setItem("pulseplay:bi-embed-config", JSON.stringify({ type: "report", mode: "backend-issued", embedMode: "backend", tokenType: "Embed", id: reportId, groupId, embedUrl: d.embedUrl, accessToken: d.embedToken, permissions: "View" }));
        // also persist the AI profile so the shell boots cleanly
        const k = "pulseplay:visual-settings:genieSettings"; const ex = JSON.parse(localStorage.getItem(k) || "{}");
        ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api"; localStorage.setItem(k, JSON.stringify(ex));
    }, { groupId: GROUP_ID, reportId: REPORT_ID, profile: PROFILE });

    await page.reload({ waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(2500);

    // 3. Go to Dashboard
    await banner(page, "Power BI render · opening Dashboard — the SDK should embed + load the report…", "#06b6d4");
    const dash = page.locator("button", { hasText: /^Dashboard$/i });
    for (let i = 0; i < await dash.count(); i++) { const b = dash.nth(i); if (await b.isVisible().catch(() => false)) { await b.click(); break; } }
    await page.waitForTimeout(3000);

    // 4. Wait for the powerbi-client iframe to appear + load the report
    let frame = null;
    const dl = Date.now() + 30_000;
    while (Date.now() < dl) {
        frame = await page.evaluate(() => {
            const ifr = Array.from(document.querySelectorAll("iframe")).find(f => /powerbi\.com/.test(f.getAttribute("src") || "") || /powerbi/.test(f.className || "") || f.closest("[data-bi-vendor='powerbi'], .pbi, .powerbi"));
            const any = document.querySelector("iframe");
            return { hasPbiIframe: !!ifr, src: (ifr || any)?.getAttribute("src")?.slice(0, 90) || null, total: document.querySelectorAll("iframe").length };
        });
        if (frame.hasPbiIframe) break;
        await page.waitForTimeout(800);
    }
    console.log("dashboard iframe:", JSON.stringify(frame));
    await page.waitForTimeout(8000); // let the report render inside the iframe
    await page.screenshot({ path: join(OUT_DIR, "01-pbi-dashboard.png") }).catch(() => {});

    const overlay = await page.evaluate(() => /Failed to embed powerbi|eventName must be one of/i.test(document.body.textContent || ""));
    const errText = consoleErrs.filter(e => /powerbi|embed|token|TokenExpired|403|401|capacity/i.test(e));
    const verdict = (frame && frame.hasPbiIframe && !overlay) ? "PASS" : "FAIL";
    console.log(`\nVERDICT: ${verdict} (powerbi iframe present=${frame?.hasPbiIframe}, iframes=${frame?.total}, embed-error-overlay=${overlay})`);
    if (errText.length) { console.log("PBI-related console errors:"); errText.slice(0, 8).forEach(e => console.log("  " + e)); }
    await page.waitForTimeout(2500);
    await ctx.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    console.log(`[done] → ${OUT_DIR}`);
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
