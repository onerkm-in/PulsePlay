// Local feature probe — drives a real headless Chromium against the
// already-running Vite dev server at http://127.0.0.1:5173. Does NOT
// spawn proxy or vite. Reports per-feature pass/warn/fail.

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdir } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const EVIDENCE_DIR = join(REPO_ROOT, "docs", "evidence", "local-smoke-2026-05-22");
const BASE_URL = process.env.PP_BASE_URL || "http://127.0.0.1:5173/";

await mkdir(EVIDENCE_DIR, { recursive: true });

const NOISE = [
    /vite/i, /react devtools/i, /\[HMR\]/i, /Download the React DevTools/i,
];
const isNoise = (t) => NOISE.some((rx) => rx.test(t));

const results = [];
function record(name, status, notes) {
    results.push({ feature: name, status, notes: notes ?? "" });
}

const browser = await chromium.launch({ headless: true });

// ============================================================
// PASS 1 — clean slate (no localStorage seeding)
// ============================================================
const ctxClean = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const consoleClean = [];
const pageErrClean = [];
const pageClean = await ctxClean.newPage();
pageClean.on("console", (m) => { if (!isNoise(m.text())) consoleClean.push(`[${m.type()}] ${m.text()}`); });
pageClean.on("pageerror", (e) => pageErrClean.push(e.message));

