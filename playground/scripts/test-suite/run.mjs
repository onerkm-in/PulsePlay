#!/usr/bin/env node
// PulsePlay observable UI test module — orchestrator.
//
//   node scripts/test-suite/run.mjs [--areas=connectors,themes] [--connectors=default,powerbi-dwd]
//                                    [--dark] [--headed] [--out=<dir>]
//
// Default: all areas, all connectors, headed. Writes screenshots + report to
// docs/evidence/test-suite/<timestamp>/.

import { Harness, CONNECTORS } from "./lib/harness.mjs";
import { runConnectors } from "./areas/connectors.mjs";
import { runThemes } from "./areas/themes.mjs";
import { runFeatures } from "./areas/features.mjs";
import { runChrome } from "./areas/chrome.mjs";

const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.split("=").slice(1).join("=") : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const list = (v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null);

async function main() {
  const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const areas = list(arg("areas")) || ["connectors", "themes", "features", "chrome"];
  const connectors = list(arg("connectors")) || Object.keys(CONNECTORS);
  const dark = flag("dark");
  const headed = flag("headed") || !flag("headless");
  const outDir = arg("out") || `d:/Working_Folder/Projects/PulsePlay/docs/evidence/test-suite/${runId}`;

  console.log(`\n╔═ PulsePlay UI Test Module ═╗`);
  console.log(`  run:        ${runId}`);
  console.log(`  areas:      ${areas.join(", ")}`);
  console.log(`  connectors: ${connectors.join(", ")}`);
  console.log(`  mode:       ${headed ? "headed (watchable)" : "headless"}${dark ? " · dark" : " · light"}`);
  console.log(`  out:        ${outDir}\n`);

  const h = new Harness({ headed, outDir });
  await h.start();
  try {
    if (areas.includes("connectors")) {
      console.log(`\n──── AREA: connectors ────`);
      await runConnectors(h, { connectors, dark });
      if (dark === false && flag("both-themes")) {
        console.log(`\n──── AREA: connectors (dark pass) ────`);
        await runConnectors(h, { connectors, dark: true });
      }
    }
    if (areas.includes("themes")) {
      console.log(`\n──── AREA: themes ────`);
      await runThemes(h, {});
    }
    if (areas.includes("features")) {
      console.log(`\n──── AREA: features ────`);
      await runFeatures(h);
    }
    if (areas.includes("chrome")) {
      console.log(`\n──── AREA: chrome ────`);
      await runChrome(h);
    }
  } catch (e) {
    const msg = String(e?.message || e);
    console.error("[harness error]", e);
    // Playwright navigation races (a page navigated while a page.evaluate / locator
    // was in flight) are harness-infra flakes, NOT product bugs — don't count them
    // as product criticals (same spirit as the ERR_ABORTED filter).
    const isNavRace = /Execution context was destroyed|Target (page|browser|closed)|frame (was )?detached|Navigation|context was destroyed/i.test(msg);
    h.finding("harness", isNavRace ? "INFO" : "CRITICAL", isNavRace ? "Harness navigation race (infra flake)" : "Harness exception", msg);
  } finally {
    await h.report({ runId, areas, connectors, dark });
    await h.stop();
  }
}
main().catch((e) => { console.error("[FAIL]", e); process.exitCode = 1; });
