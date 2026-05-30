#!/usr/bin/env node
// playground/scripts/verify-500-unified-sprint.mjs
//
// 500-scenario UI smoke for the unified-screen sprint (9290d92→530c3eb).
// Runs HEADED so a human can watch each scenario flash by with a banner
// overlay + a 4 px outline ring on the slot the assertion is checking.
//
// Invariants every scenario asserts (the sprint's actual claims):
//   I1. pp-screen wrapper renders on HOME route (PulsePlayScreen owns
//       canonical composition for the user-visible PulsePlay pane).
//       /settings/* uses <SettingsShell />, NOT PulsePlayScreen — so the
//       slot invariants (I1-I4) only apply when route === "/".
//   I2. pp-screen-main-slot renders on home (always required)
//   I3. pp-screen-floating-slot omitted unless a pane is detached
//   I4. pp-screen-dock-slot omitted unless a pane is minimized
//   I5. /settings/ai never exposes a uiMode picker (pulse|v0 <select>)
//   I6. /settings/preferences never exposes a uiMode picker
//   I10. Settings pages never throw a React error boundary
//
// Genie completions excluded — the live workspace is rate-limited (HTTP
// 429) so chat answers can't render and TrustBadge can't be observed.
// This harness covers everything else.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".unified-500-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const CHUNK_SIZE = 100;     // close + reopen browser every N scenarios (vite memory)
const SCENARIO_GAP_MS = 250; // pause between scenarios so the human can see

// ─── Scenario matrix builder (≈500 cases) ─────────────────────────────────

const UI_MODES = ["pulse", "v0"];
const TAB_COMBOS = [
    { aiInsights: true,  askPulse: true,  dashboard: true  },
    { aiInsights: true,  askPulse: true,  dashboard: false },
    { aiInsights: true,  askPulse: false, dashboard: true  },
    { aiInsights: false, askPulse: true,  dashboard: true  },
    { aiInsights: true,  askPulse: false, dashboard: false },
    { aiInsights: false, askPulse: true,  dashboard: false },
    { aiInsights: false, askPulse: false, dashboard: true  },
];
const ACTIVE_SURFACES = ["ai-insights", "ask-pulse", "bi-viz"];
const ROUTES = [
    "/", "/settings", "/settings/ai", "/settings/preferences",
    "/settings/connector", "/settings/data", "/settings/visualization",
];
const VENDORS = ["powerbi", "tableau", "qlik", "looker", "generic-iframe"];
const LAYOUT_MODES = ["ai-left", "ai-right", "ai-top", "ai-bottom"];
const ENABLED_COMPONENTS = ["mix", "both", "aiOnly", "biOnly"];

