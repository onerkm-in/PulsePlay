#!/usr/bin/env node
// playground/scripts/verify-unified-screen-sprint.mjs
//
// Live verification harness for the unified-screen sprint (commits
// 9290d92 → 530c3eb). Drives playwright against the running dev server
// at http://127.0.0.1:7001 and captures screenshots + DOM probes for:
//   1. App boots
//   2. PulsePlayScreen + slot wrappers in DOM
//   3. Default uiMode (no localStorage seed): mounts UnifiedAssistantSurface
//      or PulseShell?
//   4. Settings → AI no longer shows UI mode picker
//   5. Thread A AI-assisted suggest panel still renders
//   6. Thread B chat reply renders TrustBadge

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".unified-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";
const log = [];
const record = (line) => { log.push(line); console.log(line); };

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await ctx.newPage();
    page.on("console", (msg) => { if (msg.type() === "error") record(`[browser:error] ${msg.text().slice(0, 200)}`); });
    page.on("pageerror", (err) => record(`[browser:pageerror] ${err.message.slice(0, 200)}`));

    // ─── STEP 1 — App boots (clean localStorage) ─────────────────────
    record(`[boot] cold-loading ${BASE}/ with CLEAN localStorage`);
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.evaluate(() => { window.localStorage.clear(); });
    await page.reload({ waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(1500);
    record(`[boot] title=${JSON.stringify(await page.title())}`);
    await page.screenshot({ path: join(OUT_DIR, "01-boot-default.png"), fullPage: false });

    // ─── STEP 2 — PulsePlayScreen + slot wrappers ────────────────────
    const dom = await page.evaluate(() => ({
        screen: document.querySelectorAll('[data-testid="pp-screen"]').length,
        floatSlot: document.querySelectorAll('[data-testid="pp-screen-floating-slot"]').length,
        mainSlot: document.querySelectorAll('[data-testid="pp-screen-main-slot"]').length,
        dockSlot: document.querySelectorAll('[data-testid="pp-screen-dock-slot"]').length,
        chromeAi: document.querySelectorAll('[data-testid="pp-panel-chrome-ai"]').length,
        chromeBi: document.querySelectorAll('[data-testid="pp-panel-chrome-bi"]').length,
        pulseShellRoot: document.querySelectorAll('.gn-host-stub,[data-testid="pulse-shell-root"]').length,
        unifiedSurface: document.querySelectorAll('.pp-ai-sidebar,.pp-unified-assistant-surface').length,
        bodyText: document.body ? document.body.innerText.slice(0, 200) : "",
    }));
    record(`[step2] dom probe: ${JSON.stringify(dom)}`);

    // ─── STEP 3 — uiMode default detection ───────────────────────────
    const storage = await page.evaluate(() => ({
        uiMode: window.localStorage.getItem("pulseplay:ui-mode"),
        tabVisibility: window.localStorage.getItem("pulseplay:tab-visibility"),
        pages: window.localStorage.getItem("pulseplay:pages"),
        activeSurface: window.localStorage.getItem("pulseplay:active-surface"),
    }));
    record(`[step3] storage after boot: ${JSON.stringify(storage)}`);

    // ─── STEP 4 — Settings → AI: no "UI mode" picker ─────────────────
    record(`[step4] navigating to /settings/ai`);
    await page.goto(BASE + "/settings/ai", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await page.waitForTimeout(400);

    const uiModeHits = await page.evaluate(() => {
        const out = { aiPageHasUiMode: false, anySetting: 0, leafLabels: [] };
        const text = document.body.innerText;
        out.aiPageHasUiMode = /UI mode|ui mode picker|Pulse shell.*UnifiedAssistantSurface/i.test(text);
        // Count any select option for "pulse"/"v0" specifically (the toggle's signature)
        const selects = Array.from(document.querySelectorAll("select"));
        for (const s of selects) {
            const opts = Array.from(s.querySelectorAll("option")).map(o => o.value);
            if (opts.includes("pulse") && opts.includes("v0")) out.aiPageHasUiMode = true;
        }
        // Look for ButtonGroup pattern (the old picker)
        const groups = Array.from(document.querySelectorAll('[role="radiogroup"], .gn-button-group'));
        for (const g of groups) {
            const t = g.innerText || "";
            if (/UI mode/i.test(t)) out.aiPageHasUiMode = true;
        }
        // Leaf labels for the AI page (the dictionary that used to include "UI mode")
        const headings = Array.from(document.querySelectorAll("h3,h4,h5,label"));
        out.leafLabels = headings.map(h => (h.textContent || "").trim()).filter(Boolean).slice(0, 30);
        return out;
    });
    record(`[step4] settings/ai uiMode-picker present: ${uiModeHits.aiPageHasUiMode}`);
    record(`[step4] settings/ai sample leaf labels (first 30): ${JSON.stringify(uiModeHits.leafLabels)}`);
    await page.screenshot({ path: join(OUT_DIR, "04-settings-ai.png"), fullPage: true });

    // ─── STEP 4b — Settings → Preferences (where the picker LIVED) ───
    record(`[step4b] navigating to /settings/preferences`);
    await page.goto(BASE + "/settings/preferences", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await page.waitForTimeout(400);
    const prefsProbe = await page.evaluate(() => {
        const text = document.body.innerText;
        const selects = Array.from(document.querySelectorAll("select"));
        let hasPulseV0Select = false;
        for (const s of selects) {
            const opts = Array.from(s.querySelectorAll("option")).map(o => o.value);
            if (opts.includes("pulse") && opts.includes("v0")) hasPulseV0Select = true;
        }
        return {
            mentionsUiMode: /UI mode/i.test(text),
            hasPulseV0Select,
            preferencesLeafLabels: Array.from(document.querySelectorAll("h3,h4,h5,label"))
                .map(h => (h.textContent || "").trim()).filter(Boolean).slice(0, 40),
        };
    });
    record(`[step4b] preferences mentionsUiMode: ${prefsProbe.mentionsUiMode}, hasPulseV0Select: ${prefsProbe.hasPulseV0Select}`);
    record(`[step4b] preferences leaf labels: ${JSON.stringify(prefsProbe.preferencesLeafLabels)}`);
    await page.screenshot({ path: join(OUT_DIR, "04b-settings-preferences.png"), fullPage: true });

    // ─── STEP 5 — Thread A: AI-assisted suggest panel ────────────────
    record(`[step5] back to /settings/ai for Thread A`);
    await page.goto(BASE + "/settings/ai", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(700);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    const selects = await page.locator("select").all();
    let authoringSelect = null;
    for (const sel of selects) {
        const options = await sel.locator("option").allTextContents();
        if (options.some((o) => /AI-assisted/i.test(o))) { authoringSelect = sel; break; }
    }
    if (!authoringSelect) {
        record(`[step5] WARN: no <select> with 'AI-assisted' option found on /settings/ai`);
    } else {
        await authoringSelect.scrollIntoViewIfNeeded();
        await authoringSelect.selectOption("ai-assisted");
        await page.waitForTimeout(800);
        await page.screenshot({ path: join(OUT_DIR, "05-thread-a-assisted.png"), fullPage: true });
        const panelCount = await page.locator(".gn-setup-ai-assist").count();
        record(`[step5] Thread A .gn-setup-ai-assist panels visible: ${panelCount}`);
    }

    // ─── STEP 6 — Thread B/D: drive chat + check TrustBadge ──────────
    record(`[step6] seeding profile + going to home for Thread B`);
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.evaluate((profile) => {
        window.localStorage.setItem("pulseplay:ui-mode", "v0"); // force AISidebar surface for Thread B's selector
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile;
        ex.connectionMode = "proxy";
        ex.apiBaseUrl = window.location.origin + "/api";
        window.localStorage.setItem(k, JSON.stringify(ex));
        window.dispatchEvent(new CustomEvent("pulseplay:visual-settings-change", { detail: { objectName: "genieSettings" } }));
    }, PROFILE);
    await page.reload({ waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(800);

    const askPulseTab = page.locator('button:has-text("Ask Pulse"), a:has-text("Ask Pulse")').first();
    if ((await askPulseTab.count()) > 0) { await askPulseTab.click(); await page.waitForTimeout(700); }
    const composer = page.locator('textarea').first();
    if ((await composer.count()) === 0) {
        record(`[step6] FAIL: no composer textarea on Ask Pulse pane (uiMode=${await page.evaluate(() => window.localStorage.getItem("pulseplay:ui-mode"))})`);
    } else {
        await composer.fill("Top 3 categories by sales with profit and margin. Output a markdown table with columns Category, Sales, Profit, Margin %.");
        const askBtn = page.locator('button.pp-ai-sidebar__ask').first();
        const askHits = await askBtn.count();
        record(`[step6] composer filled; AISidebar Ask button hits: ${askHits}`);
        if (askHits > 0) {
            await askBtn.click();
            record(`[step6] clicked Ask; waiting up to 90s for entry completion`);
            const deadline = Date.now() + 90_000;
            let final = null;
            while (Date.now() < deadline) {
                await page.waitForTimeout(2000);
                const status = await page.evaluate(() => {
                    const entries = Array.from(document.querySelectorAll('[data-testid^="pp-ai-entry-"]'));
                    const last = entries[entries.length - 1];
                    return last ? last.getAttribute("data-status") : null;
                });
                if (status === "completed" || status === "failed") { final = status; break; }
            }
            record(`[step6] final entry status: ${final || "still-pending"}`);
            await page.screenshot({ path: join(OUT_DIR, "06-thread-b-chat.png"), fullPage: true });
            const badges = await page.locator('[data-testid="trust-badge"]').all();
            record(`[step6] Thread B TrustBadge instances: ${badges.length}`);
            for (const b of badges) {
                const status = await b.getAttribute("data-status");
                const text = (await b.textContent() || "").trim();
                record(`[step6]   data-status="${status}" text="${text}"`);
            }
        }
    }

    await writeFile(join(OUT_DIR, "verify.log"), log.join("\n"), "utf-8");
    record(`[done] log written → ${OUT_DIR}`);
    await browser.close();
}

main().catch(async (err) => { console.error("[FAIL]", err); process.exitCode = 1; });
