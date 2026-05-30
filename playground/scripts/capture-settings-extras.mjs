// playground/scripts/capture-settings-extras.mjs
//
// Additional screenshots beyond the parent + child set:
//   - "Copy link" Copied state (hover + click feedback)
//   - Status chips (sticky strip across all pages)
//   - Rail expanded / collapsed state
//   - Drill-down expanders (Connector catalogue "Show all 12", Add another profile)
//   - Save bar in dirty state
//   - Search-filtered rail
//   - Hidden routes: every legacy /settings/setup and /settings/system sub-page
//
// Outputs PNGs to playground/screenshots/settings-pages/extras-*.png

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "screenshots", "settings-pages");
const BASE = "http://127.0.0.1:7001";

async function setup(browser) {
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        permissions: ["clipboard-read", "clipboard-write"],
    });
    await ctx.addInitScript(() => {
        try {
            localStorage.setItem("pulseplay:ai-profile", "genie-default");
            localStorage.setItem("pulseplay:bi-vendor", "powerbi");
            localStorage.setItem("pulseplay:api-base-url", "/api");
            localStorage.setItem("pulseplay:settings-last-group", "ai");
            localStorage.setItem("pulseplay:setup-wizard-dismissed", "true");
        } catch { /* ignore */ }
    });
    return ctx;
}

