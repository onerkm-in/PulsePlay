// playground/scripts/capture-settings-pages.mjs
//
// Capture full-page screenshots of every Settings surface — main groups,
// sub-pages, AND deep-link leaves — so the user can prototype a
// rearrangement with complete parent + child coverage.
//
// Usage:
//   node scripts/capture-settings-pages.mjs
//
// Outputs PNGs to playground/screenshots/settings-pages/.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "screenshots", "settings-pages");
const BASE = "http://127.0.0.1:7001";

// leafSlug mirror — keep in sync with BiGroup.tsx::leafSlug.
const leafSlug = (label) =>
    label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Mirrors GROUP_LEAF_LABELS in SettingsShell.tsx so the harness covers
// every deep-link leaf the rail/search can target.
const GROUP_LEAF_LABELS = {
    setup: [],
    bi: ["Provider", "Embed", "Authentication", "Canvas", "Status", "Governance"],
    ai: [
        "Connector catalogue",
        "Model / Agent",
        "Connection test",
        "Power BI Q&A",
        "Knowledge pack",
        "Vector Search KB",
        "UC Metric View",
        "Browse library",
        "Response behavior",
        "Custom sections preset library",
        "Metric direction preset library",
        "Supervisor Fusion",
        "Knowledge Base",
    ],
    preferences: ["Visible tabs", "Default landing tab", "Canvas tiles", "Appearance"],
    system: [
        "Proxy status",
        "Network and auth",
        "Security posture",
        "License posture",
        "Profile inventory",
        "Diagnostics",
        "Setup wizard",
        "Export support bundle",
        "Developer Tools",
    ],
    advanced: ["Performance levers", "Local storage inspector", "Reset section", "Reset all", "Danger zone"],
};

// Parent (group landing) routes — always captured first.
const PARENT_ROUTES = [
    { slug: "01-parent-ai-setup",         group: "ai",          path: "/settings/ai" },
    { slug: "02-parent-bi-setup",         group: "bi",          path: "/settings/bi" },
    { slug: "03-parent-advanced",         group: "advanced",    path: "/settings/advanced" },
    { slug: "04-parent-display",          group: "preferences", path: "/settings/preferences" },
    { slug: "05-parent-legacy-quick-start", group: "setup",   path: "/settings/setup" },
    { slug: "06-parent-legacy-system",    group: "system",      path: "/settings/system" },
];

// Build child (leaf-anchored) routes for every group.
const CHILD_ROUTES = [];
let childIdx = 7;
for (const [group, labels] of Object.entries(GROUP_LEAF_LABELS)) {
    for (const label of labels) {
        const slug = leafSlug(label);
        CHILD_ROUTES.push({
            slug: `${String(childIdx).padStart(2, "0")}-child-${group}-${slug}`,
            group,
            leaf: label,
            path: `/settings/${group}/${slug}`,
        });
        childIdx++;
    }
}

const ALL_ROUTES = [...PARENT_ROUTES, ...CHILD_ROUTES];

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
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

    const page = await ctx.newPage();
    const summary = [];

    for (const r of ALL_ROUTES) {
        const url = `${BASE}${r.path}`;
        console.log(`→ ${r.slug.padEnd(60)} ${r.path}`);
        try {
            await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
        } catch (err) {
            console.warn(`  [warn] navigation: ${err.message}`);
        }
        await page.waitForSelector(".pp-settings, .pp-settings-main, body", { timeout: 5000 }).catch(() => {});
        // Auto-expand the rail group for the current page so child rail
        // items are visible in the screenshot (helpful for the prototype).
        await page.evaluate((groupId) => {
            const railItems = document.querySelectorAll(".pp-settings-rail__group");
            for (const item of railItems) {
                const btn = item.querySelector("button[aria-current='page']");
                if (btn) {
                    const caret = item.querySelector(".pp-settings-rail__caret, button[aria-label*='Expand'], button[aria-label*='Collapse']");
                    if (caret && caret.getAttribute("aria-expanded") === "false") caret.click();
                }
            }
        }, r.group).catch(() => {});
        await page.waitForTimeout(900);
        const outPath = join(OUT_DIR, `${r.slug}.png`);
        await page.screenshot({ path: outPath, fullPage: true });

        const meta = await page.evaluate(() => {
            const active = document.querySelector(".pp-settings-rail__item--active button")?.textContent?.trim() || "";
            const scrolledLeaf = document.querySelector("[data-leaf-just-scrolled='true']")?.getAttribute("id") || "";
            const visibleH2 = Array.from(document.querySelectorAll(".pp-settings-main h2, .pp-settings-main h3"))
                .map(el => el.textContent?.trim() || "")
                .filter(Boolean)
                .slice(0, 6);
            return { active, scrolledLeaf, visibleH2 };
        });
        summary.push({ ...r, file: `${r.slug}.png`, ...meta });
    }

    await browser.close();

    const indexLines = [
        "# Settings page screenshots — parents + children",
        "",
        `Captured ${ALL_ROUTES.length} routes at ${new Date().toISOString()}`,
        `  • ${PARENT_ROUTES.length} parent (group landing)`,
        `  • ${CHILD_ROUTES.length} child (deep-link leaf)`,
        "",
        "Viewport 1440×900, full-page (captures scroll overflow).",
        "",
        "## Parents",
        "",
        "| # | Group | Route | Active rail | File |",
        "|---|-------|-------|-------------|------|",
    ];
    for (const s of summary.filter(x => x.slug.startsWith("0") && x.slug.includes("parent"))) {
        indexLines.push(`| ${s.slug.slice(0, 2)} | \`${s.group}\` | \`${s.path}\` | ${s.active || "—"} | [${s.file}](${s.file}) |`);
    }
    indexLines.push("", "## Children (deep-link leaves)", "");
    let lastGroup = "";
    for (const s of summary.filter(x => x.slug.includes("child"))) {
        if (s.group !== lastGroup) {
            indexLines.push("", `### \`${s.group}\``, "");
            indexLines.push("| # | Leaf | Route | Scrolled-to | File |");
            indexLines.push("|---|------|-------|-------------|------|");
            lastGroup = s.group;
        }
        indexLines.push(`| ${s.slug.slice(0, 2)} | ${s.leaf} | \`${s.path}\` | ${s.scrolledLeaf || "—"} | [${s.file}](${s.file}) |`);
    }
    await writeFile(join(OUT_DIR, "README.md"), indexLines.join("\n"));
    console.log(`\n✔ Saved ${ALL_ROUTES.length} screenshots to ${OUT_DIR}`);
    console.log(`✔ Index: ${join(OUT_DIR, "README.md")}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
