// playground/scripts/verify-nav-intense.mjs
//
// Intense navigation smoke for the Workbench tab/surface bugs:
//   (1) app must START on AI Insights (not the sticky last surface),
//   (2) the AI-pane RELOAD action must NOT bounce the user to Ask Pulse,
//   (3) a settings/Adjust re-render must NOT bounce either,
//   (4) tab nav (AI Insights ↔ Ask Pulse) round-trips cleanly.
//
// Bugs (1)+(2)+(3) all came from the same place: App's reload/settings
// handlers bump `pulseRenderToken`, and PulseShell's tab-dispatch effect
// used to depend on renderToken — so every re-render re-asserted the App's
// (stale) requestedPulseTab over the user's current tab. We fire the REAL
// events (`pulseplay:viewport-action` reload + `pulseplay:visual-settings-
// change`) so the test exercises the exact mechanism — no configured
// profile needed.
//
// Run headed (visible browser) with: HEADED=1 node scripts/verify-nav-intense.mjs

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://127.0.0.1:7001";
const OUT = "screenshots/nav";
const GENIE_KEY = "pulseplay:visual-settings:genieSettings";

const results = [];
const errors = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(`  ${ok ? "✅" : "❌"} ${msg}`); };

async function activeTab(page) {
    return page.evaluate(() => {
        const ins = document.getElementById("gn-tab-insights");
        const chat = document.getElementById("gn-tab-chat");
        if (ins?.getAttribute("aria-selected") === "true") return "insights";
        if (chat?.getAttribute("aria-selected") === "true") return "chat";
        if (ins?.className.includes("--active")) return "insights";
        if (chat?.className.includes("--active")) return "chat";
        return "(unknown)";
    });
}

// Fire the REAL App-level renderToken bumps (reload + settings-change).
async function bumpReload(page) {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("pulseplay:viewport-action", { detail: { pane: "ai", action: "reload" } })));
}
async function bumpSettings(page) {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("pulseplay:visual-settings-change", { detail: {} })));
}

async function main() {
    await mkdir(OUT, { recursive: true });
    const HEADED = process.env.HEADED === "1";
    const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 600 : 0 });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // Seed sticky active-surface = ASK-PULSE on purpose: the new default-landing
    // logic must IGNORE it and still open on AI Insights.
    await ctx.addInitScript(() => {
        try {
            localStorage.setItem("pulseplay:ai-profile", "default");
            localStorage.setItem("pulseplay:bi-vendor", "powerbi");
            localStorage.setItem("pulseplay:api-base-url", "/api");
            localStorage.setItem("pulseplay:setup-wizard-dismissed", "true");
            localStorage.removeItem("pulseplay:ui-mode");
            localStorage.removeItem("pulseplay:default-landing-surface"); // no author override
            localStorage.setItem("pulseplay:active-surface", "ask-pulse"); // sticky → must be ignored
            localStorage.setItem(GENIE_KEY, JSON.stringify({
                assistantProfile: "default", connectionMode: "proxy",
                apiBaseUrl: "http://127.0.0.1:7001/api",
            }));
        } catch { /* ignore */ }
    });
    const page = await ctx.newPage();
    page.on("console", m => { if (m.type() === "error") errors.push("console.error: " + m.text().slice(0, 200)); });
    page.on("pageerror", e => errors.push("pageerror: " + (e.message || String(e)).slice(0, 200)));

    console.log("\n— Boot (sticky surface = ask-pulse; should still land on AI Insights) —");
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(3000);

    log(await page.locator("#gn-tab-insights, .gn-header-tab").count() > 0, "Workbench tab strip rendered");
    const landed = await activeTab(page);
    log(landed === "insights", `Lands on AI Insights despite sticky ask-pulse (was=${landed})`);
    await page.screenshot({ path: `${OUT}/01-boot.png` });

    console.log("\n— Reload action ×3 on AI Insights (the reported bounce) —");
    for (let i = 1; i <= 3; i++) {
        await bumpReload(page);
        await page.waitForTimeout(700);
        const t = await activeTab(page);
        log(t === "insights", `Reload #${i}: stays on AI Insights (was=${t})`);
    }
    await page.screenshot({ path: `${OUT}/02-after-reloads.png` });

    console.log("\n— Settings/Adjust re-render on AI Insights —");
    await bumpSettings(page); await page.waitForTimeout(700);
    log(await activeTab(page) === "insights", "Settings-change re-render: stays on AI Insights");

    console.log("\n— Tab round-trip + reload while on Ask Pulse —");
    if (await page.locator("#gn-tab-chat").count() > 0) {
        await page.locator("#gn-tab-chat").click(); await page.waitForTimeout(600);
        log(await activeTab(page) === "chat", "Click Ask Pulse → switches to chat");
        // Reload while ON chat must keep us on chat (not snap to insights either).
        await bumpReload(page); await page.waitForTimeout(700);
        log(await activeTab(page) === "chat", "Reload while on Ask Pulse: stays on Ask Pulse");
        await page.locator("#gn-tab-insights").click(); await page.waitForTimeout(600);
        log(await activeTab(page) === "insights", "Click AI Insights → switches back");
        await bumpReload(page); await page.waitForTimeout(700);
        log(await activeTab(page) === "insights", "Reload after returning to AI Insights: stays put");
    }

    await page.screenshot({ path: `${OUT}/03-final.png` });
    if (HEADED) await page.waitForTimeout(1500);
    await browser.close();

    console.log("\n=== console/page errors captured ===");
    if (errors.length === 0) console.log("  (none)");
    else [...new Set(errors)].slice(0, 12).forEach(e => console.log("  ⚠ " + e));

    const passed = results.filter(r => r.ok).length;
    console.log(`\n${passed === results.length ? "✔ PASS" : "✘ CHECK"} — ${passed}/${results.length} nav checks`);
    if (passed !== results.length) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
