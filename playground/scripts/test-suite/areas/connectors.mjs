// Area: connectors x surfaces. For each connector, walk AI Insights / Ask Pulse
// / Dashboard, exercise the core feature affordances, screenshot, and scan
// aesthetics. Records functional + visual findings.

import { CONNECTORS, SURFACES, SEV, sleep } from "../lib/harness.mjs";

const ASK = {
  default: "What were total sales by segment?",
  "powerbi-dwd": "What were total sales by segment?",
  foundation: "Summarize sales performance by segment",
  supervisor: "What were total sales by segment?",
};

async function settleInsights(page, capMs = 90_000) {
  const dl = Date.now() + capMs;
  while (Date.now() < dl) {
    const st = await page.evaluate(() => {
      const ph = document.querySelectorAll('.gn-insights-section--placeholder,[aria-busy="true"]').length;
      const secs = document.querySelectorAll('[data-section]:not(.gn-insights-section--placeholder)').length;
      const stillStaging = /Stage \d+ of \d+/i.test(document.body.innerText || "");
      return { ph, secs, stillStaging };
    });
    if (st.ph === 0 && st.secs >= 2 && !st.stillStaging) return true;
    await sleep(2000);
  }
  return false;
}

export async function runConnectors(h, { connectors, dark = false } = {}) {
  const list = connectors || Object.keys(CONNECTORS);
  for (const conn of list) {
    const meta = CONNECTORS[conn];
    const area = `connector:${conn}`;

    // ---- AI Insights ----
    await h.banner(`${meta.label} · AI Insights${dark ? " · dark" : ""}`, "#7c3aed");
    await h.configure({ connector: conn, vendor: meta.vendor, surface: "ai-insights", dark });
    const settled = await settleInsights(h.page);
    await sleep(1200);
    const insShot = await h.shot(`${conn}-ai-insights${dark ? "-dark" : ""}`);
    const ins = await h.page.evaluate(() => {
      const text = document.body.innerText || "";
      const sections = [...document.querySelectorAll('[data-section]:not(.gn-insights-section--placeholder)')].map((s) => s.getAttribute("data-section"));
      return {
        sectionCount: sections.length, sections,
        hasFallback: /I can answer questions like|no measure was mentioned/i.test(text),
        tables: document.querySelectorAll('[data-section] table').length,
        kpiTiles: document.querySelectorAll('.gn-kpi-tile').length,
        rawDaxCols: /\b\w+\[\w+\]/.test(text), // e.g. DIMCUSTOMER[SEGMENT]
        errorCard: /could not complete|authentication failed|something went wrong/i.test(text),
      };
    });
    h.steps.push({ area, name: "ai-insights", shot: insShot });
    if (ins.errorCard) h.finding(area, SEV.CRIT, "AI Insights error card", "", insShot);
    else if (ins.sectionCount < 2) h.finding(area, SEV.WARN, "AI Insights < 2 sections", `settled=${settled} sections=${ins.sectionCount}`, insShot);
    if (ins.hasFallback) h.finding(area, SEV.WARN, "AI Insights fallback text present", ins.sections.join(","), insShot);
    if (ins.rawDaxCols && meta.kind === "deterministic") h.finding(area, SEV.WARN, "Raw DAX column names shown (not humanized)", "e.g. DIMCUSTOMER[SEGMENT]", insShot);
    await h.scanAesthetics(area + ":insights", { dark });
    const rtIns = h.drainRuntimeErrors();
    if (rtIns.net.length) h.finding(area, SEV.INFO, "API errors during AI Insights", rtIns.net.join(" | "));

    // ---- Ask Pulse ----
    await h.banner(`${meta.label} · Ask Pulse${dark ? " · dark" : ""}`, "#0891b2");
    await h.configure({ connector: conn, vendor: meta.vendor, surface: "ask-pulse", dark });
    await sleep(1200);
    const composer = h.page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first();
    let askShot = "";
    if (await composer.count()) {
      await composer.fill(ASK[conn] || ASK.default);
      await sleep(150);
      const send = h.page.locator("button.gn-send, button.pp-ai-sidebar__ask").first();
      const t0 = Date.now();
      await send.click().catch(() => {});
      let ans = null;
      let doneStreak = 0;
      const adl = t0 + 75_000;
      while (Date.now() < adl) {
        const p = await h.page.evaluate(() => {
          const body = document.body.innerText || "";
          // The streaming progress capsule renders OUTSIDE the message bubble and
          // uses gn-progress--active / a progress bar / progress-vocabulary step
          // labels — none caught by `last.querySelector(.gn-chart-progress)`.
          const running = !!document.querySelector(".gn-progress--active, .gn-progress-bar-fill, .gn-insights-progress, [aria-busy='true']")
            || /Working out the right query|Getting started|Reading your data|Pulling the data|Connecting to AI|Applying your filters|Capturing the KPI|Flagging risks|Spotting trends|Recommending next|Warming up the warehouse|EXECUTING_QUERY|ASKING_AI/i.test(body);
          const msgs = document.querySelectorAll(".gn-msg--assistant, [data-testid^='pp-ai-entry-']");
          const last = msgs[msgs.length - 1];
          const text = last ? (last.textContent || "").trim() : "";
          const rows = last ? last.querySelectorAll("table tr").length : 0;
          const err = /could not complete this request|authentication failed|share the support code|something went wrong|Proxy Offline/i.test(text);
          // a REAL chart = an echarts canvas/svg inside a chart container (exclude the 👍👎 svgs)
          const chart = last ? last.querySelectorAll(".gn-chart canvas, .gn-chart svg, canvas").length : 0;
          return { len: text.length, rows, running, err, chart, text: text.slice(0, 140) };
        });
        if (p && p.err) { ans = { ...p, ms: Date.now() - t0, error: true }; break; }
        // Done = NOT running AND a real answer artifact (table / chart / real prose).
        // Two consecutive not-running reads guard the brief gap between steps.
        const hasAnswer = p && (p.rows > 0 || p.chart > 0 || p.len > 60);
        if (p && !p.running && hasAnswer) { doneStreak = (doneStreak || 0) + 1; if (doneStreak >= 2) { ans = { ...p, ms: Date.now() - t0 }; break; } }
        else doneStreak = 0;
        await sleep(500);
      }
      await sleep(1000);
      askShot = await h.shot(`${conn}-ask-pulse${dark ? "-dark" : ""}`);
      h.steps.push({ area, name: "ask-pulse", shot: askShot, ms: ans?.ms });
      // feature affordances present?
      const aff = await h.page.evaluate(() => ({
        chartTypePicker: !!document.querySelector(".gn-chart-type-select, select[aria-label*='chart' i]"),
        palettePicker: !!document.querySelector(".gn-chart-palette-select"),
        pinToCanvas: /Pin to canvas/i.test(document.body.innerText || ""),
        sqlTab: !!document.querySelector(".gn-sql-pre-wrap, .gn-code"),
      }));
      if (ans?.error) h.finding(area, SEV.CRIT, "Ask Pulse answer errored", ans.text, askShot);
      else if (!ans) h.finding(area, SEV.CRIT, "Ask Pulse no answer (timeout)", "", askShot);
      else {
        if (ans.rows > 0 && ans.chart === 0) h.finding(area, SEV.WARN, "Ask Pulse table without chart", `${ans.rows} rows, no chart (${meta.kind})`, askShot);
        if (ans.chart > 0 && !aff.chartTypePicker) h.finding(area, SEV.INFO, "Chart without chart-type picker", "", askShot);
        if (ans.chart > 0 && !aff.pinToCanvas) h.finding(area, SEV.INFO, "Chart without Pin-to-canvas", "", askShot);
      }
    } else {
      h.finding(area, SEV.CRIT, "Ask Pulse composer missing");
    }
    await h.scanAesthetics(area + ":ask", { dark });
    h.drainRuntimeErrors();

    // ---- Dashboard ----
    await h.banner(`${meta.label} · Dashboard${dark ? " · dark" : ""}`, "#16a34a");
    await h.configure({ connector: conn, vendor: meta.vendor, surface: "dashboard", dark });
    await sleep(2000);
    const dashShot = await h.shot(`${conn}-dashboard${dark ? "-dark" : ""}`);
    h.steps.push({ area, name: "dashboard", shot: dashShot });
    await h.scanAesthetics(area + ":dashboard", { dark });
    h.drainRuntimeErrors();
  }
}