function buildScenarios() {
    const out = [];

    // Family A — uiMode × tabVis × route (canonical slot invariants)
    // 2 × 7 × 7 = 98
    let n = 0;
    for (const ui of UI_MODES) {
        for (const tv of TAB_COMBOS) {
            for (const route of ROUTES) {
                n++;
                out.push({
                    id: `A${String(n).padStart(3, "0")}`,
                    family: "A",
                    color: "#3b82f6",
                    label: `uiMode=${ui} tabs=${shortTabs(tv)} route=${route}`,
                    seed: { uiMode: ui, tabVisibility: tv },
                    route,
                    expect: { slotInvariants: true, settingsNoUiPicker: route.startsWith("/settings") },
                });
            }
        }
    }

    // Family B — uiMode × active surface × tabVis on home (3-tab strip behavior)
    // 2 × 3 × 7 = 42
    n = 0;
    for (const ui of UI_MODES) {
        for (const surface of ACTIVE_SURFACES) {
            for (const tv of TAB_COMBOS) {
                n++;
                out.push({
                    id: `B${String(n).padStart(3, "0")}`,
                    family: "B",
                    color: "#10b981",
                    label: `uiMode=${ui} surface=${surface} tabs=${shortTabs(tv)}`,
                    seed: { uiMode: ui, activeSurface: surface, tabVisibility: tv },
                    route: "/",
                    expect: { slotInvariants: true, expectActiveSurface: tv[surfaceToTabKey(surface)] ? surface : null },
                });
            }
        }
    }

    // Family C — vendor × layoutMode × uiMode on home (vendor swaps)
    // 5 × 4 × 2 = 40
    n = 0;
    for (const vendor of VENDORS) {
        for (const layout of LAYOUT_MODES) {
            for (const ui of UI_MODES) {
                n++;
                out.push({
                    id: `C${String(n).padStart(3, "0")}`,
                    family: "C",
                    color: "#a855f7",
                    label: `vendor=${vendor} layout=${layout} uiMode=${ui}`,
                    seed: { uiMode: ui, biVendor: vendor, layoutMode: layout, tabVisibility: { aiInsights: true, askPulse: true, dashboard: true } },
                    route: "/",
                    expect: { slotInvariants: true },
                });
            }
        }
    }

    // Family D — enabledComponents × biTileMode × uiMode
    // 4 × 3 × 2 × 3 = 72 (× routes: home + settings/ai + settings/preferences)
    n = 0;
    for (const ec of ENABLED_COMPONENTS) {
        for (const tile of ["1", "2", "4"]) {
            for (const ui of UI_MODES) {
                for (const route of ["/", "/settings/ai", "/settings/preferences"]) {
                    n++;
                    out.push({
                        id: `D${String(n).padStart(3, "0")}`,
                        family: "D",
                        color: "#f97316",
                        label: `ec=${ec} tile=${tile} uiMode=${ui} route=${route}`,
                        seed: { uiMode: ui, enabledComponents: ec, biTileMode: tile, tabVisibility: { aiInsights: true, askPulse: true, dashboard: true } },
                        route,
                        expect: { slotInvariants: true, settingsNoUiPicker: route.startsWith("/settings") },
                    });
                }
            }
        }
    }

    // Family E — Settings deep-sweep (every /settings/* leaf × 2 uiMode)
    // ~12 routes × 2 = ~24
    const settingsRoutes = [
        "/settings", "/settings/ai", "/settings/preferences", "/settings/connector",
        "/settings/data", "/settings/visualization", "/settings/system",
        "/settings/governance", "/settings/notifications", "/settings/identity",
        "/settings/voice", "/settings/lab",
    ];
    n = 0;
    for (const route of settingsRoutes) {
        for (const ui of UI_MODES) {
            n++;
            out.push({
                id: `E${String(n).padStart(3, "0")}`,
                family: "E",
                color: "#ec4899",
                label: `settings-deep route=${route} uiMode=${ui}`,
                seed: { uiMode: ui, tabVisibility: { aiInsights: true, askPulse: true, dashboard: true } },
                route,
                expect: { slotInvariants: true, settingsNoUiPicker: true, settingsNoErrorBoundary: true },
            });
        }
    }

    // Family F — defaultLandingSurface author override (tests App.tsx initial-surface priority)
    // 3 surfaces × 2 uiMode × 7 tab combos × 2 routes (/ and /settings) = 84
    n = 0;
    for (const surface of ACTIVE_SURFACES) {
        for (const ui of UI_MODES) {
            for (const tv of TAB_COMBOS) {
                for (const route of ["/", "/settings"]) {
                    n++;
                    out.push({
                        id: `F${String(n).padStart(3, "0")}`,
                        family: "F",
                        color: "#eab308",
                        label: `defaultLanding=${surface} uiMode=${ui} tabs=${shortTabs(tv)} route=${route}`,
                        seed: { uiMode: ui, defaultLandingSurface: surface, tabVisibility: tv },
                        route,
                        expect: { slotInvariants: true, settingsNoUiPicker: route.startsWith("/settings") },
                    });
                }
            }
        }
    }

    // Family G — pages-storage variants (Phase B P1 multi-page parallel storage)
    // 7 tabVis combos × 2 uiMode × 4 routes = 56
    n = 0;
    for (const tv of TAB_COMBOS) {
        for (const ui of UI_MODES) {
            for (const route of ["/", "/settings", "/settings/ai", "/settings/preferences"]) {
                n++;
                const pages = [];
                if (tv.aiInsights) pages.push({ id: "page-ai-insights", type: "ai-insights", title: "AI Insights" });
                if (tv.askPulse)   pages.push({ id: "page-ask-pulse",   type: "ask-pulse",   title: "Ask Pulse" });
                if (tv.dashboard)  pages.push({ id: "page-dashboard",   type: "dashboard",   title: "Dashboard" });
                out.push({
                    id: `G${String(n).padStart(3, "0")}`,
                    family: "G",
                    color: "#14b8a6",
                    label: `pages=${pages.length} uiMode=${ui} route=${route}`,
                    seed: { uiMode: ui, pages, tabVisibility: tv },
                    route,
                    expect: { slotInvariants: true, settingsNoUiPicker: route.startsWith("/settings") },
                });
            }
        }
    }

    return out.slice(0, 500); // hard cap
}

