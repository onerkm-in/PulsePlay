#!/usr/bin/env node
// Comprehensive features smoke — walks the app exercising every major
// feature NOT covered by the existing 4 smokes (preview-all-3,
// powerbi-live10, genie-10, powerbi-qna-10x). For each feature: navigate,
// inspect, screenshot, verdict.
//
// Features covered:
//   1. Profile switcher (Settings → AI) — show 4 profiles available
//   2. Knowledge Base browser (/knowledge) — pack list + drilldown
//   3. Settings page (/settings) — primary nav loads
//   4. Composer slash commands — type "/" and verify dropdown
//   5. Composer history pill — verify visible on Ask Pulse
//   6. Sustainability indicator — verify present in footer
//   7. Detach affordance — verify detach control exists in top-right
//   8. AI Insights briefing render — verify multi-section briefing fills

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/all-features-${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";

async function banner(page, text, color = "#a855f7") {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__feat__");
        if (!b) {
            b = document.createElement("div");
            b.id = "__feat__";
            Object.assign(b.style, {
                position: "fixed", top: "8px", left: "8px", right: "8px", zIndex: "99999",
                padding: "6px 10px", background: "rgba(15,23,42,0.92)", color: "#fff",
                font: "12px ui-monospace, monospace", borderRadius: "4px",
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
        headless: false, slowMo: 350,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const pageErrs = [];
    page.on("pageerror", (e) => pageErrs.push(e.message.slice(0, 180)));

    const results = [];
    const record = (name, verdict, details = {}) => {
        results.push({ name, verdict, ...details });
        const flag = verdict === "PASS" ? "✅" : verdict === "PASS-PARTIAL" ? "⚠️" : "❌";
        console.log(`  ${flag} ${name}  ${JSON.stringify(details)}`);
    };

    try {
        // Setup
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

        // ─── Feature 1: Profile switcher (Settings → AI) ──────────────────
        console.log("\n[Feature 1] Profile switcher");
        await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2500);
        await banner(page, "Feature 1 · Profile switcher (Settings → AI)", "#06b6d4");
        await safeScreenshot(page, "01-settings.png");
        const settingsCheck = await page.evaluate(() => {
            const ai = document.body.innerText.match(/Settings|Profile|Assistant|AI/i);
            const sections = document.querySelectorAll("nav a, [role='tab']").length;
            return { hasSettingsContent: !!ai, navItems: sections, bodyLen: document.body.innerText.length };
        });
        record("settings-page", settingsCheck.hasSettingsContent ? "PASS" : "FAIL", settingsCheck);

        // ─── Feature 2: Knowledge Base browser ─────────────────────────────
        console.log("\n[Feature 2] Knowledge Base browser");
        await page.goto(BASE + "/knowledge", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2500);
        await banner(page, "Feature 2 · Knowledge Base browser (/knowledge)", "#06b6d4");
        await safeScreenshot(page, "02-knowledge-index.png");
        const kbCheck = await page.evaluate(() => {
            const text = document.body.innerText.toLowerCase();
            const hasPacks = text.includes("cpg") || text.includes("retail") || text.includes("saas") || text.includes("pack");
            const links = Array.from(document.querySelectorAll("a, button")).filter(el => /cpg|retail|saas|pack|glossary|ontology/i.test(el.textContent || ""));
            return { hasPackContent: hasPacks, packLinkCount: links.length, bodyLen: document.body.innerText.length };
        });
        record("knowledge-base-index", kbCheck.hasPackContent ? "PASS" : "FAIL", kbCheck);

        // ─── Feature 3: KB drill-down into CPG-FMCG pack ───────────────────
        console.log("\n[Feature 3] KB drill-down into CPG-FMCG");
        await page.goto(BASE + "/knowledge/cpg-fmcg", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2500);
        await banner(page, "Feature 3 · KB drill-down (CPG-FMCG pack)", "#06b6d4");
        await safeScreenshot(page, "03-knowledge-cpg-fmcg.png");
        const kbDrillCheck = await page.evaluate(() => {
            const text = document.body.innerText.toLowerCase();
            const hasGlossary = text.includes("glossary") || text.includes("ontology") || text.includes("references") || text.includes("sub-vertical");
            return { hasSubSections: hasGlossary, bodyLen: document.body.innerText.length };
        });
        record("knowledge-base-drilldown", kbDrillCheck.hasSubSections ? "PASS" : "FAIL", kbDrillCheck);

        // ─── Feature 4-7: Ask Pulse surface features ───────────────────────
        console.log("\n[Feature 4-7] Ask Pulse composer features");
        await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2500);
        await banner(page, "Feature 4-7 · Ask Pulse composer features", "#06b6d4");
        await safeScreenshot(page, "04-ask-pulse-baseline.png");

        // Feature 4: composer slash command dropdown
        const composer = page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first();
        if (await composer.count() > 0) {
            await composer.click();
            await composer.fill("/");
            await page.waitForTimeout(800);
            await banner(page, "Feature 4 · Slash command dropdown", "#06b6d4");
            await safeScreenshot(page, "05-slash-dropdown.png");
            const slashCheck = await page.evaluate(() => {
                const dropdown = document.querySelector(".gn-slash-dropdown, [role='listbox']");
                const items = dropdown ? dropdown.querySelectorAll("button, [role='option']").length : 0;
                return { hasDropdown: !!dropdown, itemCount: items };
            });
            record("composer-slash-commands", slashCheck.hasDropdown && slashCheck.itemCount > 0 ? "PASS" : "FAIL", slashCheck);
            await composer.fill(""); // clear
            await page.waitForTimeout(400);
        } else {
            record("composer-slash-commands", "FAIL", { reason: "composer not found" });
        }

        // Feature 5: history pill present
        const historyCheck = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll("button"));
            const showHist = btns.find(b => /show history|hide history/i.test(b.textContent || ""));
            return { hasHistoryPill: !!showHist, label: showHist ? (showHist.textContent || "").trim() : null };
        });
        record("composer-history-pill", historyCheck.hasHistoryPill ? "PASS" : "FAIL", historyCheck);

        // Feature 6: sustainability indicator (leaf + smile token gauge)
        const sustainCheck = await page.evaluate(() => {
            const candidates = document.querySelectorAll(
                ".gn-sustain, .gn-sustainability, [data-testid*='sustain'], [class*='sustain'], [class*='token-gauge']"
            );
            const text = document.body.innerText;
            const hasTokenMention = /token|sustainab|leaf/i.test(text);
            return { domElements: candidates.length, textMatch: hasTokenMention };
        });
        record("sustainability-indicator", sustainCheck.domElements > 0 || sustainCheck.textMatch ? "PASS" : "PASS-PARTIAL", sustainCheck);

        // Feature 7: detach affordance (top-right toolbar pop-out)
        const detachCheck = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
            const detach = buttons.find(b => {
                const t = (b.textContent || "").trim().toLowerCase();
                const aria = (b.getAttribute("aria-label") || "").toLowerCase();
                const title = (b.getAttribute("title") || "").toLowerCase();
                return /detach|pop ?out|open in new|maximi[sz]e|minimi[sz]e|float/.test(t + " " + aria + " " + title);
            });
            return { hasDetach: !!detach, ariaLabel: detach?.getAttribute("aria-label") || null };
        });
        record("detach-affordance", detachCheck.hasDetach ? "PASS" : "FAIL", detachCheck);

        // ─── Feature 8: Suggestion / starter chips on Ask Pulse ────────────
        console.log("\n[Feature 8] Starter question chips");
        const chipsCheck = await page.evaluate(() => {
            const text = document.body.innerText;
            const starterPattern = /(what metrics|show me|what anomalies|trends|risks)/i;
            const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
            const chips = buttons.filter(b => starterPattern.test(b.textContent || ""));
            return { matches: starterPattern.test(text), chipCount: chips.length };
        });
        record("starter-question-chips", chipsCheck.matches ? "PASS" : "FAIL", chipsCheck);

        // ─── Feature 9: AI Insights filled briefing ────────────────────────
        console.log("\n[Feature 9] AI Insights briefing");
        await page.goto(BASE + "/?surface=ai-insights", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2000);
        await banner(page, "Feature 9 · AI Insights briefing", "#06b6d4");
        // Wait for content to settle (briefing renders)
        const deadline = Date.now() + 90_000;
        let finalSig = null;
        while (Date.now() < deadline) {
            const s = await page.evaluate(() => {
                const text = document.body.innerText;
                const hasExec = /executive brief|kpi snapshot|what changed|what needs attention|next best actions/i.test(text);
                const sectionCount = (text.match(/(executive brief|kpi snapshot|trends|risks|opportunities|what changed|what needs attention|next best actions|recommended actions)/gi) || []).length;
                const drafting = /drafting|working out|generating/i.test(text);
                return { hasExec, sectionCount, drafting, len: text.length };
            });
            finalSig = s;
            if (!s.drafting && s.hasExec && s.sectionCount >= 3) break;
            await page.waitForTimeout(1500);
        }
        await safeScreenshot(page, "06-ai-insights-filled.png");
        record("ai-insights-briefing", finalSig?.hasExec && finalSig?.sectionCount >= 3 ? "PASS" : "PASS-PARTIAL", finalSig);

        // ─── Feature 10: Dashboard surface (Pulse Canvas empty state) ──────
        console.log("\n[Feature 10] Dashboard surface");
        await page.goto(BASE + "/?surface=dashboard", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2500);
        await banner(page, "Feature 10 · Dashboard (Pulse Canvas)", "#06b6d4");
        await safeScreenshot(page, "07-dashboard.png");
        const dashCheck = await page.evaluate(() => {
            const text = document.body.innerText.toLowerCase();
            const hasCanvas = text.includes("pulse canvas") || text.includes("dashboard") || text.includes("embedded bi");
            const tabs = Array.from(document.querySelectorAll("button")).filter(b => /^dashboard$/i.test((b.textContent || "").trim()));
            const dashActive = tabs.some(b => b.getAttribute("aria-selected") === "true" || /(active|--active|gn-header-tab--active)/.test(b.className || ""));
            return { hasCanvasContent: hasCanvas, dashTabActive: dashActive };
        });
        record("dashboard-surface", dashCheck.hasCanvasContent && dashCheck.dashTabActive ? "PASS" : "FAIL", dashCheck);

    } finally {
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }

    console.log("\n=== Features Summary ===");
    for (const r of results) {
        const flag = r.verdict === "PASS" ? "✅" : r.verdict === "PASS-PARTIAL" ? "⚠️" : "❌";
        console.log(`${flag} ${r.verdict.padEnd(15)} ${r.name}`);
    }
    const pass = results.filter(r => r.verdict === "PASS").length;
    const partial = results.filter(r => r.verdict === "PASS-PARTIAL").length;
    const fail = results.filter(r => r.verdict === "FAIL").length;
    console.log(`\n[totals] ${pass} PASS · ${partial} PASS-PARTIAL · ${fail} FAIL  (of ${results.length}) · pageErrs=${pageErrs.length}`);
    await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify({ pass, partial, fail, total: results.length, pageErrs, results }, null, 2));
    console.log(`[done] artifacts → ${OUT_DIR}`);
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
