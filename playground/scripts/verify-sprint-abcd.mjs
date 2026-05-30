#!/usr/bin/env node
// playground/scripts/verify-sprint-abcd.mjs
//
// Live verification harness for the A/B/C/D sprint. Drives playwright
// against the local dev server (http://127.0.0.1:7001) and captures
// screenshots + DOM probes that prove the four threads land in the
// real UI, not just in unit tests.
//
// NOT a test suite — this is the verifier the operator runs by hand
// during a sprint smoke. Output lands in playground/scripts/.verify-out/
// so a reviewer can inspect the captured pixels.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".verify-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";
const log = [];
const record = (line) => { log.push(line); console.log(line); };

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await ctx.newPage();

    page.on("console", (msg) => {
        if (msg.type() === "error") record(`[browser:error] ${msg.text()}`);
    });
    page.on("pageerror", (err) => record(`[browser:pageerror] ${err.message}`));

    // ─── BOOT ────────────────────────────────────────────────────────────
    record(`[boot] navigating to ${BASE}/`);
    await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 30_000 });
    // Seed the active AI profile + metric rules + sectioned flag BEFORE
    // any thread runs so the UI considers itself set up.
    record(`[boot] seeding localStorage (profile=${PROFILE}, uiMode=v0 to mount AISidebar)`);
    await page.evaluate((profile) => {
        // The default uiMode is "pulse" which renders the Pulse-port
        // <PulseShell> (its own chat UI). The threads B/D/C.2 ship to
        // <AISidebar>, which only mounts when uiMode === "v0".
        window.localStorage.setItem("pulseplay:ui-mode", "v0");
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        const rules = [
            { name: "Revenue", higherIsBetter: true, greenPct: 40, amberPct: 20, redPct: 5 },
            { name: "Churn %", higherIsBetter: false, greenPct: 5, amberPct: 10, redPct: 15 },
            { name: "Sales", higherIsBetter: true, greenPct: 50, amberPct: 25, redPct: 10 },
            { name: "Profit", higherIsBetter: true, greenPct: 30, amberPct: 15, redPct: 5 },
            { name: "Margin %", higherIsBetter: true, greenPct: 25, amberPct: 15, redPct: 5 },
        ];
        const k = "pulseplay:visual-settings:genieSettings";
        const existing = JSON.parse(window.localStorage.getItem(k) || "{}");
        existing.assistantProfile = profile;
        existing.insightsMetricDirections = JSON.stringify(rules);
        existing.metricDirectionRules = "Revenue: higher is better\nChurn %: lower is better\nSales: higher is better\nProfit: higher is better\nMargin %: higher is better";
        window.localStorage.setItem(k, JSON.stringify(existing));
        window.dispatchEvent(new CustomEvent("pulseplay:visual-settings-change", { detail: { objectName: "genieSettings" } }));
    }, PROFILE);
    await page.reload({ waitUntil: "networkidle" });
    await page.screenshot({ path: join(OUT_DIR, "00-app-home.png"), fullPage: false });
    record(`[boot] title=${JSON.stringify(await page.title())}`);

    await runThreadA(page);
    await runThreadBD(page);
    await runThreadC(page);

    await writeFile(join(OUT_DIR, "verify.log"), log.join("\n"), "utf-8");
    record(`[done] log written`);
    await browser.close();
}

// ─── THREAD A — AI-assisted suggest panel in Settings → AI → Response ─
async function runThreadA(page) {
    record("[A] navigating to /settings/ai");
    await page.goto(BASE + "/settings/ai", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(600);

    // Expand all <details> so collapsed sections render.
    await page.evaluate(() => {
        for (const d of document.querySelectorAll("details")) d.open = true;
    });
    // Scroll to the Authoring mode select before screenshotting.
    const selects = await page.locator("select").all();
    record(`[A] total <select> on page: ${selects.length}`);
    let authoringSelect = null;
    for (const sel of selects) {
        const options = await sel.locator("option").allTextContents();
        if (options.some((o) => /AI-assisted/i.test(o))) { authoringSelect = sel; break; }
    }
    if (!authoringSelect) {
        record("[A] FAIL: no Authoring mode select with 'AI-assisted' option found.");
        return;
    }
    await authoringSelect.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(OUT_DIR, "A1-settings-ai-response.png"), fullPage: true });

    await authoringSelect.selectOption("ai-assisted");
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT_DIR, "A2-settings-ai-assisted.png"), fullPage: true });

    const panel = page.locator(".gn-setup-ai-assist");
    const panelCount = await panel.count();
    record(`[A] .gn-setup-ai-assist panels visible: ${panelCount}`);
    if (panelCount > 0) {
        const panelHTML = await panel.first().innerText();
        record(`[A] panel text (first 240): ${JSON.stringify(panelHTML.slice(0, 240))}`);
        await panel.first().screenshot({ path: join(OUT_DIR, "A3-suggest-panel.png") }).catch(() => undefined);
    }
}