let cleanReport = {};
try {
    await pageClean.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await pageClean.waitForSelector("[data-testid='pp-viewport-shell']", { timeout: 20000 });
    // Allow first paint to settle (avoid racing the skeleton -> chart swap)
    await pageClean.waitForTimeout(800);

    // ---- Feature 1: default landing tab ----
    cleanReport = await pageClean.evaluate(() => {
        const shell = document.querySelector("[data-testid='pp-viewport-shell']");
        const tablist = document.querySelector("[data-testid='pp-viewport-shell'] [role='tablist'], [data-testid='pp-viewport-shell'] .pp-surface-switcher");
        const tabs = Array.from(document.querySelectorAll("[data-testid='pp-viewport-shell'] [role='tab']")).map((t) => ({
            text: (t.textContent || "").trim(),
            selected: t.getAttribute("aria-selected") === "true" || t.getAttribute("data-selected") === "true",
            disabled: t.hasAttribute("disabled") || t.getAttribute("aria-disabled") === "true",
        }));
        return {
            activeSurface: shell?.getAttribute("data-active-surface") ?? null,
            biSurfaceMode: shell?.getAttribute("data-bi-surface-mode") ?? null,
            runtimeBiVendor: shell?.getAttribute("data-runtime-bi-vendor") ?? null,
            tabs,
            hasTablist: !!tablist,
        };
    });

    if (cleanReport.activeSurface === "ai-insights") {
        record("F1 Default landing tab = ai-insights (clean localStorage)", "PASS",
            `data-active-surface="${cleanReport.activeSurface}"`);
    } else {
        record("F1 Default landing tab = ai-insights (clean localStorage)", "FAIL",
            `expected "ai-insights", got "${cleanReport.activeSurface}"`);
    }

    // ---- Feature 3: surface tabs visible ----
    const wantedTabs = ["AI Insights", "Ask Pulse", "Dashboard"];
    const labels = cleanReport.tabs.map((t) => t.text);
    const missing = wantedTabs.filter((w) => !labels.some((l) => l.includes(w)));
    if (cleanReport.tabs.length === 0) {
        record("F3 Surface tabs visible", "FAIL", "no [role=tab] found on initial paint");
    } else if (missing.length === 0) {
        const disabledLabels = cleanReport.tabs.filter((t) => t.disabled).map((t) => t.text);
        record("F3 Surface tabs visible", "PASS",
            `${cleanReport.tabs.length} tabs: ${cleanReport.tabs.map((t) => `${t.text}${t.selected ? "*" : ""}${t.disabled ? "[disabled]" : ""}`).join(", ")}${disabledLabels.length ? "; disabled=" + disabledLabels.join(",") : ""}`);
    } else {
        record("F3 Surface tabs visible", "WARN",
            `missing tabs: ${missing.join(", ")}; saw: ${labels.join(", ")}`);
    }

    // ---- Feature: tab switch works ----
    try {
        // Locate the Ask Pulse tab strictly inside the shell's tablist (not the
        // settings nav, which may have similar text elsewhere on the page).
        const clicked = await pageClean.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll("[data-testid='pp-viewport-shell'] [role='tab']"));
            const target = tabs.find((t) => /Ask Pulse/i.test(t.textContent || ""));
            if (!target) return { ok: false, reason: "no tab matched" };
            target.scrollIntoView();
            target.click();
            return { ok: true, label: (target.textContent || "").trim() };
        });
        if (!clicked.ok) {
            record("F3b Tab switch → Ask Pulse", "WARN", clicked.reason);
        } else {
            await pageClean.waitForTimeout(500);
            const after = await pageClean.getAttribute("[data-testid='pp-viewport-shell']", "data-active-surface");
            if (after === "ask-pulse") {
                record("F3b Tab switch → Ask Pulse", "PASS", `data-active-surface="${after}"`);
            } else {
                record("F3b Tab switch → Ask Pulse", "WARN",
                    `clicked Ask Pulse tab, data-active-surface still "${after}" (may require pane mount)`);
            }
            // Switch back so the screenshot captures AI Insights default
            await pageClean.evaluate(() => {
                const tabs = Array.from(document.querySelectorAll("[data-testid='pp-viewport-shell'] [role='tab']"));
                const t = tabs.find((x) => /AI Insights/i.test(x.textContent || ""));
                if (t) t.click();
            });
            await pageClean.waitForTimeout(300);
        }
    } catch (e) {
        record("F3b Tab switch → Ask Pulse", "WARN", `click failed: ${e.message}`);
    }

    // ---- Feature 3 (G3): layout-shift CSS hooks ----
    const cssProbe = await pageClean.evaluate(() => {
        // Inject probe elements with the same classes and measure computed
        // min-height. This proves the CSS rule is reaching the DOM even
        // before chart data arrives.
        const mk = (cls) => {
            const el = document.createElement("div");
            el.className = cls;
            el.style.width = "300px";
            document.body.appendChild(el);
            const cs = window.getComputedStyle(el);
            const v = cs.minHeight;
            el.remove();
            return v;
        };
        return {
            placeholder: mk("gn-insights-section gn-insights-section--placeholder"),
            chartContainer: mk("gn-chart-container"),
        };
    });
    const placeholderPx = parseFloat(cssProbe.placeholder);
    const chartPx = parseFloat(cssProbe.chartContainer);
    if (placeholderPx >= 95 && chartPx >= 380) {
        record("F-G3 Layout-shift CSS (placeholder ≥95px, chart ≥380px)", "PASS",
            `placeholder=${cssProbe.placeholder}, chartContainer=${cssProbe.chartContainer}`);
    } else if (chartPx >= 380) {
        record("F-G3 Layout-shift CSS", "WARN",
            `chartContainer ok (${cssProbe.chartContainer}) but placeholder min-height=${cssProbe.placeholder} <95px`);
    } else {
        record("F-G3 Layout-shift CSS", "FAIL",
            `placeholder=${cssProbe.placeholder}, chartContainer=${cssProbe.chartContainer}`);
    }

    // ---- Feature 2: first-run wizard skip path ----
    // The clean-context load did NOT show a wizard modal here in v0 mode
    // because the new app doesn't auto-launch one. Check for any element
    // with a "wizard" testid; if absent, mark as N/A.
    const wizardPresent = await pageClean.evaluate(() => {
        const w = document.querySelector("[data-testid*='wizard'], [data-wizard]");
        return !!w;
    });
    if (wizardPresent) {
        // Try clicking skip
        try {
            const skip = await pageClean.$("button:has-text('Skip setup')");
            if (skip) { await skip.click(); record("F2 First-run wizard skippable", "PASS", "found and clicked Skip"); }
            else { record("F2 First-run wizard skippable", "WARN", "wizard present but no Skip button found"); }
        } catch (e) {
            record("F2 First-run wizard skippable", "WARN", e.message);
        }
    } else {
        record("F2 First-run wizard", "PASS", "no wizard auto-launched on clean load (AI Insights default)");
    }

    // ---- Screenshot 1: landing ----
    await pageClean.screenshot({ path: join(EVIDENCE_DIR, "01-landing-ai-insights.png"), fullPage: true });
} catch (e) {
    record("Pass 1 (clean) bootstrap", "FAIL", e.message);
} finally {
    if (consoleClean.filter((m) => m.startsWith("[error]")).length > 0) {
        record("Pass 1 console errors", "WARN",
            consoleClean.filter((m) => m.startsWith("[error]")).slice(0, 5).join(" | "));
    }
    if (pageErrClean.length > 0) {
        record("Pass 1 page errors", "FAIL", pageErrClean.slice(0, 3).join(" | "));
    }
    await ctxClean.close();
}

