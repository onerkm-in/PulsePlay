#!/usr/bin/env node
// playground/scripts/verify-unified-screen-intense.mjs
//
// INTENSE second-round verification for the 2026-05-25 unified-screen sprint.
// Where verify-unified-screen.mjs is the happy-path smoke, this harness
// probes AROUND the change: adversarial inputs, multi-message flow,
// state persistence, slot triggers (floating/dock), tripwire reuse,
// legacy storage values, mobile viewport, toolbar enumeration, plus a
// session-long sink for console errors + failed network calls.
//
// Run with proxy on 127.0.0.1:7000 + dev server on 127.0.0.1:7001.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".intense-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";

const log = [];
const errors = { console: [], page: [], net: [] };
const apiCalls = [];
const record = (line) => { log.push(line); console.log(line); };

// Vite dev keeps SSE streams open → networkidle never settles. Use
// domcontentloaded everywhere and explicit waitForTimeout for settle.
const NAV = { waitUntil: "domcontentloaded", timeout: 20_000 };

async function flushLog() {
    try { await writeFile(join(OUT_DIR, "verify-intense.log"), log.join("\n"), "utf-8"); } catch (_) {}
    try { await writeFile(join(OUT_DIR, "api-calls.json"), JSON.stringify(apiCalls, null, 2), "utf-8"); } catch (_) {}
}

async function safe(name, fn) {
    try { await fn(); }
    catch (err) {
        const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        record(`[${name}] ⚠️ probe threw — ${msg.split("\n")[0]}`);
    }
    await flushLog();
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    record(`[boot] launching HEADED Chromium @ slowMo=350ms — watch your screen`);
    const browser = await chromium.launch({
        headless: false,
        slowMo: 350,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();

    // ─── Session-long sinks ─────────────────────────────────────────
    page.on("console", (msg) => {
        if (msg.type() === "error") {
            const line = `[console.error] ${msg.text()}`;
            errors.console.push(line);
            record(line);
        }
    });
    page.on("pageerror", (err) => {
        const line = `[pageerror] ${err.message}`;
        errors.page.push(line);
        record(line);
    });
    page.on("requestfinished", async (req) => {
        const url = req.url();
        if (!url.includes("/api/")) return;
        const resp = await req.response();
        const status = resp ? resp.status() : "?";
        apiCalls.push({ method: req.method(), url, status });
        if (typeof status === "number" && status >= 400) {
            const line = `[net ${status}] ${req.method()} ${url}`;
            errors.net.push(line);
            record(line);
        }
    });
    page.on("requestfailed", (req) => {
        const line = `[net FAIL] ${req.method()} ${req.url()} — ${req.failure()?.errorText || "?"}`;
        errors.net.push(line);
        record(line);
    });

    // NOTE: probe D (detach/minimize) is run LAST because the prior run
    // showed it triggers a React unmount race that corrupts the page and
    // prevents subsequent interaction. Running it last preserves the
    // bug evidence without burying probes E-J.
    await safe("A", () => probeABoot(page));
    await safe("B", () => probeBCellCatalog(page));
    await safe("C", () => probeCLegacyUiModeValues(page));
    await safe("E", () => probeEAdversarialInputs(page));
    await safe("F", () => probeFMultiMessageChat(page));
    await safe("G", () => probeGGenieConversationReuse(page));
    await safe("H", () => probeHToolbarEnumeration(page));
    await safe("I", () => probeIMobileViewport(page));
    await safe("J", () => probeJStatePersistence(page));
    await safe("D", () => probeDSlotTriggers(page)); // ← MOVED LAST

    // ─── Final summary ──────────────────────────────────────────────
    record(`\n[summary] console.errors: ${errors.console.length}`);
    record(`[summary] pageerrors:     ${errors.page.length}`);
    record(`[summary] network 4xx/5xx + failed: ${errors.net.length}`);
    record(`[summary] total /api/* calls observed: ${apiCalls.length}`);
    const distinctApi = [...new Set(apiCalls.map(c => `${c.method} ${stripQuery(c.url)}`))];
    record(`[summary] distinct /api/* endpoints touched:`);
    for (const ep of distinctApi) record(`  • ${ep}`);

    record(`\n[done] watch your screen — closing in 5 seconds`);
    await page.waitForTimeout(5000);
    await writeFile(join(OUT_DIR, "verify-intense.log"), log.join("\n"), "utf-8");
    await writeFile(join(OUT_DIR, "api-calls.json"), JSON.stringify(apiCalls, null, 2), "utf-8");
    await browser.close();
}

function stripQuery(u) { return u.split("?")[0]; }

async function seedProfile(page) {
    await page.evaluate((profile) => {
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        const k = "pulseplay:visual-settings:genieSettings";
        const existing = JSON.parse(window.localStorage.getItem(k) || "{}");
        existing.assistantProfile = profile;
        window.localStorage.setItem(k, JSON.stringify(existing));
        window.dispatchEvent(new CustomEvent("pulseplay:visual-settings-change", { detail: { objectName: "genieSettings" } }));
    }, PROFILE);
}

// ─── Probe A: boot + warm to baseline ──────────────────────────────
async function probeABoot(page) {
    record(`\n[A] Boot — ${BASE}/`);
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20_000 });
    await seedProfile(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT_DIR, "A-boot.png"), fullPage: false });
    record(`[A] booted — title="${await page.title()}"`);
}

