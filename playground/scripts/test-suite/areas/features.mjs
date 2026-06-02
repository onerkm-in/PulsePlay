// Area: cross-cutting features + regression guards. Exercises chart palettes,
// the answer affordances (chart-type picker / palette picker / pin-to-canvas),
// the layout presets (best-effort visual), Settings, and explicit regression
// checks for the fixes shipped 2026-06-02 (no preset nag on the deterministic
// PBI briefing; no warehouse/start console 400). Uses powerbi-dwd — its
// deterministic answer renders a chart in ~0.5s, so the feature surface is
// stable and fast.

import { PALETTES, PRESETS, SEV, sleep } from "../lib/harness.mjs";

const PBI = { connector: "powerbi-dwd", vendor: "powerbi" };
const ASK = "What were total sales by segment?";

async function deterministicAnswer(h, surface = "ask-pulse") {
  await h.configure({ ...PBI, surface });
  await sleep(1000);
  const composer = h.page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first();
  if (!(await composer.count())) return false;
  await composer.fill(ASK);
  await sleep(150);
  await h.page.locator("button.gn-send, button.pp-ai-sidebar__ask").first().click().catch(() => {});
  // deterministic — wait for the chart canvas/svg to appear
  const dl = Date.now() + 20_000;
  while (Date.now() < dl) {
    const ok = await h.page.evaluate(() => !!document.querySelector(".gn-chart canvas, .gn-chart svg, .gn-answer-section--chart canvas, .gn-answer-section--chart svg"));
    if (ok) return true;
    await sleep(400);
  }
  return false;
}