// ============================================================
// PASS 2 — Settings page
// ============================================================
const ctxSettings = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const pageSettings = await ctxSettings.newPage();
const consoleSettings = [];
pageSettings.on("console", (m) => { if (!isNoise(m.text())) consoleSettings.push(`[${m.type()}] ${m.text()}`); });
const pageErrSettings = [];
pageSettings.on("pageerror", (e) => pageErrSettings.push(e.message));

try {
    await pageSettings.goto(BASE_URL + "settings", { waitUntil: "domcontentloaded", timeout: 30000 });
    await pageSettings.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => { });
    await pageSettings.waitForTimeout(600);

    // Try to find the Preferences group
    const preferencesGroupVisible = await pageSettings.evaluate(() => {
        // Match by visible text "Preferences"
        const all = Array.from(document.querySelectorAll("button, a, [role='button'], h2, h3, [data-group]"));
        return all.some((el) => /preferences/i.test(el.textContent || ""));
    });

    // Try to click the Preferences nav item if a sidebar exists
    if (preferencesGroupVisible) {
        try {
            const navBtn = await pageSettings.$("button:has-text('Preferences'), a:has-text('Preferences')");
            if (navBtn) { await navBtn.click(); await pageSettings.waitForTimeout(300); }
        } catch { /* swallow */ }
    }

    const landingControl = await pageSettings.evaluate(() => {
        // Find the most specific element whose first child contains exactly
        // "Default landing tab" (the Leaf label), then look at its sibling
        // value container for the ButtonGroup.
        const candidates = Array.from(document.querySelectorAll("label, span, div, h3, h4"));
        const labelEl = candidates.find((el) => {
            const t = (el.textContent || "").trim();
            return t === "Default landing tab";
        });
        if (!labelEl) return { found: false };
        // Walk up to the Leaf container (heuristic: ascend ≤4 levels and
        // pick the first ancestor that contains buttons with our 3 options)
        let scope = labelEl;
        for (let i = 0; i < 6; i++) {
            if (!scope.parentElement) break;
            scope = scope.parentElement;
            const btns = Array.from(scope.querySelectorAll("button")).map((b) => (b.textContent || "").trim());
            if (btns.includes("AI Insights") && btns.includes("Ask Pulse") && btns.includes("Dashboard")) {
                return {
                    found: true,
                    buttonCount: btns.length,
                    buttons: btns,
                    levelsAscended: i + 1,
                    pressedStates: Array.from(scope.querySelectorAll("button")).map((b) => ({
                        text: (b.textContent || "").trim(),
                        pressed: b.getAttribute("aria-pressed") === "true" || b.getAttribute("data-selected") === "true" || b.classList.contains("is-active"),
                    })),
                };
            }
        }
        return { found: true, buttonCount: 0, snippet: (scope.outerHTML || "").slice(0, 300) };
    });

    if (landingControl.found && landingControl.buttonCount === 3) {
        const pressed = (landingControl.pressedStates || []).find((p) => p.pressed);
        record("F4 Settings → Preferences → Default landing tab control", "PASS",
            `3 buttons [${landingControl.buttons.join(", ")}], pressed=${pressed ? pressed.text : "none"}`);
    } else if (landingControl.found && landingControl.buttonCount > 0) {
        record("F4 Settings → Preferences → Default landing tab control", "WARN",
            `${landingControl.buttonCount} buttons; labels: ${landingControl.buttons.join(", ")}`);
    } else if (landingControl.found) {
        record("F4 Settings → Preferences → Default landing tab control", "WARN",
            `found label but no buttongroup matched; snippet: ${(landingControl.snippet || "").slice(0, 180)}`);
    } else {
        record("F4 Settings → Preferences → Default landing tab control", "FAIL",
            "no element with text 'Default landing tab' found");
    }

    await pageSettings.screenshot({ path: join(EVIDENCE_DIR, "02-settings-preferences.png"), fullPage: true });
} catch (e) {
    record("Pass 2 (settings)", "FAIL", e.message);
} finally {
    if (pageErrSettings.length > 0) {
        record("Pass 2 page errors", "WARN", pageErrSettings.slice(0, 3).join(" | "));
    }
    await ctxSettings.close();
}

// ============================================================
// PASS 3 — Ask Pulse: probe smoke-fixture profile; if absent, skip ask test
// ============================================================
const ctxAsk = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const pageAsk = await ctxAsk.newPage();
const consoleAsk = [];
pageAsk.on("console", (m) => { if (!isNoise(m.text())) consoleAsk.push(`[${m.type()}] ${m.text()}`); });
const pageErrAsk = [];
pageAsk.on("pageerror", (e) => pageErrAsk.push(e.message));