// ─── THREAD B + D — drive a real Genie call so the chat renders ──────
async function runThreadBD(page) {
    record("[B/D] navigating to / (home) and clicking Ask Pulse tab");
    await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(500);

    // Click the Ask Pulse top tab. The label has the speech-bubble icon
    // before it; use button with text "Ask Pulse".
    const askPulseTab = page.locator('button:has-text("Ask Pulse"), a:has-text("Ask Pulse")').first();
    const tabHits = await askPulseTab.count();
    record(`[B/D] Ask Pulse tab hits: ${tabHits}`);
    if (tabHits > 0) {
        await askPulseTab.click();
        await page.waitForTimeout(700);
    }
    await page.screenshot({ path: join(OUT_DIR, "BD1-ask-pulse-empty.png"), fullPage: true });

    const composer = page.locator('textarea').first();
    const composerHits = await composer.count();
    record(`[B/D] composer hits: ${composerHits}`);
    if (composerHits === 0) {
        record("[B/D] FAIL: no composer textarea on the Ask Pulse pane.");
        return;
    }
    const question = "Top 3 categories by sales with profit and margin. Output a markdown table with columns Category, Sales, Profit, Margin %.";
    await composer.fill(question);
    record(`[B/D] composer filled with table-shaped question`);

    // The AISidebar's Ask button has class `pp-ai-sidebar__ask`. We
    // target it precisely so we don't re-click the "Ask Pulse" TAB.
    const askBtn = page.locator('button.pp-ai-sidebar__ask').first();
    const askHits = await askBtn.count();
    record(`[B/D] AISidebar Ask button hits: ${askHits}`);
    if (askHits === 0) {
        record("[B/D] FAIL: no AISidebar Ask button (check uiMode === v0).");
        return;
    }
    await askBtn.click();
    record("[B/D] clicked Ask; waiting up to 150s for Genie completion");

    const deadline = Date.now() + 150_000;
    let final = null;
    while (Date.now() < deadline) {
        await page.waitForTimeout(2000);
        const entryStatus = await page.evaluate(() => {
            const entries = Array.from(document.querySelectorAll('[data-testid^="pp-ai-entry-"]'));
            const last = entries[entries.length - 1];
            return last ? last.getAttribute("data-status") : null;
        });
        if (entryStatus === "completed" || entryStatus === "failed") {
            final = entryStatus;
            break;
        }
    }
    record(`[B/D] final entry status: ${final || "still-pending"}`);
    await page.screenshot({ path: join(OUT_DIR, "BD2-ask-pulse-answered.png"), fullPage: true });

    const badges = await page.locator('[data-testid="trust-badge"]').all();
    record(`[B] TrustBadge instances: ${badges.length}`);
    for (const b of badges) {
        const status = await b.getAttribute("data-status");
        const text = await b.textContent();
        record(`[B]   data-status="${status}" text="${(text||"").trim()}"`);
    }

    const toned = await page.locator('.pp-ai-sidebar__narrative td[data-tone]').all();
    record(`[D] toned cells in chat narrative: ${toned.length}`);
    for (const c of toned.slice(0, 12)) {
        const tone = await c.getAttribute("data-tone");
        const text = (await c.textContent() || "").trim();
        record(`[D]   ${tone} -> "${text}"`);
    }
    if (toned.length > 0) {
        const narr = page.locator('.pp-ai-sidebar__narrative').first();
        await narr.screenshot({ path: join(OUT_DIR, "D-toned-narrative.png") }).catch(() => undefined);
    } else {
        // Capture the raw answer body so we can see what Genie returned.
        const narr = page.locator('.pp-ai-sidebar__narrative').first();
        const text = await narr.innerText().catch(() => "<no narrative>");
        record(`[D]   no toned cells; narrative text first 400 chars: ${JSON.stringify(text.slice(0, 400))}`);
    }
}

// ─── THREAD C — sectioned chat flag flow ──────────────────────────────
async function runThreadC(page) {
    record("[C] enabling pulseplay:chat-sectioned-enabled flag");
    await page.evaluate(() => {
        window.localStorage.setItem("pulseplay:chat-sectioned-enabled", "1");
    });

    const sectionedHits = [];
    page.on("request", (req) => {
        if (req.url().includes("/assistant/conversations/start-sectioned")) {
            sectionedHits.push({ url: req.url(), method: req.method() });
        }
    });

    await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(500);
    const askPulseTab = page.locator('button:has-text("Ask Pulse")').first();
    if ((await askPulseTab.count()) > 0) {
        await askPulseTab.click();
        await page.waitForTimeout(500);
    }
    const composer = page.locator('textarea').first();
    if ((await composer.count()) === 0) {
        record("[C] FAIL: no composer on Ask Pulse pane.");
        return;
    }
    await composer.fill("Sectioned smoke: brief on top categories.");
    const askBtn = page.locator('button.pp-ai-sidebar__ask').first();
    await askBtn.click();
    record("[C] Ask clicked; waiting briefly for sectioned skeleton");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT_DIR, "C1-sectioned-skeleton.png"), fullPage: true });
    record(`[C] sectioned endpoint hits in first 1500ms: ${sectionedHits.length}`);

    // Wait for SectionedAnswer + at least one completed item.
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
        const mounts = await page.locator('[data-testid="pp-sectioned-answer"]').count();
        const completed = await page.locator('[data-testid^="pp-sectioned-item-"][data-status="completed"]').count();
        if (mounts > 0 && completed > 0) {
            record(`[C] SectionedAnswer mounted, completed items=${completed}`);
            break;
        }
        await page.waitForTimeout(2500);
    }
    await page.screenshot({ path: join(OUT_DIR, "C2-sectioned-progress.png"), fullPage: true });

    const mounts = await page.locator('[data-testid="pp-sectioned-answer"]').count();
    const items = await page.locator('[data-testid^="pp-sectioned-item-"]').all();
    record(`[C] pp-sectioned-answer mounts: ${mounts}`);
    record(`[C] pp-sectioned-item-* total: ${items.length}`);
    for (const it of items) {
        const id = await it.getAttribute("data-testid");
        const status = await it.getAttribute("data-status");
        record(`[C]   ${id} status=${status}`);
    }
    record(`[C] sectioned endpoint hits (final): ${sectionedHits.length}`);
    for (const h of sectionedHits) record(`[C]   ${h.method} ${h.url}`);
    await page.screenshot({ path: join(OUT_DIR, "C3-sectioned-final.png"), fullPage: true });
}

main().catch(async (err) => {
    console.error("[FAIL]", err);
    process.exitCode = 1;
});
