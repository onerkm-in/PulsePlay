// playground/scripts/smoke-uncommitted.mjs
//
// Consolidated UI smoke over every UNCOMMITTED fix from the 2026-05-28
// session. Each check group runs in its own fresh browser context (isolated
// localStorage) so state from one check can't leak into another. Produces a
// pass/fail matrix + screenshots in screenshots/smoke/. Exit code != 0 if any
// check fails, so failures are easy to spot and fix incrementally.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://127.0.0.1:7001";
const OUT = "screenshots/smoke";
const GENIE_KEY = "pulseplay:visual-settings:genieSettings";

const allResults = [];
function group(name) {
    const checks = [];
    allResults.push({ name, checks });
    return (ok, msg) => { checks.push({ ok, msg }); console.log(`  ${ok ? "✅" : "❌"} ${msg}`); };
}

async function freshPage(browser, seed = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addInitScript((s) => {
        try {
            localStorage.setItem("pulseplay:ai-profile", "genie-default");
            localStorage.setItem("pulseplay:bi-vendor", "powerbi");
            localStorage.setItem("pulseplay:api-base-url", "/api");
            localStorage.setItem("pulseplay:setup-wizard-dismissed", "true");
            localStorage.removeItem("pulseplay:ui-mode");
            for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
        } catch { /* ignore */ }
    }, seed);
    return { ctx, page: await ctx.newPage() };
}

const CONFIGURED = {
    [GENIE_KEY]: JSON.stringify({ assistantProfile: "genie-default", connectionMode: "proxy", apiBaseUrl: "/api" }),
};