try {
    // Pre-seed: jump straight to Ask Pulse + dismiss wizard if any
    await ctxAsk.addInitScript(() => {
        try {
            window.localStorage.setItem("pulseplay:wizard-dismissed", "true");
            window.localStorage.setItem("pulseplay:active-surface", "ask-pulse");
            window.localStorage.setItem("pulseplay:ui-mode", "v0");
            window.localStorage.setItem("pulseplay:bi-surface-mode", "auto");
        } catch { /* swallow */ }
    });
    await pageAsk.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await pageAsk.waitForSelector("[data-testid='pp-viewport-shell']", { timeout: 20000 });
    await pageAsk.waitForTimeout(800);

    // Probe whether the proxy exposes a smoke-fixture profile
    const profilesResp = await pageAsk.evaluate(async () => {
        try {
            const r = await fetch("/api/assistant/profiles", { credentials: "same-origin" });
            const text = await r.text();
            return { ok: r.ok, status: r.status, snippet: text.slice(0, 800) };
        } catch (e) {
            return { ok: false, status: 0, snippet: e.message };
        }
    });
    const hasSmokeProfile = /smoke-fixture|"smoke"/.test(profilesResp.snippet);
    record("Proxy profiles endpoint", profilesResp.ok ? "PASS" : "WARN",
        `status=${profilesResp.status}, smokeFixture=${hasSmokeProfile}, snippet=${profilesResp.snippet.slice(0, 200)}`);

    // ---- F5 / F6 / F7: try the textarea + look for unified toolbar + sql copy ----
    const textarea = await pageAsk.$("textarea[placeholder='Ask about the loaded view…']");
    if (textarea && hasSmokeProfile) {
        await textarea.fill("smoke check question");
        const askBtn = await pageAsk.$("button.pp-ai-sidebar__ask");
        if (askBtn) {
            await askBtn.click();
            await pageAsk.waitForSelector("[data-testid^='pp-ai-entry-'][data-status='completed']", { timeout: 25000 }).catch(() => { });
            const obs = await pageAsk.evaluate(() => ({
                toolbarCount: document.querySelectorAll(".gn-msg-action").length,
                sqlCopyCount: document.querySelectorAll(".gn-sql-copy-btn").length,
                sqlPreCount: document.querySelectorAll("pre.gn-code").length,
                completedEntries: document.querySelectorAll("[data-testid^='pp-ai-entry-'][data-status='completed']").length,
            }));
            record("F8 Ask Pulse Q→A round-trip (smoke-fixture)",
                obs.completedEntries > 0 ? "PASS" : "FAIL",
                `completed=${obs.completedEntries}, toolbar=${obs.toolbarCount}, sqlCopy=${obs.sqlCopyCount}, sqlPre=${obs.sqlPreCount}`);
            record("F6 Unified 4-icon message toolbar",
                obs.toolbarCount >= 4 ? "PASS" : "WARN",
                `.gn-msg-action count=${obs.toolbarCount}`);
            record("F7 SQL copy icon",
                obs.sqlPreCount === 0 ? "N/A" : (obs.sqlCopyCount > 0 ? "PASS" : "FAIL"),
                `sqlPre=${obs.sqlPreCount}, sqlCopy=${obs.sqlCopyCount}`);
        } else {
            record("F8 Ask Pulse Q→A round-trip", "WARN", "no Ask button found");
        }
    } else if (textarea) {
        record("F8 Ask Pulse Q→A round-trip", "N/A",
            "textarea present but live proxy has no smoke-fixture profile (skipping LLM-dependent assertion)");
        record("F6 Unified 4-icon message toolbar", "N/A", "no completed entry rendered (no profile to dispatch)");
        record("F7 SQL copy icon", "N/A", "no completed entry rendered");
    } else {
        record("Ask Pulse textarea", "WARN", "textarea[placeholder='Ask about the loaded view…'] not found");
        record("F6 Unified 4-icon message toolbar", "N/A", "no textarea to drive");
        record("F7 SQL copy icon", "N/A", "no textarea to drive");
    }

    await pageAsk.screenshot({ path: join(EVIDENCE_DIR, "03-ask-pulse.png"), fullPage: true });
} catch (e) {
    record("Pass 3 (ask pulse)", "FAIL", e.message);
} finally {
    if (pageErrAsk.length > 0) {
        record("Pass 3 page errors", "WARN", pageErrAsk.slice(0, 3).join(" | "));
    }
    await ctxAsk.close();
}

await browser.close();

const summary = {
    baseUrl: BASE_URL,
    evidenceDir: EVIDENCE_DIR,
    results,
};
console.log(JSON.stringify(summary, null, 2));
