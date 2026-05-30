// playground/scripts/capture-templates-and-hidden.mjs
//
// Captures the NEW author-only Workbench template picker (each template
// applied) + the Chat-surface gate, and writes a "Hidden surfaces" section
// into the settings-pages README so hidden parts are discoverable from the
// index. Run AFTER capture-settings-pages.mjs + capture-settings-extras.mjs
// (those (re)build the README; this appends the hidden-surfaces doc).

import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = "http://127.0.0.1:7001";
const OUT = "screenshots/settings-pages";

async function shot(page, name) {
    await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
    console.log(`  ✔ ${name}`);
}

async function main() {
    await mkdir(OUT, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
    await ctx.addInitScript(() => {
        try {
            localStorage.setItem("pulseplay:ai-profile", "genie-default");
            localStorage.setItem("pulseplay:bi-vendor", "powerbi");
            localStorage.setItem("pulseplay:api-base-url", "/api");
            localStorage.setItem("pulseplay:setup-wizard-dismissed", "true");
        } catch { /* ignore */ }
    });
    const page = await ctx.newPage();
    const results = [];
    const log = (ok, msg) => { results.push({ ok, msg }); console.log(`  ${ok ? "✅" : "❌"} ${msg}`); };

    // Workbench template picker — default state, then each template applied.
    await page.goto(`${BASE}/settings/preferences/workbench-template`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(1000);
    const picker = page.locator("[role='radiogroup'][aria-label='Workbench templates']");
    log(await picker.count() > 0, "Workbench template picker rendered");
    await shot(page, "12-templates-picker-default");

    const radios = page.locator("[role='radio']");
    const tplCount = await radios.count();
    log(tplCount === 5, `Picker shows 5 templates (count=${tplCount})`);

    // Apply each template and screenshot the resulting picker + tab state.
    const names = ["balanced", "exec-briefing", "analyst", "ask-first", "dashboard-kiosk"];
    for (let i = 0; i < Math.min(tplCount, names.length); i++) {
        await radios.nth(i).click();
        await page.waitForTimeout(500);
        const checked = await radios.nth(i).getAttribute("aria-checked");
        log(checked === "true", `Applied template '${names[i]}' (aria-checked=${checked})`);
        await shot(page, `13-template-applied-${i + 1}-${names[i]}`);
    }
    // Reset to balanced so the repo's default state is sane.
    await radios.nth(0).click();
    await page.waitForTimeout(400);

    // Chat-surface gate (author control) — capture the toggle area.
    await page.goto(`${BASE}/settings/preferences/chat-surface`, { waitUntil: "networkidle", timeout: 12000 });
    await page.waitForTimeout(800);
    await shot(page, "14-chat-surface-gate");

    // DevTools toggles (slice 1) — System → Developer Tools.
    await page.goto(`${BASE}/settings/system/developer-tools`, { waitUntil: "networkidle", timeout: 12000 });
    await page.waitForTimeout(800);
    await shot(page, "15-system-developer-tools");

    await browser.close();

    // ── Append a "Hidden surfaces" doc section to the README index ──
    const hiddenDoc = `

## Hidden surfaces & how to reach them

These surfaces are NOT in the 4-item left rail (AI Setup / BI Setup /
Advanced / Display) but still resolve via deep link or interaction. The
\`leafSlug\` of any rail leaf is the kebab-case of its label, so the deep
link is \`/settings/<group>/<leaf-slug>\`.

### Legacy groups (route resolves, hidden from rail)
| Surface | Route | Why hidden | Reach it |
|---|---|---|---|
| Quick start (Setup) | \`/settings/setup\` | Absorbed into AI/BI Setup | Deep link, or search a term that matches |
| System (diagnostics) | \`/settings/system\` | Absorbed into Advanced | Deep link; search "diagnostics" |

### Sub-pages (only reachable via deep link / chip)
| Surface | Route | Reach it |
|---|---|---|
| AI · Knowledge Base | \`/settings/ai/knowledge-base\` | Rail leaf "Knowledge Base" under AI Setup |
| AI · Supervisor Fusion | \`/settings/ai/supervisor-fusion\` | Rail leaf "Supervisor Fusion" (only meaningful when a Supervisor profile is active) |
| BI · Governance | \`/settings/bi/governance\` | Rail leaf "Governance" under BI Setup |
| Display · Appearance | \`/settings/preferences/appearance\` | Rail leaf "Appearance" under Display |
| System · Developer Tools | \`/settings/system/developer-tools\` | Deep link (System group hidden) |

### Conditional leaves (render only in specific states)
| Leaf | Condition | Notes |
|---|---|---|
| Power BI Q&A | Active AI profile is a Power BI semantic-model / Q&A connector | Falls back to Connector catalogue when not applicable |
| Adjust → strategic presets | Insights tab + a configured profile | The Adjust dropdown now scrolls (capped 360px) |

### Author-only controls (never shown to end users in the app)
| Control | Route | What it does |
|---|---|---|
| Workbench template | \`/settings/preferences/workbench-template\` | Bundles tabs + landing + scope + section preset per named template (Balanced / Executive briefing / Analyst workbench / Ask-first / Dashboard kiosk). Hidden from end users — they get whatever the author picks. |
| Chat surface gate | \`/settings/preferences/chat-surface\` | When ON, shows the top-bar Workbench⇄Chat switch to end users. Default OFF → Workbench only. |
| Developer Tools | \`/settings/system/developer-tools\` | Author defaults for showSql / showTrace / devMode / allowReportActions / connector-compat warnings. End users override per-response via the inline diagnostics chip (planned). |

### Drill-down / transient states (interaction, not a route)
| State | How to trigger | Screenshot |
|---|---|---|
| Connector catalogue "Show all 12" | Click the expander on AI Setup → Connector catalogue | extras-06 |
| Add another profile | Click inside a connector tile | extras-07 |
| Copy link "Copied" flash | Click any leaf's "Copy link" button | extras-01 |
| Rail all-expanded | Expand every rail group caret | extras-03 |
| Search-filtered rail | Type in the settings search box | extras-04 / extras-05 |
| Unsaved-changes save bar | Change a draft-tracked setting | extras-08 |
| Workbench templates applied | Click each template in the picker | 13-template-applied-* |
`;

    const readmePath = join(OUT, "README.md");
    let existing = "";
    try { existing = await readFile(readmePath, "utf8"); } catch { /* none */ }
    // Avoid duplicating the section on re-run.
    const marker = "## Hidden surfaces & how to reach them";
    if (existing.includes(marker)) {
        existing = existing.slice(0, existing.indexOf(marker)).trimEnd() + "\n";
    }
    await writeFile(readmePath, existing + hiddenDoc);
    console.log(`\n✔ Appended "Hidden surfaces" doc to ${readmePath}`);

    const passed = results.filter(r => r.ok).length;
    console.log(`${passed === results.length ? "✔ PASS" : "✘ CHECK"} — ${passed}/${results.length}`);
    if (passed !== results.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