// ─── Probe B: Cell Catalog manifest reachability ───────────────────
async function probeBCellCatalog(page) {
    record(`\n[B] Cell Catalog SSOT (Step 0 — JSON manifests at playground/src/cells/)`);
    // Vite dev serves /src/cells/<id>.json directly as a transformed JS
    // module. Hit each via the in-page fetch and confirm status + the id
    // string appears in the response.
    const ids = ["powerbi-genie", "tableau-foundation", "qlik-bedrock", "looker-supervisor", "generic-iframe-responses"];
    const results = await page.evaluate(async (ids) => {
        const out = [];
        for (const id of ids) {
            const url = `/src/cells/${id}.json`;
            try {
                const r = await fetch(url);
                const txt = await r.text();
                out.push({ id, url, status: r.status, hasId: txt.includes(`"id"`) && txt.includes(id), bytes: txt.length });
            } catch (e) {
                out.push({ id, url, status: "fetch-failed", error: String(e), hasId: false, bytes: 0 });
            }
        }
        return out;
    }, ids);
    for (const r of results) {
        const tag = r.status === 200 && r.hasId ? "✅" : "❌";
        record(`[B] ${tag} ${r.url}  status=${r.status}  bytes=${r.bytes}  contains-id=${r.hasId}`);
    }
}

