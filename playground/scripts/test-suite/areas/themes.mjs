// Area: themes x dark-mode. For each Settings → Appearance theme, render the
// chrome in light AND dark and run the aesthetic scanner (white-in-dark, low
// contrast, overflow). Catches the "white blaze in dark mode" / unreadable-text
// class of regressions across every preset. Uses a fast connector — we're
// scanning chrome + empty state, not waiting on live data.

import { THEMES, SURFACES, SEV, sleep } from "../lib/harness.mjs";

export async function runThemes(h, { connector = "default", vendor = "powerbi" } = {}) {
  // Scan each surface once per theme so per-surface chrome (insights cards,
  // chat bubbles, dashboard empty state) is all covered. ai-insights + ask-pulse
  // carry the richest chrome; dashboard is the empty-state pane.
  const surfaces = ["ai-insights", "ask-pulse", "dashboard"];
  for (const theme of THEMES) {
    for (const dark of [false, true]) {
      const tag = `${theme}-${dark ? "dark" : "light"}`;
      const area = `theme:${tag}`;
      await h.banner(`Theme ${theme} · ${dark ? "dark" : "light"}`, dark ? "#1e293b" : "#0891b2");
      let worstShot = "";
      for (const surface of surfaces) {
        await h.configure({ connector, vendor, surface, theme, dark });
        await sleep(1200);
        const shot = await h.shot(`${tag}-${surface}`);
        if (surface === "ai-insights") worstShot = shot;
        const res = await h.scanAesthetics(`${area}:${surface}`, { dark });
        h.steps.push({ area, name: surface, shot });
        // attach the screenshot to any dark white-blaze finding for review
        if (dark && res.whiteInDark.length) {
          // re-tag the last finding with the shot
          const last = h.findings[h.findings.length - 1];
          if (last && last.title.includes("White surface")) last.shot = shot;
        }
      }
      h.drainRuntimeErrors();
      void worstShot;
    }
  }
}
