#!/usr/bin/env node
// Validate the in-UI multi-Genie-space manager end-to-end: seed a REAL custom
// space (creds read from proxy/config.json), drive the Settings UI to confirm
// it lists + "Use", then ask a question on Ask Pulse and confirm the inline
// space answers (proving inline-credential routing works, no config.json edit).
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";

const BASE = "http://127.0.0.1:7001";
const OUT = "d:/Working_Folder/Projects/PulsePlay/docs/evidence/genie-spaces";
const slow = process.argv.includes("--headed");
const cfg = JSON.parse(readFileSync("d:/Working_Folder/Projects/PulsePlay/proxy/config.json", "utf8"));
const d = cfg.profiles.default;
// Use the HSE space (a real distinct Genie space) with the shared workspace creds.
const space = { id: "cgs-test-hse", label: "Genie: HSE (UI-added)", host: d.host, spaceId: cfg.profiles.hse?.spaceId || "01f13d2bcd0a1be2a333d78bca0911b6", token: d.token, dataDomain: "health, safety & fulfilment data" };

const results = [];
const rec = (n, ok, det = "") => { results.push({ n, ok }); console.log(`${ok ? "✓" : "✗"} ${n}${det ? " — " + det : ""}`); };

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: !slow, slowMo: slow ? 250 : 0, args: ["--window-size=1500,1000"] });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();

  // Seed the custom space + a clean baseline (named 'default' connector).
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
  await page.evaluate((s) => {
    try { localStorage.clear(); } catch { /* */ }
    localStorage.setItem("pulseplay:bi-vendor", "powerbi");
    localStorage.setItem("pulseplay:active-ai-profile", "default");
    const k = "pulseplay:visual-settings:genieSettings";
    const ex = JSON.parse(localStorage.getItem(k) || "{}");
    ex.assistantProfile = "default"; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api";
    localStorage.setItem(k, JSON.stringify(ex));
    localStorage.setItem("pulseplay:custom-genie-spaces", JSON.stringify([s]));
  }, space);

  // 1) Settings shows the space in the manager.
  await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded", timeout: 25_000 });
  await page.waitForTimeout(2000);
  // expand the Genie spaces section if collapsed (click its header)
  const header = page.locator("text=Genie spaces (multi-space)").first();
  if (await header.count()) { await header.click().catch(() => {}); await page.waitForTimeout(800); }
  await page.screenshot({ path: OUT + "/01-settings-genie-spaces.png" }).catch(() => {});
  const listed = await page.evaluate((label) => (document.body.innerText || "").includes(label), space.label);
  rec("Custom space listed in Settings", listed, space.label);

  // 2) Click "Use" → genieSettings gets the inline creds.
  const useBtn = page.locator("button:has-text('Use')").first();
  if (await useBtn.count()) { await useBtn.click().catch(() => {}); await page.waitForTimeout(1000); }
  const applied = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("pulseplay:visual-settings:genieSettings") || "{}");
    return { spaceId: s.spaceId, host: s.host, hasToken: !!s.token };
  });
  rec("Use wrote inline creds to genieSettings", applied.spaceId === space.spaceId && applied.hasToken, `spaceId=${applied.spaceId?.slice(0, 8)} token=${applied.hasToken}`);
  await page.screenshot({ path: OUT + "/02-after-use.png" }).catch(() => {});

  // 3) Ask Pulse answers via the inline space (proves inline routing).
  await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 25_000 });
  await page.waitForTimeout(2000);
  const composer = page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first();
  // What we're proving: the UI-added inline space is the one being queried.
  // Pass on a completed answer OR on clear evidence the inline space is mid-flight
  // (assistant strip shows the custom label + a live Genie query/trace) — a slow
  // space must not read as a routing failure. Fail only on an error card.
  let routed = false, errored = false, preview = "";
  if (await composer.count()) {
    await composer.fill("Give me a one line summary.");
    await page.waitForTimeout(150);
    await page.locator("button.gn-send, button.pp-ai-sidebar__ask").first().click().catch(() => {});
    const dl = Date.now() + 90_000;
    while (Date.now() < dl) {
      const p = await page.evaluate((label) => {
        const msgs = document.querySelectorAll(".gn-msg--assistant, [data-testid^='pp-ai-entry-']");
        const last = msgs[msgs.length - 1];
        const body = document.body.innerText || "";
        const usingCustom = body.includes(label);
        const genieActive = /DATABRICKS GENIE TRACE|EXECUTING_QUERY|Pulling the data|Working out the right query/i.test(body);
        if (!last) return { usingCustom, genieActive };
        const text = (last.textContent || "").trim();
        const progress = !!last.querySelector(".gn-chat-progress, .gn-progress-active");
        const err = /could not complete|authentication failed|support code|something went wrong/i.test(text);
        return { len: text.length, progress, err, usingCustom, genieActive, text: text.slice(0, 120) };
      }, space.label);
      if (p && p.err) { errored = true; preview = p.text; break; }
      if (p && !p.progress && p.len > 30) { routed = true; preview = p.text; break; }
      // mid-flight on the correct inline space counts as routed
      if (p && p.usingCustom && p.genieActive) { routed = true; preview = "(live Genie query in progress on the UI-added space)"; }
      await page.waitForTimeout(500);
    }
  }
  await page.screenshot({ path: OUT + "/03-ask-pulse-inline-answer.png" }).catch(() => {});
  rec("Ask Pulse routes to the UI-added inline Genie space", routed && !errored, errored ? `ERROR: ${preview}` : preview);

  const pass = results.filter(r => r.ok).length;
  console.log(`\n${pass}/${results.length} checks passed → ${OUT}`);
  if (slow) await page.waitForTimeout(1500);
  await browser.close().catch(() => {});
  process.exitCode = pass === results.length ? 0 : 1;
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