export async function runFeatures(h) {
  // ---- 1. Chart palettes — render ONE answer, then switch palettes via the
  // in-chart picker (client-side CSS re-skin, ZERO new proxy requests, so we
  // never trip the rate limit). ----
  await h.banner("Chart palettes (in-chart picker)", "#8b5cf6");
  const paletteChart = await deterministicAnswer(h, "ask-pulse");
  if (!paletteChart) {
    h.finding("features:palette", SEV.WARN, "Could not render a chart to test palettes", "");
  } else {
    const palSel = h.page.locator(".gn-chart-palette-select").first();
    for (const palette of PALETTES) {
      if (await palSel.count()) {
        await palSel.selectOption(palette).catch(() => {});
        await sleep(500);
      }
      const shot = await h.shot(`palette-${palette}`);
      h.steps.push({ area: "features:palette", name: palette, shot });
    }
  }

  // ---- 2. Answer affordances — reuse the same answer (no re-ask). ----
  await h.banner("Affordances · chart picker / palette / pin", "#0891b2");
  const haveChart = paletteChart;
  const affShot = await h.shot("affordances-answer");
  h.steps.push({ area: "features:affordances", name: "answer", shot: affShot });
  if (!haveChart) {
    const transient = await h.page.evaluate(() => /Too many requests|Slow down|rate limit/i.test(document.body.innerText || ""));
    h.finding("features:affordances", transient ? SEV.INFO : SEV.CRIT,
      transient ? "Answer hit proxy rate-limit (harness pacing, not a product bug)" : "Deterministic answer rendered no chart", "", affShot);
  } else {
    const aff = await h.page.evaluate(() => ({
      chartTypePicker: !!document.querySelector(".gn-chart-type-select, select[aria-label*='chart' i]"),
      palettePicker: !!document.querySelector(".gn-chart-palette-select"),
      pinToCanvas: /Pin to canvas/i.test(document.body.innerText || ""),
      whyChart: !!document.querySelector("[aria-label*='why' i], .gn-chart-rationale-pill, [title*='chart' i]"),
    }));
    if (!aff.chartTypePicker) h.finding("features:affordances", SEV.WARN, "No chart-type picker on deterministic chart", "", affShot);
    if (!aff.palettePicker) h.finding("features:affordances", SEV.WARN, "No palette picker on deterministic chart", "", affShot);
    if (!aff.pinToCanvas) h.finding("features:affordances", SEV.WARN, "No Pin-to-canvas on deterministic chart", "", affShot);
    // switch chart type via the picker and confirm it doesn't crash
    const sel = h.page.locator(".gn-chart-type-select, select[aria-label*='chart' i]").first();
    if (await sel.count()) {
      try {
        await sel.selectOption({ label: "Bar (Horizontal)" }).catch(async () => { await sel.selectOption({ index: 2 }).catch(() => {}); });
        await sleep(800);
        await h.shot("affordances-chart-switched");
      } catch { /* non-fatal */ }
    }
    // pin to canvas, then verify a tile shows on the Dashboard
    const pinBtn = h.page.locator("button:has-text('Pin to canvas')").first();
    if (await pinBtn.count()) {
      await pinBtn.click().catch(() => {});
      await sleep(800);
      // Switch to Dashboard via the in-page tab (NOT configure() — that clears
      // localStorage where pinned tiles live, which would wipe the tile we just
      // created). Pinned tiles persist in storage; the tab swap keeps them.
      await h.page.locator("button:has-text('Dashboard'), [role='tab']:has-text('Dashboard')").first().click().catch(() => {});
      await sleep(1800);
      const tiles = await h.page.evaluate(() => document.querySelectorAll(".pp-canvas-tile, [data-tile-id]").length);
      const pinShot = await h.shot("affordances-pinned-tile");
      h.steps.push({ area: "features:affordances", name: "pin-to-canvas", shot: pinShot });
      if (tiles === 0) h.finding("features:affordances", SEV.WARN, "Pin-to-canvas produced no Dashboard tile", "", pinShot);
    }
  }
  h.drainRuntimeErrors();

  // ---- 3. Regression guards (the 2026-06-02 fixes) ----
  await h.banner("Regression guards · no preset nag / no warehouse 400", "#16a34a");
  await h.configure({ ...PBI, surface: "ai-insights" });
  // settle the deterministic briefing
  const dl = Date.now() + 60_000;
  while (Date.now() < dl) {
    const st = await h.page.evaluate(() => {
      const secs = document.querySelectorAll('[data-section]:not(.gn-insights-section--placeholder)').length;
      const staging = /Stage \d+ of \d+/i.test(document.body.innerText || "");
      return { secs, staging };
    });
    if (st.secs >= 2 && !st.staging) break;
    await sleep(2000);
  }
  await sleep(1500);
  const regShot = await h.shot("regression-pbi-insights");
  h.steps.push({ area: "features:regression", name: "pbi-insights", shot: regShot });
  const reg = await h.page.evaluate(() => ({
    presetNag: /No status colors|Choose preset/i.test(document.body.innerText || ""),
    rawDax: /\b\w+\[\w+\]/.test(document.body.innerText || ""),
  }));
  if (reg.presetNag) h.finding("features:regression", SEV.CRIT, "REGRESSION: preset nag back on deterministic briefing", "", regShot);
  if (reg.rawDax) h.finding("features:regression", SEV.WARN, "REGRESSION: raw DAX column names back in briefing", "", regShot);
  const rt = h.drainRuntimeErrors();
  if (rt.net.some(e => /warehouse\/start/.test(e) && /400/.test(e))) {
    h.finding("features:regression", SEV.WARN, "REGRESSION: warehouse/start 400 is back", rt.net.filter(e => /warehouse/.test(e)).join(" | "));
  }

  // ---- 4. Layout presets (best-effort visual) ----
  for (const preset of PRESETS) {
    await h.banner(`Layout preset · ${preset}`, "#7c3aed");
    await h.page.goto("http://127.0.0.1:7001/", { waitUntil: "domcontentloaded" }).catch(() => {});
    await h.page.evaluate((p) => {
      const map = {
        balanced: { ec: "mix", lm: "ai-left" }, "split-mix": { ec: "both", lm: "ai-left" },
        "bi-focus": { ec: "biOnly", lm: "ai-left" }, "insights-focus": { ec: "aiOnly", lm: "ai-left" },
        "ask-focus": { ec: "aiOnly", lm: "ai-left" },
      };
      const m = map[p] || map.balanced;
      localStorage.setItem("pulseplay:enabled-components", m.ec);
      localStorage.setItem("pulseplay:layout-mode", m.lm);
    }, preset);
    await h.page.goto("http://127.0.0.1:7001/?surface=ai-insights", { waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(1500);
    const shot = await h.shot(`preset-${preset}`);
    h.steps.push({ area: "features:preset", name: preset, shot });
    await h.scanAesthetics(`features:preset:${preset}`, { dark: false });
  }
  h.drainRuntimeErrors();

  // ---- 5. Settings loads ----
  await h.banner("Settings page", "#2563eb");
  await h.page.goto("http://127.0.0.1:7001/settings", { waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(1800);
  const setShot = await h.shot("settings");
  h.steps.push({ area: "features:settings", name: "settings", shot: setShot });
  const settingsOk = await h.page.evaluate(() => (document.body.innerText || "").length > 200 && !/something went wrong|cannot read/i.test(document.body.innerText || ""));
  if (!settingsOk) h.finding("features:settings", SEV.CRIT, "Settings page did not render", "", setShot);
  await h.scanAesthetics("features:settings", { dark: false });
  h.drainRuntimeErrors();
}
