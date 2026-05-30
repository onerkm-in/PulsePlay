#!/usr/bin/env node
// Settings configuration tour — visit each of the 6 settings groups via
// direct URL routing (`/settings/<group>`) and capture each for the pitch
// deck. Confirms each group is reachable and renders.
//
// Groups (per settingsRoute.ts):
//   /settings/setup        — legacy Setup
//   /settings/bi           — BI Setup  ← what was missing visibility to
//   /settings/ai           — AI Setup
//   /settings/preferences  — Preferences
//   /settings/system       — System
//   /settings/advanced     — Advanced

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/settings-tour-${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";

const GROUPS = [
    { id: "ai", label: "AI Setup" },
    { id: "bi", label: "BI Setup" },
    { id: "setup", label: "Setup (legacy Quick Start)" },
    { id: "preferences", label: "Preferences" },
    { id: "system", label: "System" },
    { id: "advanced", label: "Advanced" },
];

async function banner(page, text, color = "#0d9488") {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__set__");
        if (!b) {
            b = document.createElement("div");
            b.id = "__set__";
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
    const pageErrs = [];
    page.on("pageerror", (e) => pageErrs.push(e.message.slice(0, 180)));

    const results = [];

    try {
        await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.evaluate(() => {
            try { window.localStorage.clear(); } catch { /* swallow */ }
            window.localStorage.setItem("pulseplay:active-ai-profile", "default");
        });

        for (let i = 0; i < GROUPS.length; i++) {
            const g = GROUPS[i];
            console.log(`\n[${i + 1}/${GROUPS.length}] /settings/${g.id} — ${g.label}`);

            await page.goto(`${BASE}/settings/${g.id}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
            await page.waitForTimeout(2500);
            await banner(page, `Settings ${i + 1}/${GROUPS.length} · /settings/${g.id} · ${g.label}`, "#0d9488");
            await page.waitForTimeout(500);

            // Capture both viewport and full-page
            const screenshot = `${String(i + 1).padStart(2, "0")}-${g.id}.png`;
            const screenshotFull = `${String(i + 1).padStart(2, "0")}-${g.id}-fullpage.png`;
            await page.screenshot({ path: join(OUT_DIR, screenshot), fullPage: false });
            await page.screenshot({ path: join(OUT_DIR, screenshotFull), fullPage: true });

            // Inspect what loaded
            const probe = await page.evaluate(() => {
                const text = document.body.innerText;
                const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
                    .map(h => (h.textContent || "").trim()).filter(Boolean).slice(0, 8);
                const buttons = Array.from(document.querySelectorAll("button"))
                    .map(b => (b.textContent || "").trim()).filter(Boolean).slice(0, 12);
                const inputs = document.querySelectorAll("input, select, textarea").length;
                return {
                    bodyLen: text.length,
                    headings,
                    inputCount: inputs,
                    buttonSamples: buttons,
                    titleSnippet: text.slice(0, 200),
                };
            });
            results.push({ group: g.id, label: g.label, ...probe });
            console.log(`  ✓ captured. bodyLen=${probe.bodyLen} inputs=${probe.inputCount} headings=${probe.headings.length}`);
            console.log(`    first headings: ${JSON.stringify(probe.headings.slice(0, 3))}`);
        }
    } finally {
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }

    console.log("\n=== Settings tour summary ===");
    for (const r of results) {
        console.log(`/settings/${r.group}  bodyLen=${r.bodyLen}  inputs=${r.inputCount}  headings=${r.headings.length}`);
    }
    await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify({ pageErrs, results }, null, 2));
    console.log(`\n[done] artifacts → ${OUT_DIR}`);
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