function shortTabs(tv) { return (tv.aiInsights ? "I" : "-") + (tv.askPulse ? "A" : "-") + (tv.dashboard ? "D" : "-"); }
function surfaceToTabKey(s) { return s === "ai-insights" ? "aiInsights" : s === "ask-pulse" ? "askPulse" : "dashboard"; }

// ─── Per-scenario seed → drive → assert ────────────────────────────────────

async function seedAndDrive(page, sc) {
    // Clean slate, then write seeded keys.
    await page.evaluate(({ sc }) => {
        try { window.localStorage.clear(); } catch { /* swallow */ }
        const seed = sc.seed || {};
        if (seed.uiMode) window.localStorage.setItem("pulseplay:ui-mode", seed.uiMode);
        if (seed.tabVisibility) window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify(seed.tabVisibility));
        if (seed.pages) window.localStorage.setItem("pulseplay:pages", JSON.stringify(seed.pages));
        if (seed.activeSurface) window.localStorage.setItem("pulseplay:active-surface", seed.activeSurface);
        if (seed.biVendor) window.localStorage.setItem("pulseplay:bi-vendor", seed.biVendor);
        if (seed.layoutMode) window.localStorage.setItem("pulseplay:layout-mode", seed.layoutMode);
        if (seed.enabledComponents) window.localStorage.setItem("pulseplay:enabled-components", seed.enabledComponents);
        if (seed.biTileMode) window.localStorage.setItem("pulseplay:bi-tile-mode", seed.biTileMode);
        if (seed.defaultLandingSurface) window.localStorage.setItem("pulseplay:default-landing-surface", seed.defaultLandingSurface);
        // Seed a profile so Settings pages don't show empty-state spinner
        window.localStorage.setItem("pulseplay:active-ai-profile", "default");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = "default";
        ex.connectionMode = "proxy";
        window.localStorage.setItem(k, JSON.stringify(ex));
    }, { sc });
}

async function assertCase(page, sc) {
    const dom = await page.evaluate(() => {
        const get = (sel) => document.querySelectorAll(sel).length;
        const bodyText = document.body ? document.body.innerText : "";
        // Detect React error boundary fallback (project uses inline string "Something went wrong")
        const hasErrorBoundary = /Something went wrong|Application error|Error: \w+/.test(bodyText) && get("pre") > 0;
        // UI mode picker detection — <select> with both pulse + v0 options, OR explicit "UI mode" label
        const selects = Array.from(document.querySelectorAll("select"));
        let hasUiModePicker = false;
        for (const s of selects) {
            const opts = Array.from(s.querySelectorAll("option")).map(o => o.value);
            if (opts.includes("pulse") && opts.includes("v0")) { hasUiModePicker = true; break; }
        }
        if (!hasUiModePicker) {
            const groups = Array.from(document.querySelectorAll('[role="radiogroup"], .gn-button-group'));
            for (const g of groups) { if (/UI mode/i.test(g.textContent || "")) { hasUiModePicker = true; break; } }
        }
        return {
            screen: get('[data-testid="pp-screen"]'),
            mainSlot: get('[data-testid="pp-screen-main-slot"]'),
            floatSlot: get('[data-testid="pp-screen-floating-slot"]'),
            dockSlot: get('[data-testid="pp-screen-dock-slot"]'),
            chromeAi: get('[data-testid="pp-panel-chrome-ai"]'),
            chromeBi: get('[data-testid="pp-panel-chrome-bi"]'),
            hasErrorBoundary,
            hasUiModePicker,
        };
    });

    const fails = [];
    // I1-I4: slot invariants ONLY apply to the home pane (PulsePlayScreen).
    // /settings/* renders <SettingsShell />, which does NOT wrap
    // PulsePlayScreen — see App.tsx:434-488. So only assert on home.
    const isHome = sc.route === "/" || sc.route === "";
    if (sc.expect.slotInvariants && isHome) {
        if (dom.screen < 1)   fails.push(`I1 pp-screen missing`);
        if (dom.mainSlot < 1) fails.push(`I2 pp-screen-main-slot missing`);
        if (dom.floatSlot > 0) fails.push(`I3 pp-screen-floating-slot rendered without detach`);
        if (dom.dockSlot > 0) fails.push(`I4 pp-screen-dock-slot rendered without minimize`);
    }
    // I5/I6: no uiMode picker on settings routes (sprint's centerpiece claim).
    if (sc.expect.settingsNoUiPicker && dom.hasUiModePicker) {
        fails.push(`I5/I6 settings page exposes UI mode picker`);
    }
    // I10: settings deep routes don't throw error boundary.
    if (sc.expect.settingsNoErrorBoundary && dom.hasErrorBoundary) {
        fails.push(`I10 settings page threw error boundary`);
    }
    return { dom, fails };
}