async function main() {
    await mkdir(OUT, { recursive: true });
    const browser = await chromium.launch({ headless: true });

    // ── A. Workbench default + reload-on-switch ────────────────────────
    {
        const log = group("A. Workbench default + no-reload");
        const { ctx, page } = await freshPage(browser);
        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 25000 });
        await page.waitForTimeout(2500);
        log(await page.locator("#gn-tab-insights, .gn-header-tab").count() > 0, "Cold boot renders Workbench (gn-* tabs)");
        log(await page.locator("section.pp-ai-sidebar").count() === 0, "v0 Chat surface NOT booted by default");
        const MARK = `wb-${Date.now()}`;
        await page.evaluate((m) => {
            const tab = document.getElementById("gn-tab-insights") || document.querySelector(".gn-header-tab");
            if (tab) { let r = tab; for (let i = 0; i < 8 && r.parentElement; i++) r = r.parentElement; r.setAttribute("data-mk", m); }
        }, MARK);
        const dash = page.locator("#gn-tab-dashboard");
        if (await dash.count() > 0) {
            await dash.click(); await page.waitForTimeout(1000);
            await page.evaluate(() => window.dispatchEvent(new CustomEvent("pulseplay:viewport-action", { detail: { action: "restore", pane: "bi" } })));
            await page.waitForTimeout(1000);
            log(await page.locator(`[data-mk="${MARK}"]`).count() > 0, "PulseShell SAME element after Dashboard round-trip (no reload)");
        } else {
            log(false, "Dashboard tab not found");
        }
        await page.screenshot({ path: `${OUT}/A-workbench.png` });
        await ctx.close();
    }

    // ── B. Chat-surface author gate ────────────────────────────────────
    {
        const log = group("B. Chat-surface gate");
        const { ctx, page } = await freshPage(browser);
        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(1800);
        log(await page.locator("[data-testid='pp-surface-mode-chip']").count() === 0, "Chip hidden by default (Chat surface off)");
        await page.goto(`${BASE}/settings/preferences/chat-surface`, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForTimeout(900);
        const label = page.locator("label", { hasText: /Allow end users to switch to the Chat surface/i }).first();
        log(await label.count() > 0, "Chat-surface toggle present in Settings → Display");
        if (await label.count() > 0) {
            await label.click(); await page.waitForTimeout(500);
        }
        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(1800);
        log(await page.locator("[data-testid='pp-surface-mode-chip']").count() > 0, "Chip appears after author enables Chat surface");
        await page.screenshot({ path: `${OUT}/B-chat-gate.png` });
        await ctx.close();
    }

    // ── C. Adjust dropdown scrollbar ───────────────────────────────────
    {
        const log = group("C. Adjust dropdown scrollbar");
        const { ctx, page } = await freshPage(browser, CONFIGURED);
        await ctx.newPage; // noop
        const p2 = page;
        await p2.setViewportSize({ width: 1280, height: 620 });
        await p2.goto(`${BASE}/?surface=ai-insights`, { waitUntil: "domcontentloaded", timeout: 25000 });
        await p2.waitForTimeout(2500);
        const adjust = p2.locator(".gn-header-adjust");
        if (await adjust.count() > 0) {
            await adjust.first().click(); await p2.waitForTimeout(400);
            const m = await p2.locator(".gn-adjust-menu-pop").first().evaluate(el => ({
                overflowY: getComputedStyle(el).overflowY,
                overflow: el.scrollHeight > el.clientHeight,
            })).catch(() => null);
            log(!!m && (m.overflowY === "auto" || m.overflowY === "scroll"), `Adjust menu scrollable (overflow-y=${m?.overflowY})`);
            log(!!m && m.overflow, "Adjust menu content overflows the cap → scrollbar active");
            await p2.screenshot({ path: `${OUT}/C-adjust.png` });
        } else {
            log(false, "Adjust button not shown (profile not configured?)");
        }
        await ctx.close();
    }

    // ── D. Workbench templates picker ──────────────────────────────────
    {
        const log = group("D. Workbench templates");
        const { ctx, page } = await freshPage(browser);
        await page.goto(`${BASE}/settings/preferences/workbench-template`, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForTimeout(1000);
        const radios = page.locator("[role='radiogroup'][aria-label='Workbench templates'] [role='radio']");
        const n = await radios.count();
        log(n === 5, `Template picker shows 5 templates (count=${n})`);
        if (n > 0) {
            await radios.nth(1).click(); await page.waitForTimeout(400);
            log(await radios.nth(1).getAttribute("aria-checked") === "true", "Applying a template marks it current");
        }
        await page.screenshot({ path: `${OUT}/D-templates.png` });
        await ctx.close();
    }

    // ── E. Developer Tools sub-page (canonical SystemDeveloper) ────────
    //   NOTE: my Slice-1 DeveloperToolsLeaf was a DUPLICATE of the existing
    //   SystemDeveloper sub-page (commit ed66cb7) and was removed. This
    //   check confirms the canonical sub-page renders the 5 dev flags.
    {
        const log = group("E. Developer Tools sub-page");
        const { ctx, page } = await freshPage(browser);
        await page.goto(`${BASE}/settings/system/developer-tools`, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForTimeout(1000);
        const labels = ["Developer mode", "Show SQL tab", "Show Trace tab", "Connector compatibility warnings", "Allow report actions"];
        let present = 0;
        for (const l of labels) present += (await page.getByText(l, { exact: false }).count()) > 0 ? 1 : 0;
        log(present >= 5, `Canonical Developer Tools page renders all 5 dev flags (${present}/5 found)`);
        // Confirm no duplicate "Developer Tools" leaf lingers on the System landing.
        await page.goto(`${BASE}/settings/system`, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForTimeout(800);
        const dupLeaf = await page.getByText("Show generated SQL", { exact: false }).count();
        log(dupLeaf === 0, `No duplicate DeveloperToolsLeaf on the System landing (found ${dupLeaf})`);
        await page.screenshot({ path: `${OUT}/E-devtools.png` });
        await ctx.close();
    }

    // ── F. Numeric Formatting activator + ⓘ help ───────────────────────
    {
        const log = group("F. Numeric Formatting activator");
        const { ctx, page } = await freshPage(browser);
        await page.goto(`${BASE}/settings/ai/response-behavior`, { waitUntil: "domcontentloaded", timeout: 18000 });
        await page.waitForTimeout(1200);
        const ta = page.locator("textarea[placeholder*='Numeric Formatting']");
        log(await ta.count() > 0, "Domain guidance shows the activator placeholder");
        const help = page.locator("button[aria-label='Guidance keyword help']");
        log(await help.count() > 0, "ⓘ help button present");
        if (await help.count() > 0) {
            await help.first().hover(); await page.waitForTimeout(250);
            await help.first().focus().catch(() => {});
            await page.waitForTimeout(350);
            const tip = await page.locator("[role='tooltip']").first().innerText().catch(() => "");
            log(/unity catalog/i.test(tip), "ⓘ tooltip carries the honest UC-masking caveat");
        }
        await page.screenshot({ path: `${OUT}/F-activator.png` });
        await ctx.close();
    }

    // ── G. Markdown ## Section editor ──────────────────────────────────
    {
        const log = group("G. Markdown sections");
        const { ctx, page } = await freshPage(browser, {
            [GENIE_KEY]: JSON.stringify({ assistantProfile: "genie-default", connectionMode: "proxy", apiBaseUrl: "/api",
                insightsCustomSections: JSON.stringify([{ name: "KPI", sql: "select 1", kind: "sql", resultRender: "kpi" }]) }),
        });
        await page.goto(`${BASE}/settings/ai/ai-insights-sections`, { waitUntil: "domcontentloaded", timeout: 18000 });
        await page.waitForTimeout(1200);
        const ed = page.locator("[data-testid='pp-section-md-textarea']");
        log(await ed.count() > 0, "Markdown section editor present");
        if (await ed.count() > 0) {
            await ed.first().fill("## Executive Brief\nSummarize revenue.\n\n## Risks\nTop 3 risks.");
            await page.waitForTimeout(500);
            const status = await page.locator("[data-testid='pp-section-md-status']").first().innerText().catch(() => "");
            log(/2 AI sections/i.test(status), `Live count = 2 AI sections (${status.replace(/\n/g, " ").slice(0, 80)})`);
            log(/1 SQL section/i.test(status), "Pre-existing SQL section preserved");
        }
        await page.screenshot({ path: `${OUT}/G-md-sections.png` });
        await ctx.close();
    }

    // ── H. SQL sections + Validate ─────────────────────────────────────
    {
        const log = group("H. SQL sections + Validate");
        const { ctx, page } = await freshPage(browser, CONFIGURED);
        await page.goto(`${BASE}/settings/ai/sql-sections`, { waitUntil: "domcontentloaded", timeout: 18000 });
        await page.waitForTimeout(1200);
        log(await page.locator("[data-testid='pp-sql-sections-editor']").count() > 0, "SQL sections editor present");
        await page.locator("[data-testid='pp-sql-section-add']").first().click();
        await page.waitForTimeout(300);
        await page.locator("[data-testid='pp-sql-section-0'] input[type='text']").first().fill("Revenue");
        await page.locator("[data-testid='pp-sql-section-0-sql']").fill("DROP TABLE x");
        await page.locator("[data-testid='pp-sql-section-0-validate']").click();
        await page.waitForTimeout(400);
        const lint = await page.locator("[data-testid='pp-sql-section-0']").innerText();
        log(/forbidden|DML|read-only/i.test(lint), "DML SQL caught by client-side lint");
        await page.locator("[data-testid='pp-sql-section-0-sql']").fill("select 1 as a");
        await page.waitForTimeout(300);
        await page.locator("[data-testid='pp-sql-section-0-validate']").click();
        await page.waitForTimeout(2500);
        const after = await page.locator("[data-testid='pp-sql-section-0']").innerText();
        log(/✓|✗|Returned|error|status|Proxy|Network|profile|cancelled/i.test(after), "Validate wired → resolves to a result/error badge");
        await page.screenshot({ path: `${OUT}/H-sql.png` });
        await ctx.close();
    }

    await browser.close();

    // ── Report matrix ──────────────────────────────────────────────────
    console.log("\n══════════════ SMOKE MATRIX ══════════════");
    let total = 0, passed = 0;
    const failures = [];
    for (const g of allResults) {
        const gp = g.checks.filter(c => c.ok).length;
        total += g.checks.length; passed += gp;
        console.log(`${gp === g.checks.length ? "✔" : "✘"} ${g.name} — ${gp}/${g.checks.length}`);
        for (const c of g.checks) if (!c.ok) failures.push(`${g.name} :: ${c.msg}`);
    }
    console.log(`\nTOTAL ${passed}/${total}`);
    if (failures.length) {
        console.log("\nFAILURES:");
        for (const f of failures) console.log(`  ✘ ${f}`);
        process.exit(1);
    }
    console.log("\n✔ ALL SMOKE CHECKS PASSED");
}

main().catch(err => { console.error(err); process.exit(1); });