async function shot(page, name) {
    const out = join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`  ✔ ${name}`);
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const ctx = await setup(browser);
    const page = await ctx.newPage();

    // 1. Copy-link Copied feedback (click a known leaf's button + screenshot)
    console.log("• extras-copy-link-copied");
    await page.goto(`${BASE}/settings/bi/provider`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const copyBtn = page.locator("[data-testid^='pp-leaf-copy-link-bi-']").first();
    if (await copyBtn.count() > 0) {
        await copyBtn.scrollIntoViewIfNeeded();
        await copyBtn.click();
        await page.waitForTimeout(150); // catch the "Copied" flash
        await shot(page, "extras-01-copy-link-copied");
    }

    // 2. Status chip hover (sticky strip — capture default + hovered)
    console.log("• extras-status-chips-hover");
    await page.goto(`${BASE}/settings/ai`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await page.locator(".pp-settings-chip").nth(2).hover();
    await page.waitForTimeout(150);
    await shot(page, "extras-02-status-chips-hover");

    // 3. Rail with ALL groups expanded
    console.log("• extras-rail-all-expanded");
    await page.goto(`${BASE}/settings/ai`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await page.evaluate(() => {
        document.querySelectorAll(".pp-settings-rail__group button[aria-expanded='false']").forEach(b => b.click());
    });
    await page.waitForTimeout(300);
    await shot(page, "extras-03-rail-all-expanded");

    // 4. Search-filtered rail (typing narrows the rail to matching groups)
    console.log("• extras-rail-search-filtered");
    await page.goto(`${BASE}/settings/ai`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.locator(".pp-settings-search__input").fill("knowledge");
    await page.waitForTimeout(300);
    await shot(page, "extras-04-rail-search-knowledge");
    await page.locator(".pp-settings-search__input").fill("dax");
    await page.waitForTimeout(300);
    await shot(page, "extras-05-rail-search-dax");

    // 5. Connector catalogue "Show all 12" expanded
    console.log("• extras-connector-catalogue-show-all");
    await page.goto(`${BASE}/settings/ai/connector-catalogue`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    const showAll = page.getByRole("button", { name: /Show all \d+/i }).first();
    if (await showAll.count() > 0) {
        await showAll.click();
        await page.waitForTimeout(400);
        await shot(page, "extras-06-connector-catalogue-show-all-expanded");
    } else {
        await shot(page, "extras-06-connector-catalogue-no-expander");
    }

    // 6. "Add another profile" expanded inside a connector tile
    console.log("• extras-add-another-profile-expanded");
    await page.goto(`${BASE}/settings/ai/connector-catalogue`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    const addAnother = page.getByText(/Add another profile/i).first();
    if (await addAnother.count() > 0) {
        await addAnother.click();
        await page.waitForTimeout(400);
        await shot(page, "extras-07-add-another-profile-expanded");
    }

    // 7. Save bar in dirty state (toggle a checkbox to trigger draft.dirty)
    console.log("• extras-save-bar-dirty");
    await page.goto(`${BASE}/settings/preferences`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    // Toggle the first available checkbox so the unsaved-changes bar lights up.
    const firstCheckbox = page.locator(".pp-settings-main input[type='checkbox']").first();
    if (await firstCheckbox.count() > 0) {
        await firstCheckbox.click();
        await page.waitForTimeout(400);
        await shot(page, "extras-08-save-bar-dirty");
        // Restore so subsequent screenshots aren't polluted.
        await firstCheckbox.click();
        await page.waitForTimeout(200);
    }

    // 8. Hidden / wizard / drill-down sub-routes — capture every reachable
    //     /settings/<group>/<slug> regardless of whether the rail surfaces it.
    //     These come from a wider net of slugs the app might emit via deep links
    //     in error messages, audit pings, or programmatic navigation.
    console.log("• extras-hidden-routes");
    const HIDDEN_ROUTES = [
        // Setup group (legacy, no rail entry, but route still resolves)
        { slug: "extras-09-hidden-setup",            path: "/settings/setup" },
        { slug: "extras-10-hidden-setup-quickstart", path: "/settings/setup/quickstart" },
        // System group sub-routes that aren't in GROUP_LEAF_LABELS but the
        // SettingsShell ActiveGroup dispatcher resolves a few specific ones.
        { slug: "extras-11-hidden-system-developer-tools", path: "/settings/system/developer-tools" },
        { slug: "extras-12-hidden-bi-governance-deep",     path: "/settings/bi/governance" },
        // AI deep sub-routes.
        { slug: "extras-13-hidden-ai-knowledge-base",      path: "/settings/ai/knowledge-base" },
        { slug: "extras-14-hidden-ai-supervisor-fusion",   path: "/settings/ai/supervisor-fusion" },
        // Preferences appearance sub-route (already in main set, repeat at full state)
        { slug: "extras-15-hidden-preferences-appearance", path: "/settings/preferences/appearance" },
    ];
    for (const r of HIDDEN_ROUTES) {
        try {
            await page.goto(`${BASE}${r.path}`, { waitUntil: "networkidle", timeout: 12000 });
        } catch { /* ignore */ }
        await page.waitForTimeout(600);
        await shot(page, r.slug);
    }

    // 9. Search counts banner visible (top of page when filter is active)
    console.log("• extras-search-counts");
    await page.goto(`${BASE}/settings/ai`, { waitUntil: "networkidle" });
    await page.locator(".pp-settings-search__input").fill("preset");
    await page.waitForTimeout(300);
    await shot(page, "extras-16-search-preset-results");

    // 10. Back button hover (header pill)
    console.log("• extras-back-button-hover");
    await page.goto(`${BASE}/settings/ai`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.locator(".pp-settings-header__back").hover();
    await page.waitForTimeout(150);
    await shot(page, "extras-17-back-button-hover");

    await browser.close();

    // Append extras section to README.
    const extras = [
        { slug: "extras-01-copy-link-copied",                  desc: "Copy link button clicked — 'Copied' flash state" },
        { slug: "extras-02-status-chips-hover",                desc: "Sticky status chip strip on hover" },
        { slug: "extras-03-rail-all-expanded",                 desc: "Left rail with every group expanded showing all leaves" },
        { slug: "extras-04-rail-search-knowledge",             desc: "Rail filtered by search term 'knowledge'" },
        { slug: "extras-05-rail-search-dax",                   desc: "Rail filtered by search term 'dax'" },
        { slug: "extras-06-connector-catalogue-show-all-expanded", desc: "Connector catalogue with 'Show all 12' expanded" },
        { slug: "extras-07-add-another-profile-expanded",      desc: "Connector tile with 'Add another profile' expanded" },
        { slug: "extras-08-save-bar-dirty",                    desc: "Unsaved-changes save bar visible (dirty state)" },
        { slug: "extras-09-hidden-setup",                      desc: "Legacy /settings/setup (hidden from rail)" },
        { slug: "extras-10-hidden-setup-quickstart",           desc: "Deep route /settings/setup/quickstart (hidden)" },
        { slug: "extras-11-hidden-system-developer-tools",     desc: "Hidden sub: SystemDeveloper" },
        { slug: "extras-12-hidden-bi-governance-deep",         desc: "Hidden sub: BiGovernance" },
        { slug: "extras-13-hidden-ai-knowledge-base",          desc: "Hidden sub: AiKnowledgeBase" },
        { slug: "extras-14-hidden-ai-supervisor-fusion",       desc: "Hidden sub: AiSupervisorFusion" },
        { slug: "extras-15-hidden-preferences-appearance",     desc: "Hidden sub: PreferencesAppearance" },
        { slug: "extras-16-search-preset-results",             desc: "Search 'preset' — rail count banner visible" },
        { slug: "extras-17-back-button-hover",                 desc: "Header 'Back to app' button hover state" },
    ];
    const lines = ["", "", "## Extras (drill-downs, hidden routes, transient states)", "",
        "| # | What | File |",
        "|---|------|------|"];
    for (const e of extras) {
        lines.push(`| ${e.slug.slice(7, 9)} | ${e.desc} | [${e.slug}.png](${e.slug}.png) |`);
    }
    const readmePath = join(OUT_DIR, "README.md");
    const { readFile } = await import("node:fs/promises");
    let existing = "";
    try { existing = await readFile(readmePath, "utf8"); } catch { /* none */ }
    await writeFile(readmePath, existing + lines.join("\n") + "\n");
    console.log(`\n✔ Saved ${extras.length} extra screenshots`);
}

main().catch(err => { console.error(err); process.exit(1); });