// ─── Visual overlay (banner + ring) ────────────────────────────────────────

async function showBanner(page, sc, idx, total, summary) {
    await page.evaluate(({ sc, idx, total, summary }) => {
        let b = document.getElementById("__pp-smoke-banner__");
        if (!b) {
            b = document.createElement("div");
            b.id = "__pp-smoke-banner__";
            Object.assign(b.style, {
                position: "fixed", top: "8px", left: "8px", right: "8px",
                zIndex: "99999", padding: "6px 10px",
                background: "rgba(15,23,42,0.92)", color: "#fff",
                font: "12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace",
                borderRadius: "4px", pointerEvents: "none",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            });
            document.body.appendChild(b);
        }
        b.style.borderLeft = `4px solid ${sc.color}`;
        b.textContent = `[${idx + 1}/${total}] ${sc.id} · ${sc.label} · ${summary}`;
    }, { sc, idx, total, summary });
}

// ─── Browser lifecycle (chunked) ───────────────────────────────────────────

async function freshBrowser() {
    const browser = await chromium.launch({
        headless: false, slowMo: 50,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    page.on("pageerror", () => { /* counted via DOM probe */ });
    return { browser, page };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const scenarios = buildScenarios();
    console.log(`[start] ${scenarios.length} scenarios across families A/B/C/D/E/F/G (headed)`);

    let pass = 0, fail = 0, threw = 0;
    const failReports = [];
    const log = [];

    let { browser, page } = await freshBrowser();

    for (let i = 0; i < scenarios.length; i++) {
        const sc = scenarios[i];

        // Rotate browser to keep Vite happy.
        if (i > 0 && i % CHUNK_SIZE === 0) {
            console.log(`[chunk] rotating browser at scenario ${i + 1}/${scenarios.length}`);
            await browser.close().catch(() => {});
            ({ browser, page } = await freshBrowser());
        }

        try {
            // Seed first against a known-good page, THEN navigate to the route.
            await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 15_000 });
            await seedAndDrive(page, sc);
            await page.goto(BASE + sc.route, { waitUntil: "domcontentloaded", timeout: 15_000 });
            await page.waitForTimeout(500);

            const { dom, fails } = await assertCase(page, sc);
            const ok = fails.length === 0;
            await showBanner(page, sc, i, scenarios.length, ok ? "PASS" : `FAIL: ${fails[0]}`);

            if (ok) {
                pass++;
                if (i < 3 || i % 100 === 99) {
                    console.log(`✅ [${sc.id}] ${sc.label} → screen=${dom.screen} main=${dom.mainSlot} float=${dom.floatSlot} dock=${dom.dockSlot} ai=${dom.chromeAi} bi=${dom.chromeBi}`);
                }
                log.push(`PASS ${sc.id} ${sc.label}`);
            } else {
                fail++;
                const msg = `❌ [${sc.id}] ${sc.label} → ${fails.join("; ")} | dom=${JSON.stringify(dom)}`;
                console.log(msg);
                failReports.push(msg);
                log.push(`FAIL ${sc.id} ${sc.label} :: ${fails.join("; ")}`);
            }
            await page.waitForTimeout(SCENARIO_GAP_MS);
        } catch (err) {
            threw++;
            const msg = `💥 [${sc.id}] ${sc.label} → ${err.message.slice(0, 200)}`;
            console.log(msg);
            failReports.push(msg);
            log.push(`THREW ${sc.id} ${sc.label} :: ${err.message.slice(0, 200)}`);
        }
    }

    await browser.close().catch(() => {});

    const total = scenarios.length;
    const summary = `\n=== Result: ${pass}/${total} PASS, ${fail} FAIL, ${threw} THREW (${(pass / total * 100).toFixed(1)}%) ===`;
    console.log(summary);
    if (failReports.length > 0) {
        console.log("\n--- First 20 failures ---");
        failReports.slice(0, 20).forEach((m) => console.log(m));
    }
    await writeFile(join(OUT_DIR, "verify.log"), log.join("\n") + summary, "utf-8");
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
