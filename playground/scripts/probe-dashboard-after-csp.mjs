#!/usr/bin/env node
// Post-CSP-fix probe — verify Databricks embed iframe MOUNTS (not blocked)
// AND capture Settings → BI Setup detail for the pitch deck.
//
// What changed: index.html CSP now allows
//   https://*.cloud.databricks.com + https://*.azuredatabricks.net
// in frame-src + connect-src. Real auth/dashboard ID still needed for
// CONTENT, but iframe-MOUNTING should no longer be silently blocked.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/dashboard-after-csp-${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";

const DBX_WORKSPACE = "https://dbc-f88d29ce-4aa2.cloud.databricks.com";
const DBX_PLACEHOLDER_DASHBOARD_ID = "01ef0000-0000-0000-0000-000000000000";

async function banner(page, text, color = "#06b6d4") {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__post__");
        if (!b) {
            b = document.createElement("div");
            b.id = "__post__";
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

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({
        headless: false, slowMo: 350,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const cspViolations = [];
    const consoleErrs = [];
    page.on("console", (m) => {
        const text = m.text();
        if (m.type() === "error") consoleErrs.push(text.slice(0, 220));
        if (/csp|content security policy|refused to frame|refused to connect/i.test(text)) cspViolations.push(text.slice(0, 220));
    });
    page.on("pageerror", (e) => consoleErrs.push(`PAGEERR: ${e.message.slice(0, 200)}`));

    try {
        // ─── Setup ─────────────────────────────────────────────────────────
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

        // ─── Capture 1: Real Databricks embed AFTER CSP fix ────────────────
        console.log("\n[1/3] Real Databricks AI/BI embed AFTER CSP fix");
        await page.goto(BASE + "/?surface=dashboard", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2000);
        cspViolations.length = 0; // reset before injection
        const embed = await page.evaluate(({ workspace, dashboardId }) => {
            const candidates = [".gn-bi-empty", ".gn-bi-canvas", ".gn-bi-pane", ".pp-bi-pane", ".pp-dashboard-pane"];
            let target = null;
            for (const sel of candidates) {
                const el = document.querySelector(sel);
                if (el && el.offsetWidth > 100) { target = el; break; }
            }
            if (!target) {
                const all = Array.from(document.querySelectorAll("div"));
                target = all.find(d => /pulse canvas|embedded bi|ask pulse can render/i.test(d.textContent || "")) || document.body;
            }
            const embedUrl = `${workspace}/embed/dashboardsv3/${dashboardId}`;
            target.innerHTML = `
            <div style="padding:12px;height:100%;display:flex;flex-direction:column;">
              <div style="font-size:12px;color:#0d6efd;margin-bottom:8px;padding:8px 10px;background:#e7f1ff;border-left:3px solid #0d6efd;border-radius:4px;">
                <strong>Post-CSP-fix · Real Databricks AI/BI iframe</strong> · pointed at <code style="font-family:monospace;">${embedUrl}</code><br>
                Iframe should now MOUNT (CSP allows *.cloud.databricks.com). Content will be Databricks login OR 404 — placeholder ID has no real dashboard.
              </div>
              <iframe id="__dbx_iframe__" src="${embedUrl}" style="width:100%;flex:1;border:1px solid #e1e4e8;border-radius:6px;background:#fafbfc;" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"></iframe>
            </div>`;
            return { embedUrl };
        }, { workspace: DBX_WORKSPACE, dashboardId: DBX_PLACEHOLDER_DASHBOARD_ID });
        console.log(`  iframe src: ${embed.embedUrl}`);
        await page.waitForTimeout(8000); // longer wait — iframe may take time to load real DBX page
        await banner(page, "Capture 1/3 · Databricks embed POST-CSP-fix · iframe should mount now", "#16a34a");
        await page.waitForTimeout(800);
        await page.screenshot({ path: join(OUT_DIR, "01-dbx-embed-post-csp.png"), fullPage: false });

        // Inspect what the iframe ended up loading
        const iframeState = await page.evaluate(() => {
            const f = document.getElementById("__dbx_iframe__");
            if (!f) return { found: false };
            return {
                found: true,
                src: f.src,
                width: f.offsetWidth,
                height: f.offsetHeight,
                // Can we read contentDocument? (cross-origin will throw — that's a SIGN the iframe LOADED something)
                contentAccessible: (() => {
                    try { return !!f.contentDocument; } catch { return "cross-origin-blocked-which-means-iframe-loaded"; }
                })(),
            };
        });
        console.log(`  iframe state: ${JSON.stringify(iframeState)}`);
        console.log(`  CSP violations during this step: ${cspViolations.length}`);
        cspViolations.forEach(v => console.log(`    - ${v}`));

        // ─── Capture 2: Settings page top view ─────────────────────────────
        console.log("\n[2/3] Settings page — top view");
        await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2500);
        await banner(page, "Capture 2/3 · Settings page · top view", "#a855f7");
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(OUT_DIR, "02-settings-top.png"), fullPage: false });

        // ─── Capture 3: Settings → BI Setup section ────────────────────────
        console.log("\n[3/3] Settings → BI Setup section");
        // Try to click "BI Setup" in the left sidebar
        const biSetupClicked = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll("button, a, [role='tab']"));
            const target = links.find(el => /^bi setup$/i.test((el.textContent || "").trim()));
            if (target) { (target).click(); return { clicked: true, label: (target.textContent || "").trim() }; }
            return { clicked: false };
        });
        console.log(`  BI Setup click: ${JSON.stringify(biSetupClicked)}`);
        await page.waitForTimeout(1500);
        await banner(page, "Capture 3/3 · Settings → BI Setup · vendor + surface mode", "#0d9488");
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(OUT_DIR, "03-settings-bi-setup.png"), fullPage: false });
        await page.screenshot({ path: join(OUT_DIR, "03-settings-bi-setup-fullpage.png"), fullPage: true });

        await page.waitForTimeout(2000);
    } finally {
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }

    await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify({
        captures: [
            { id: "dbx-embed-post-csp", file: "01-dbx-embed-post-csp.png" },
            { id: "settings-top", file: "02-settings-top.png" },
            { id: "settings-bi-setup", file: "03-settings-bi-setup.png", fullpage: "03-settings-bi-setup-fullpage.png" },
        ],
        consoleErrors: consoleErrs.length,
        cspViolations: cspViolations.length,
        cspViolationSamples: cspViolations.slice(0, 5),
    }, null, 2));
    console.log(`\n[done] consoleErrors=${consoleErrs.length} cspViolations=${cspViolations.length}`);
    console.log(`[done] artifacts → ${OUT_DIR}`);
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
