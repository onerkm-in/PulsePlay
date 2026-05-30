// playground/scripts/verify-no-reload-on-switch.mjs
//
// Proves the screen-switch reload fix: switching between AI Insights /
// Ask Pulse / Dashboard in mix mode must NOT remount the pane content.
//
// Technique — DOM identity marker. After the AI surface first renders, we
// stamp a unique attribute onto its root <section.pp-ai-sidebar> element.
// If switching away and back UNMOUNTS the pane, React rebuilds a fresh
// element and the marker is gone (FAIL — that's the reload). If the pane
// stays mounted (toggle-visibility), the same element keeps its marker
// (PASS — state preserved).
//
// Also asserts the BI pane element persists once revealed.

import { chromium } from "playwright";

const BASE = "http://127.0.0.1:7001";

async function main() {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => {
        try {
            localStorage.setItem("pulseplay:ai-profile", "genie-default");
            localStorage.setItem("pulseplay:bi-vendor", "powerbi");
            localStorage.setItem("pulseplay:api-base-url", "/api");
            // Force mix mode explicitly (the default), clear any stale override.
            localStorage.setItem("pulseplay:enabled-components", "mix");
            localStorage.setItem("pulseplay:setup-wizard-dismissed", "true");
        } catch { /* ignore */ }
    });
    const page = await ctx.newPage();
    const results = [];
    const log = (ok, msg) => { results.push({ ok, msg }); console.log(`  ${ok ? "✅" : "❌"} ${msg}`); };

    // Start on AI Insights.
    await page.goto(`${BASE}/?surface=ai-insights`, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(1500);

    // The AI surface root must be present.
    const aiSel = "section.pp-ai-sidebar";
    await page.waitForSelector(aiSel, { timeout: 8000 }).catch(() => {});
    const aiPresent = await page.locator(aiSel).count();
    log(aiPresent > 0, `AI surface (section.pp-ai-sidebar) rendered on load (count=${aiPresent})`);

    // Stamp a unique marker onto the AI surface root.
    const MARKER = `probe-${Date.now()}`;
    const stamped = await page.evaluate(({ sel, marker }) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        el.setAttribute("data-mount-marker", marker);
        // Also stamp a child to detect inner subtree rebuild.
        const header = el.querySelector(".pp-ai-sidebar__header");
        if (header) header.setAttribute("data-mount-marker-child", marker);
        return true;
    }, { sel: aiSel, marker: MARKER });
    log(stamped, `Stamped identity marker '${MARKER}' onto AI surface`);

    // Find the surface switcher tabs.
    const dashTab = page.getByRole("tab", { name: /Dashboard/i });
    const insightsTab = page.getByRole("tab", { name: /AI Insights/i });
    const askTab = page.getByRole("tab", { name: /Ask Pulse/i });
    const tabCount = await page.getByRole("tab").count();
    log(tabCount >= 3, `Surface switcher present with ${tabCount} tabs`);

    // Switch AI Insights → Dashboard.
    await dashTab.click();
    await page.waitForTimeout(1200);
    const aiStillMountedAfterDash = await page.evaluate(({ sel, marker }) => {
        const el = document.querySelector(`${sel}[data-mount-marker="${marker}"]`);
        return !!el;
    }, { sel: aiSel, marker: MARKER });
    log(aiStillMountedAfterDash, "After AI→Dashboard: AI surface element still in DOM with marker (not unmounted)");

    // The BI canvas should now be visible. Stamp it too.
    const biSel = ".pp-app__canvas";
    const biPresent = await page.locator(biSel).count();
    const biMarker = `bi-${Date.now()}`;
    await page.evaluate(({ sel, marker }) => {
        const el = document.querySelector(sel);
        if (el) el.setAttribute("data-mount-marker", marker);
    }, { sel: biSel, marker: biMarker });
    log(biPresent > 0, `Dashboard canvas (.pp-app__canvas) present after switch (count=${biPresent})`);

    // Switch Dashboard → AI Insights.
    await insightsTab.click();
    await page.waitForTimeout(1200);
    const aiMarkerSurvived = await page.evaluate(({ sel, marker }) => {
        const el = document.querySelector(`${sel}[data-mount-marker="${marker}"]`);
        const child = el?.querySelector(`.pp-ai-sidebar__header[data-mount-marker-child="${marker}"]`);
        return { rootOk: !!el, childOk: !!child };
    }, { sel: aiSel, marker: MARKER });
    log(aiMarkerSurvived.rootOk, "After Dashboard→AI: AI surface root SAME element (marker survived round-trip) — NO RELOAD");
    log(aiMarkerSurvived.childOk, "After Dashboard→AI: AI surface inner subtree preserved (child marker survived)");

    // Switch back to Dashboard — BI element identity should also survive.
    await dashTab.click();
    await page.waitForTimeout(1000);
    const biMarkerSurvived = await page.evaluate(({ sel, marker }) => {
        return !!document.querySelector(`${sel}[data-mount-marker="${marker}"]`);
    }, { sel: biSel, marker: biMarker });
    log(biMarkerSurvived, "After AI→Dashboard again: Dashboard canvas SAME element (marker survived) — NO RELOAD");

    // Also exercise Ask Pulse (same AI pane in v0) — marker must persist.
    await askTab.click();
    await page.waitForTimeout(1000);
    const aiMarkerAfterAsk = await page.evaluate(({ sel, marker }) => {
        return !!document.querySelector(`${sel}[data-mount-marker="${marker}"]`);
    }, { sel: aiSel, marker: MARKER });
    log(aiMarkerAfterAsk, "After →Ask Pulse: AI surface marker still present (AI Insights ↔ Ask Pulse no reload)");

    await page.screenshot({ path: "screenshots/verify-no-reload-final.png", fullPage: false });

    await browser.close();

    const passed = results.filter(r => r.ok).length;
    const total = results.length;
    console.log(`\n${passed === total ? "✔ PASS" : "✘ FAIL"} — ${passed}/${total} checks`);
    if (passed !== total) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
