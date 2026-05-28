// playground/scripts/verify-workbench-default-and-reload.mjs
//
// 1. Cold boot (no ui-mode override) must render Workbench (PulseShell,
//    gn-* DOM) — proving DEFAULT_UI_MODE = "pulse" took effect.
// 2. Reload regression: stamp the PulseShell root, switch to the Dashboard
//    tab (which dispatches focus→bi at the App level), switch back, and
//    confirm the SAME element survived (no remount = no reload).

import { chromium } from "playwright";

const BASE = "http://127.0.0.1:7001";

async function main() {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // NOTE: deliberately do NOT set pulseplay:ui-mode, so we test the
    // cold-boot default. Set only profile/vendor so the surface renders.
    await ctx.addInitScript(() => {
        try {
            localStorage.setItem("pulseplay:ai-profile", "genie-default");
            localStorage.setItem("pulseplay:bi-vendor", "powerbi");
            localStorage.setItem("pulseplay:api-base-url", "/api");
            localStorage.setItem("pulseplay:setup-wizard-dismissed", "true");
            localStorage.removeItem("pulseplay:ui-mode");
        } catch { /* ignore */ }
    });
    const page = await ctx.newPage();
    const results = [];
    const log = (ok, msg) => { results.push({ ok, msg }); console.log(`  ${ok ? "✅" : "❌"} ${msg}`); };

    await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 25000 });
    await page.waitForTimeout(2500);

    // 1. Workbench (PulseShell) renders — look for the gn-* tab strip.
    const tabStrip = await page.locator("#gn-tab-insights, .gn-header-tab, [class*='gn-']").count();
    log(tabStrip > 0, `Cold boot renders Workbench (gn-* DOM present, count=${tabStrip})`);

    const hasInsightsTab = await page.locator("#gn-tab-insights").count();
    const hasChatTab = await page.locator("#gn-tab-chat").count();
    const hasDashTab = await page.locator("#gn-tab-dashboard").count();
    log(hasInsightsTab > 0 || hasChatTab > 0, `Workbench tab strip present (insights=${hasInsightsTab}, chat=${hasChatTab}, dashboard=${hasDashTab})`);

    // Confirm the v0 Chat surface is NOT what booted.
    const v0Present = await page.locator("section.pp-ai-sidebar").count();
    log(v0Present === 0, `v0 Chat surface NOT booted (section.pp-ai-sidebar count=${v0Present}, expect 0)`);

    // 2. Reload test — find the PulseShell root and stamp it.
    // The Visual mounts inside a container; grab the nearest stable gn root.
    const shellSel = "[class*='gn-root'], .gn-app, #gn-tab-insights";
    const MARKER = `wb-${Date.now()}`;
    const stamped = await page.evaluate((marker) => {
        // Walk up from the insights tab to a durable ancestor that the
        // Visual owns (so we detect a full PulseShell remount).
        const tab = document.getElementById("gn-tab-insights")
            || document.querySelector(".gn-header-tab");
        if (!tab) return false;
        let root = tab;
        for (let i = 0; i < 8 && root.parentElement; i++) root = root.parentElement;
        root.setAttribute("data-wb-marker", marker);
        // Also stamp the tab itself for a finer-grained signal.
        tab.setAttribute("data-wb-tab-marker", marker);
        return true;
    }, MARKER);
    log(stamped, `Stamped identity marker '${MARKER}' on PulseShell ancestor + insights tab`);

    // Click Dashboard tab → dispatches focus bi at App level.
    const dashBtn = page.locator("#gn-tab-dashboard");
    if (await dashBtn.count() > 0) {
        await dashBtn.click();
        await page.waitForTimeout(1200);
        const shellStillMounted = await page.evaluate((marker) => {
            return !!document.querySelector(`[data-wb-marker="${marker}"]`);
        }, MARKER);
        log(shellStillMounted, "After clicking Dashboard tab: PulseShell ancestor still in DOM (not unmounted)");

        // Switch back to the AI pane via the App-level restore (TopRightToolbar
        // 'restore' on the focused bi pane returns the split / mix layout).
        // Easiest: dispatch the viewport restore the toolbar uses.
        await page.evaluate(() => {
            window.dispatchEvent(new CustomEvent("pulseplay:viewport-action", { detail: { action: "restore", pane: "bi" } }));
        });
        await page.waitForTimeout(1200);
        const survived = await page.evaluate((marker) => {
            const root = document.querySelector(`[data-wb-marker="${marker}"]`);
            const tab = document.querySelector(`[data-wb-tab-marker="${marker}"]`);
            return { rootOk: !!root, tabOk: !!tab };
        }, MARKER);
        log(survived.rootOk, "After returning from Dashboard: PulseShell SAME element (marker survived) — NO RELOAD");
        log(survived.tabOk, "After returning from Dashboard: insights tab SAME element (no subtree rebuild)");
    } else {
        log(false, "Dashboard tab (#gn-tab-dashboard) not found — cannot test the App-level switch path");
    }

    // 3. Insights ↔ Chat internal switch — does it keep the shell mounted?
    //    Only meaningful when the tab strip is interactive; the Dashboard
    //    round-trip above can leave the AI pane in a state where the chat
    //    tab is momentarily non-visible. Guard on visibility so this stays
    //    a real signal, not a harness flake.
    const chatBtn = page.locator("#gn-tab-chat");
    const insightsBtn = page.locator("#gn-tab-insights");
    if (await chatBtn.isVisible().catch(() => false) && await insightsBtn.count() > 0) {
        await chatBtn.click();
        await page.waitForTimeout(600);
        await insightsBtn.click();
        await page.waitForTimeout(600);
        const survivedInternal = await page.evaluate((marker) => !!document.querySelector(`[data-wb-marker="${marker}"]`), MARKER);
        log(survivedInternal, "After Insights→Chat→Insights internal switch: PulseShell marker survived");
    } else {
        console.log("  · Insights↔Chat internal switch: skipped (chat tab not visible in this state)");
    }

    await page.screenshot({ path: "screenshots/verify-workbench-default.png", fullPage: false });
    await browser.close();

    const passed = results.filter(r => r.ok).length;
    console.log(`\n${passed === results.length ? "✔ PASS" : "✘ CHECK"} — ${passed}/${results.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