// ─── Probe C: Legacy + garbage uiMode values ───────────────────────
async function probeCLegacyUiModeValues(page) {
    record(`\n[C] Legacy / garbage uiMode storage values — graceful fallback`);
    const cases = [
        { val: "pulse",  expect: "pulse-mounted (Ask Pulse tab visible)" },
        { val: "v0",     expect: "v0 mounted (.pp-ai-sidebar__ask visible)" },
        { val: "foo",    expect: "fallback to default (NOT crash, prefer v0)" },
        { val: "",       expect: "fallback to default (NOT crash, prefer v0)" },
        { val: null,     expect: "default — already covered by removing key" },
    ];
    for (const c of cases) {
        await page.evaluate((v) => {
            if (v === null) window.localStorage.removeItem("pulseplay:ui-mode");
            else window.localStorage.setItem("pulseplay:ui-mode", v);
        }, c.val);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(900);
        const ask = await page.locator(".pp-ai-sidebar__ask").count();
        const pulseTab = await page.locator('button:has-text("Ask Pulse")').count();
        const ppScreen = await page.locator('[data-testid="pp-screen"]').count();
        record(`[C] storage=${JSON.stringify(c.val).padEnd(8)} → pp-screen=${ppScreen} pp-ai-sidebar__ask=${ask} "Ask Pulse"-tab=${pulseTab}   (${c.expect})`);
    }
    // Reset to default for downstream probes.
    await page.evaluate(() => window.localStorage.removeItem("pulseplay:ui-mode"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
}

// ─── Probe D: Slot triggers (floating + dock) ──────────────────────
async function probeDSlotTriggers(page) {
    record(`\n[D] PulsePlayScreen slot triggers — floating-slot + dock-slot activation`);
    const floatBefore = await page.locator('[data-testid="pp-screen-floating-slot"]').count();
    const dockBefore  = await page.locator('[data-testid="pp-screen-dock-slot"]').count();
    record(`[D] baseline:    floating-slot=${floatBefore} dock-slot=${dockBefore} (expect 0 / 0 — nothing detached or minimized)`);

    // Find a detach / external-link button in the header.
    const detachCandidates = [
        page.getByRole("button", { name: /detach/i }),
        page.getByRole("button", { name: /float/i }),
        page.getByRole("button", { name: /pop ?out/i }),
        page.getByRole("button", { name: /external/i }),
        page.locator('[aria-label*="detach" i]'),
        page.locator('[title*="detach" i]'),
        page.locator('[title*="float" i]'),
    ];
    let detachBtn = null;
    for (const cand of detachCandidates) {
        if ((await cand.count()) > 0) { detachBtn = cand.first(); break; }
    }
    if (detachBtn) {
        record(`[D] found detach affordance — clicking to trigger floating slot`);
        await detachBtn.click({ trial: false }).catch(() => {});
        await page.waitForTimeout(900);
        const floatAfter = await page.locator('[data-testid="pp-screen-floating-slot"]').count();
        record(`[D] after detach click: floating-slot=${floatAfter} (expect 1 if detach succeeded)`);
        await page.screenshot({ path: join(OUT_DIR, "D-after-detach.png"), fullPage: false });
        // Try to find a close/dock-back affordance to restore baseline.
        const closeFloat = page.locator('[aria-label*="close" i], [aria-label*="dock" i]').filter({ visible: true });
        if ((await closeFloat.count()) > 0) {
            await closeFloat.first().click().catch(() => {});
            await page.waitForTimeout(600);
        }
    } else {
        record(`[D] ⚠️ no detach affordance found by name/role — slot trigger NOT exercised`);
    }

    // Find a minimize button.
    const minimizeCandidates = [
        page.getByRole("button", { name: /minimi[sz]e/i }),
        page.locator('[aria-label*="minimi" i]'),
        page.locator('[title*="minimi" i]'),
    ];
    let minBtn = null;
    for (const cand of minimizeCandidates) {
        if ((await cand.count()) > 0) { minBtn = cand.first(); break; }
    }
    if (minBtn) {
        record(`[D] found minimize affordance — clicking to trigger dock slot`);
        await minBtn.click().catch(() => {});
        await page.waitForTimeout(900);
        const dockAfter = await page.locator('[data-testid="pp-screen-dock-slot"]').count();
        record(`[D] after minimize click: dock-slot=${dockAfter} (expect 1 if minimize succeeded)`);
        await page.screenshot({ path: join(OUT_DIR, "D-after-minimize.png"), fullPage: false });
        // Try to restore: click any restore/expand affordance in the dock.
        const restoreBtn = page.locator('[aria-label*="restore" i], [aria-label*="expand" i]').filter({ visible: true });
        if ((await restoreBtn.count()) > 0) {
            await restoreBtn.first().click().catch(() => {});
            await page.waitForTimeout(500);
        }
    } else {
        record(`[D] ⚠️ no minimize affordance found by name/role — dock slot NOT exercised`);
    }
}

// ─── Probe E: Adversarial composer inputs ──────────────────────────
async function probeEAdversarialInputs(page) {
    record(`\n[E] Adversarial composer inputs`);
    const composer = page.locator("textarea").first();
    const askBtn = page.locator("button.pp-ai-sidebar__ask").first();
    if ((await composer.count()) === 0 || (await askBtn.count()) === 0) {
        record(`[E] FAIL: composer or ask button missing — surface didn't mount`);
        return;
    }

    // E1: empty submit
    await composer.fill("");
    const disabledEmpty = await askBtn.isDisabled();
    record(`[E1] empty composer → Ask button disabled=${disabledEmpty} (expect true to block useless submits)`);
    if (!disabledEmpty) {
        // try clicking; should not generate a network call
        const before = apiCalls.filter(c => c.url.includes("/conversations/start")).length;
        await askBtn.click().catch(() => {});
        await page.waitForTimeout(400);
        const after = apiCalls.filter(c => c.url.includes("/conversations/start")).length;
        record(`[E1] click on empty: /conversations/start calls before=${before} after=${after} (expect equal)`);
    }

    // E2: whitespace-only
    await composer.fill("   \t  \n  ");
    const disabledWs = await askBtn.isDisabled();
    record(`[E2] whitespace-only composer → Ask button disabled=${disabledWs} (expect true — should be trimmed-empty)`);

    // E3: markdown / script injection — must NOT be executed; should render as text
    const probeAlertCalled = await page.evaluate(() => {
        window.__probeAlertCalled = false;
        const orig = window.alert;
        window.alert = () => { window.__probeAlertCalled = true; };
        // restore for cleanup at end of probe
        setTimeout(() => { window.alert = orig; }, 30_000);
        return window.__probeAlertCalled;
    });
    const injection = `<img src=x onerror=alert("XSS")> <script>alert("XSS")</script>`;
    await composer.fill(injection);
    // Don't actually submit — we only care that fill itself doesn't trigger.
    await page.waitForTimeout(300);
    const alertFired = await page.evaluate(() => window.__probeAlertCalled);
    record(`[E3] markdown/script injection: fill alone fired alert=${alertFired} (expect false)`);

    // E4: very long input (5000 chars)
    const longText = "a".repeat(5000);
    await composer.fill(longText);
    const filledLen = await composer.inputValue().then(v => v.length);
    record(`[E4] very-long input: composer accepted ${filledLen} chars (expect 5000 unless capped — note any cap)`);

    // E5: single submit → button immediately disabled (proxy for double-submit guard)
    await composer.fill("E5 single-submit probe");
    await askBtn.click().catch(() => {});
    // Sample within 250ms — too fast for Genie to respond, so disabled=true here proves the guard.
    await page.waitForTimeout(250);
    const disabledMid = await askBtn.isDisabled().catch(() => null);
    record(`[E5] mid-flight Ask button disabled=${disabledMid} (expect true — blocks double-submit while request in flight)`);
    // Wait briefly for completion so subsequent probes start clean, but cap at 30s.
    const e5final = await waitForLastEntryFinal(page, 30_000);
    record(`[E5] post-wait last-entry status: ${e5final}`);
    await page.screenshot({ path: join(OUT_DIR, "E-after-adversarial.png"), fullPage: false });
}

// ─── Probe F: Multi-message chat (3 back-to-back) ──────────────────
async function probeFMultiMessageChat(page) {
    record(`\n[F] Multi-message chat — 3 back-to-back Asks`);
    const composer = page.locator("textarea").first();
    const askBtn = page.locator("button.pp-ai-sidebar__ask").first();
    const prompts = [
        "What is the total sales by category?",
        "Top 5 sub-categories by profit?",
        "How many orders in the last 30 days?",
    ];
    for (let i = 0; i < prompts.length; i++) {
        await composer.fill(prompts[i]);
        await askBtn.click().catch(() => {});
        record(`[F${i+1}] submitted "${prompts[i].slice(0, 60)}" — waiting for completion…`);
        const final = await waitForLastEntryFinal(page, 90_000);
        record(`[F${i+1}] final status: ${final}`);
    }
    const entryCount = await page.locator('[data-testid^="pp-ai-entry-"]').count();
    const badgeCount = await page.locator('[data-testid="trust-badge"]').count();
    record(`[F] total entries in DOM: ${entryCount} (expect ≥ 3 from this probe, may include prior E5 leak)`);
    record(`[F] total TrustBadges in DOM: ${badgeCount} (expect ~= entryCount of completed replies)`);
    await page.screenshot({ path: join(OUT_DIR, "F-multi-message.png"), fullPage: true });
}

// ─── Probe G: Genie conversation_id reuse tripwire ─────────────────
async function probeGGenieConversationReuse(page) {
    record(`\n[G] Genie conversation_id reuse (CLAUDE.md tripwire — N message_ids share 1 conversation_id)`);
    const starts = apiCalls.filter(c => c.url.includes("/conversations/start"));
    record(`[G] observed POST /conversations/start count: ${starts.length}`);
    record(`[G]   note: each "start" = a NEW conversation; expected reuse path is the /poll endpoint`);
    const polls = apiCalls.filter(c => c.url.includes("/conversations/poll"));
    record(`[G] observed GET /conversations/poll count: ${polls.length}`);
    // Tripwire: if the UI sometimes calls /start TWICE for what should be the same logical session,
    // that's the bug. We can't enforce the exact ratio without auth-aware deep inspection,
    // but high /start count vs /poll count is a smoke signal.
    if (polls.length > 0 && starts.length > 0) {
        const ratio = (polls.length / starts.length).toFixed(2);
        record(`[G] /poll : /start ratio = ${ratio} (>= 2 is healthy; ≤ 1 suggests over-creation of conversations)`);
    }
}

// ─── Probe H: Toolbar button enumeration ───────────────────────────
async function probeHToolbarEnumeration(page) {
    record(`\n[H] Toolbar button enumeration — every clickable header affordance`);
    // PulsePlay headers live in PaneChrome + UnifiedAssistantSurface header.
    // Walk all visible <button>s within the top 200px of the viewport and
    // characterize them.
    const buttons = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll("button"));
        return all
            .filter(b => {
                const r = b.getBoundingClientRect();
                // Header strip = anywhere in top 220 px, with visible width.
                return r.top < 220 && r.width > 0 && r.height > 0 && r.bottom > 0;
            })
            .map(b => ({
                text: (b.textContent || "").trim().slice(0, 40),
                ariaLabel: b.getAttribute("aria-label"),
                title: b.getAttribute("title"),
                className: b.className.slice(0, 80),
                disabled: b.disabled,
            }));
    });
    record(`[H] visible header buttons: ${buttons.length}`);
    let unlabeledCount = 0;
    for (const [i, b] of buttons.entries()) {
        const label = b.ariaLabel || b.title || b.text || "<UNLABELED>";
        if (label === "<UNLABELED>") unlabeledCount += 1;
        record(`[H${String(i+1).padStart(2,"0")}] "${label}" (text="${b.text}", aria="${b.ariaLabel||""}", title="${b.title||""}", disabled=${b.disabled})`);
    }
    record(`[H] unlabeled (no aria-label / title / text): ${unlabeledCount} (every header button SHOULD have at least one)`);
}

