#!/usr/bin/env node
// Dashboard BI previews — 4-state showcase for pitching:
//   1. Baseline: current Pulse Canvas empty state
//   2. Mock: Databricks AI/BI Dashboard rendered via DOM injection
//      (visual fidelity preview; not real data)
//   3. Real embed attempt: databricks-aibi adapter with workspace URL +
//      placeholder dashboardId — shows what the iframe path actually does
//   4. Settings: the BI surface mode toggle (auto/native/vendor)
//
// All 4 captured headed/visible at desktop 1440×900.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/dashboard-bi-previews-${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";

const DBX_WORKSPACE = "https://dbc-f88d29ce-4aa2.cloud.databricks.com";
const DBX_PLACEHOLDER_DASHBOARD_ID = "01ef0000-0000-0000-0000-000000000000";

async function banner(page, text, color = "#06b6d4") {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__dbx__");
        if (!b) {
            b = document.createElement("div");
            b.id = "__dbx__";
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

async function injectMockDatabricksDashboard(page) {
    return await page.evaluate(() => {
        // Replace Pulse Canvas empty state with a realistic Databricks AI/BI
        // dashboard mock. Targets the .gn-bi-empty or main dashboard container.
        const candidates = [
            ".gn-bi-empty", ".gn-bi-canvas", ".gn-bi-pane",
            ".pp-bi-pane", ".pp-dashboard-pane",
            "[data-testid='pp-bi-pane']", "[data-testid='gn-bi-canvas']",
        ];
        let target = null;
        for (const sel of candidates) {
            const el = document.querySelector(sel);
            if (el && el.offsetWidth > 100) { target = el; break; }
        }
        if (!target) {
            // Fallback: the main empty-state text container
            const buttons = Array.from(document.querySelectorAll("button"));
            const dashTab = buttons.find(b => /^dashboard$/i.test((b.textContent || "").trim()));
            if (dashTab) {
                const tabpanel = dashTab.closest("[role='tablist']")?.parentElement;
                target = tabpanel?.querySelector("div:last-child") || tabpanel;
            }
        }
        if (!target) {
            // Last resort — find any large empty container
            const all = Array.from(document.querySelectorAll("div"));
            target = all.find(d => /pulse canvas|embedded bi|ask pulse can render/i.test(d.textContent || "")) || document.body;
        }

        const html = `
        <div id="__mock_dbx__" style="font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;padding:16px;background:#f8f9fb;height:100%;overflow-y:auto;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #e1e4e8;">
            <div>
              <div style="font-size:18px;font-weight:600;color:#1c1e21;">Sales Performance · Q3 2026</div>
              <div style="font-size:12px;color:#6a737d;margin-top:2px;">Databricks AI/BI Dashboard · Unity Catalog Metric Views · Updated 2 min ago</div>
            </div>
            <div style="display:flex;gap:6px;">
              <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:#e8f5e9;color:#2e7d32;font-size:11px;font-weight:600;">● Connected</span>
              <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:#fff3e0;color:#e65100;font-size:11px;font-weight:600;">⚡ Live</span>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">
            ${[
                { label:"Total Sales", value:"$2,297,201", delta:"▲ +28.4%", tone:"#2e7d32", subtle:"vs Q2 2026" },
                { label:"Gross Margin", value:"12.7%", delta:"▼ -0.7pp", tone:"#c62828", subtle:"watch threshold" },
                { label:"Orders", value:"5,009", delta:"▲ +12.1%", tone:"#2e7d32", subtle:"unique orders" },
                { label:"Avg Order Value", value:"$458.61", delta:"▲ +6.3%", tone:"#2e7d32", subtle:"trailing 90d" },
            ].map(k => `
              <div style="background:white;border:1px solid #e1e4e8;border-radius:8px;padding:14px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
                <div style="font-size:11px;color:#6a737d;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">${k.label}</div>
                <div style="font-size:24px;font-weight:700;color:#1c1e21;margin-top:6px;">${k.value}</div>
                <div style="margin-top:4px;display:flex;align-items:center;gap:8px;">
                  <span style="color:${k.tone};font-size:12px;font-weight:600;">${k.delta}</span>
                  <span style="color:#959da5;font-size:11px;">${k.subtle}</span>
                </div>
              </div>
            `).join("")}
          </div>

          <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:16px;">
            <div style="background:white;border:1px solid #e1e4e8;border-radius:8px;padding:14px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <div style="font-size:13px;font-weight:600;color:#1c1e21;">Sales by Region · Last 12 Months</div>
                <div style="display:flex;gap:6px;font-size:11px;color:#6a737d;">
                  <span style="cursor:pointer;">Line</span><span>•</span><span style="cursor:pointer;color:#0366d6;font-weight:600;">Bar</span><span>•</span><span style="cursor:pointer;">Area</span>
                </div>
              </div>
              <svg viewBox="0 0 600 200" style="width:100%;height:200px;">
                <defs>
                  <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#0366d6" stop-opacity="0.8"/><stop offset="100%" stop-color="#0366d6" stop-opacity="0.3"/></linearGradient>
                </defs>
                ${["West","East","Central","South"].map((r,i) => {
                    const heights = [165, 145, 105, 80];
                    const x = 30 + i*140;
                    const h = heights[i];
                    return `<g><rect x="${x}" y="${180-h}" width="100" height="${h}" fill="url(#g1)" rx="3"/><text x="${x+50}" y="195" text-anchor="middle" font-size="11" fill="#6a737d">${r}</text><text x="${x+50}" y="${175-h}" text-anchor="middle" font-size="10" font-weight="600" fill="#1c1e21">$${[725,679,501,392][i]}K</text></g>`;
                }).join("")}
                <line x1="20" y1="180" x2="580" y2="180" stroke="#e1e4e8"/>
              </svg>
            </div>
            <div style="background:white;border:1px solid #e1e4e8;border-radius:8px;padding:14px;">
              <div style="font-size:13px;font-weight:600;color:#1c1e21;margin-bottom:10px;">Top Categories</div>
              ${[
                  {n:"Technology", v:"$836K", pct:36},
                  {n:"Furniture",  v:"$742K", pct:32},
                  {n:"Office Supplies", v:"$719K", pct:31},
              ].map(c => `
                <div style="margin-bottom:10px;">
                  <div style="display:flex;justify-content:space-between;font-size:12px;color:#1c1e21;"><span>${c.n}</span><span style="font-weight:600;">${c.v}</span></div>
                  <div style="background:#f1f3f5;border-radius:4px;height:6px;margin-top:4px;overflow:hidden;"><div style="background:#0366d6;height:100%;width:${c.pct}%;border-radius:4px;"></div></div>
                </div>
              `).join("")}
            </div>
          </div>

          <div style="background:white;border:1px solid #e1e4e8;border-radius:8px;padding:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <div style="font-size:13px;font-weight:600;color:#1c1e21;">Recent Orders · Sample Superstore</div>
              <span style="font-size:11px;color:#6a737d;">via Unity Catalog Metric View · gross_revenue_v3</span>
            </div>
            <table style="width:100%;font-size:12px;border-collapse:collapse;">
              <thead><tr style="text-align:left;color:#6a737d;border-bottom:1px solid #e1e4e8;">
                <th style="padding:6px 4px;">ORDER ID</th><th style="padding:6px 4px;">CUSTOMER</th><th style="padding:6px 4px;">REGION</th><th style="padding:6px 4px;">CATEGORY</th><th style="padding:6px 4px;text-align:right;">SALES</th><th style="padding:6px 4px;text-align:right;">MARGIN</th>
              </tr></thead>
              <tbody>
                ${[
                    ["CA-2026-145317","Sean Miller","West","Technology","$23,661.23","19.4%"],
                    ["CA-2026-145201","Tamara Chand","East","Furniture","$19,052.22","14.1%"],
                    ["CA-2026-144982","Raymond Buch","Central","Office Supplies","$15,117.34","11.8%"],
                    ["CA-2026-144856","Tom Ashbrook","West","Technology","$14,595.62","17.2%"],
                    ["CA-2026-144712","Adrian Barton","South","Furniture","$13,200.55","8.9%"],
                ].map(row => `<tr style="border-bottom:1px solid #f6f8fa;"><td style="padding:6px 4px;font-family:monospace;color:#0366d6;">${row[0]}</td><td style="padding:6px 4px;">${row[1]}</td><td style="padding:6px 4px;">${row[2]}</td><td style="padding:6px 4px;">${row[3]}</td><td style="padding:6px 4px;text-align:right;font-weight:600;">${row[4]}</td><td style="padding:6px 4px;text-align:right;color:#2e7d32;">${row[5]}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>

          <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#6a737d;">
            <span>Powered by Databricks AI/BI · Unity Catalog Metric Views · Embedded via @databricks/aibi-client</span>
            <span>PulsePlay · Hybrid Orchestrator-Deployer · Trust: Governed</span>
          </div>
        </div>`;

        target.innerHTML = html;
        return { targetTag: target.tagName, targetClass: target.className, injectedBytes: html.length };
    });
}

async function attemptRealDbxEmbed(page, workspace, dashboardId) {
    return await page.evaluate(({ workspace, dashboardId }) => {
        const candidates = [
            ".gn-bi-empty", ".gn-bi-canvas", ".gn-bi-pane",
            ".pp-bi-pane", ".pp-dashboard-pane",
        ];
        let target = null;
        for (const sel of candidates) {
            const el = document.querySelector(sel);
            if (el && el.offsetWidth > 100) { target = el; break; }
        }
        if (!target) target = document.querySelector("div:has([role='tabpanel'])") || document.body;

        const embedUrl = `${workspace}/embed/dashboardsv3/${dashboardId}`;
        target.innerHTML = `
        <div style="padding:12px;height:100%;display:flex;flex-direction:column;">
          <div style="font-size:12px;color:#6a737d;margin-bottom:8px;padding:8px 10px;background:#fff3e0;border-left:3px solid #e65100;border-radius:4px;">
            <strong>Real Databricks AI/BI embed attempt</strong> · iframe pointed at <code style="font-family:monospace;">${embedUrl}</code><br>
            Without a real published dashboard ID + auth, expect Databricks login screen or 404 — the iframe MOUNTING is the proof point.
          </div>
          <iframe src="${embedUrl}" style="width:100%;flex:1;border:1px solid #e1e4e8;border-radius:6px;" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
        </div>`;
        return { embedUrl };
    }, { workspace, dashboardId });
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({
        headless: false, slowMo: 350,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const pageErrs = [];
    page.on("pageerror", (e) => pageErrs.push(e.message.slice(0, 180)));

    try {
        await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.evaluate(() => {
            try { window.localStorage.clear(); } catch { /* swallow */ }
            window.localStorage.setItem("pulseplay:active-ai-profile", "default");
            const k = "pulseplay:visual-settings:genieSettings";
            const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
            ex.assistantProfile = "default";
            ex.connectionMode = "proxy";
            ex.apiBaseUrl = window.location.origin + "/api";
            window.localStorage.setItem(k, JSON.stringify(ex));
        });

        // ─── Preview 1: Baseline Pulse Canvas ──────────────────────────────
        console.log("\n[1/4] Baseline: Pulse Canvas empty state");
        await page.goto(BASE + "/?surface=dashboard", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2500);
        await banner(page, "Preview 1/4 · Baseline: Pulse Canvas empty state", "#6a737d");
        await page.screenshot({ path: join(OUT_DIR, "01-baseline-pulse-canvas.png"), fullPage: false });
        console.log("  ✓ captured baseline");

        // ─── Preview 2: Mocked Databricks AI/BI Dashboard ──────────────────
        console.log("\n[2/4] Mocked Databricks AI/BI Dashboard");
        const mockInfo = await injectMockDatabricksDashboard(page);
        console.log(`  injected mock — target=${mockInfo.targetTag}.${mockInfo.targetClass} bytes=${mockInfo.injectedBytes}`);
        await page.waitForTimeout(1500);
        await banner(page, "Preview 2/4 · Mocked Databricks AI/BI · pitch-ready visual", "#0366d6");
        await page.waitForTimeout(800);
        await page.screenshot({ path: join(OUT_DIR, "02-mock-databricks-aibi.png"), fullPage: false });
        await page.screenshot({ path: join(OUT_DIR, "02-mock-databricks-aibi-fullpage.png"), fullPage: true });
        console.log("  ✓ captured mock");

        // ─── Preview 3: Real Databricks AI/BI embed attempt ────────────────
        console.log("\n[3/4] Real Databricks AI/BI embed attempt");
        // Reset to clean Dashboard state first
        await page.goto(BASE + "/?surface=dashboard", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2000);
        const embedInfo = await attemptRealDbxEmbed(page, DBX_WORKSPACE, DBX_PLACEHOLDER_DASHBOARD_ID);
        console.log(`  iframe src: ${embedInfo.embedUrl}`);
        await page.waitForTimeout(6000); // give iframe time to load/fail
        await banner(page, "Preview 3/4 · Real Databricks AI/BI iframe attempt (placeholder ID)", "#e65100");
        await page.waitForTimeout(800);
        await page.screenshot({ path: join(OUT_DIR, "03-real-databricks-attempt.png"), fullPage: false });
        console.log("  ✓ captured real embed attempt");

        // ─── Preview 4: Settings → BI surface mode toggle ──────────────────
        console.log("\n[4/4] Settings → BI surface mode toggle");
        await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2500);
        await banner(page, "Preview 4/4 · Settings → BI surface mode (auto / native / vendor)", "#a855f7");
        await page.screenshot({ path: join(OUT_DIR, "04-settings.png"), fullPage: false });
        await page.screenshot({ path: join(OUT_DIR, "04-settings-fullpage.png"), fullPage: true });
        console.log("  ✓ captured settings");

        await page.waitForTimeout(2500);
    } finally {
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }

    await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify({
        previews: [
            { id: "baseline", file: "01-baseline-pulse-canvas.png" },
            { id: "mock-databricks-aibi", file: "02-mock-databricks-aibi.png", fullpage: "02-mock-databricks-aibi-fullpage.png" },
            { id: "real-databricks-attempt", file: "03-real-databricks-attempt.png" },
            { id: "settings-bi-surface-mode", file: "04-settings.png", fullpage: "04-settings-fullpage.png" },
        ],
        pageErrs,
    }, null, 2));
    console.log(`\n[done] artifacts → ${OUT_DIR}`);
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