// ─── Probe I: Mobile viewport (768x900) ────────────────────────────
async function probeIMobileViewport(page) {
    record(`\n[I] Mobile viewport — 768 × 900 (per design doc §10.5 collapse threshold)`);
    await page.setViewportSize({ width: 768, height: 900 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT_DIR, "I-mobile-768.png"), fullPage: false });
    // Check 1: composer still clickable
    const composer = page.locator("textarea").first();
    const composerBox = await composer.boundingBox();
    record(`[I] composer bounding box: ${composerBox ? JSON.stringify(composerBox) : "<missing>"}`);
    // Check 2: no horizontal overflow on body
    const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        overflowX: getComputedStyle(document.body).overflowX,
    }));
    record(`[I] body overflowX: ${overflow.overflowX}; scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth} → horizontal overflow=${overflow.scrollWidth > overflow.clientWidth}`);
    // Reset
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.waitForTimeout(500);
}

// ─── Probe J: Reload state persistence ─────────────────────────────
async function probeJStatePersistence(page) {
    record(`\n[J] State persistence across reload`);
    const beforeEntries = await page.locator('[data-testid^="pp-ai-entry-"]').count();
    const beforeUiMode = await page.evaluate(() => window.localStorage.getItem("pulseplay:ui-mode"));
    const beforeProfile = await page.evaluate(() => window.localStorage.getItem("pulseplay:active-ai-profile"));
    record(`[J] before reload: entries=${beforeEntries} uiMode=${JSON.stringify(beforeUiMode)} profile=${JSON.stringify(beforeProfile)}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    const afterEntries = await page.locator('[data-testid^="pp-ai-entry-"]').count();
    const afterUiMode = await page.evaluate(() => window.localStorage.getItem("pulseplay:ui-mode"));
    const afterProfile = await page.evaluate(() => window.localStorage.getItem("pulseplay:active-ai-profile"));
    record(`[J] after  reload: entries=${afterEntries} uiMode=${JSON.stringify(afterUiMode)} profile=${JSON.stringify(afterProfile)}`);
    record(`[J] chat history persisted? ${afterEntries === beforeEntries && beforeEntries > 0 ? "✅" : afterEntries === 0 ? "❌ (cleared on reload — design choice or bug?)" : "PARTIAL"}`);
    record(`[J] uiMode persisted?       ${afterUiMode === beforeUiMode ? "✅" : "❌"}`);
    record(`[J] profile persisted?      ${afterProfile === beforeProfile ? "✅" : "❌"}`);
    await page.screenshot({ path: join(OUT_DIR, "J-after-reload.png"), fullPage: false });
}

// ─── Helper: wait for last entry's final status ────────────────────
async function waitForLastEntryFinal(page, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let final = null;
    while (Date.now() < deadline) {
        await page.waitForTimeout(1500);
        final = await page.evaluate(() => {
            const entries = Array.from(document.querySelectorAll('[data-testid^="pp-ai-entry-"]'));
            const last = entries[entries.length - 1];
            return last ? last.getAttribute("data-status") : null;
        });
        if (final === "completed" || final === "failed") return final;
    }
    return final || "timeout";
}

main().catch(async (err) => {
    console.error("[FAIL]", err);
    process.exitCode = 1;
});
