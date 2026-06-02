#!/usr/bin/env node
// Capture each screen in two states — WHILE LOADING and AFTER LOADED — for the
// dev/Gemini reference set. 3 surfaces × {loading, loaded} × {light, dark} on the
// Genie connector (real multi-stage loading). Saves to the reference folder.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE = "http://127.0.0.1:7001";
const OUT = "D:/Working_Folder/Artifacts/PulsePly_ref/Screenshots-Dev-Genmini-reference";
const VP = { width: 1440, height: 900 };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const SURFACES = [
  { id: "ai-insights", label: "AI Insights" },
  { id: "ask-pulse", label: "Ask Pulse" },
  { id: "dashboard", label: "Dashboard" },
];

// Settings sections (path-based: /settings/<group>). Captured FULL-PAGE so every
// section/field is in the frame, not just the first viewport.
const SETTINGS_GROUPS = ["setup", "ai", "bi", "preferences", "advanced"];

const ONLY = (() => { const m = process.argv.find(a => a.startsWith("--only=")); return m ? m.split("=")[1] : "all"; })();

async function seed(page, dark) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
  await page.evaluate((dark) => {
    try { localStorage.clear(); } catch { /* */ }
    localStorage.setItem("pulseplay:bi-vendor", "powerbi");
    localStorage.setItem("pulseplay:active-ai-profile", "default");
    localStorage.setItem("pulseplay:default-landing-surface", "ai-insights");
    if (dark) localStorage.setItem("pulseplay:theme-mode", "dark");
    const k = "pulseplay:visual-settings:genieSettings";
    const ex = JSON.parse(localStorage.getItem(k) || "{}");
    ex.assistantProfile = "default"; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api";
    if (dark) ex.darkMode = true;
    localStorage.setItem(k, JSON.stringify(ex));
  }, dark);
}

// Wait until the surface looks "loaded" (no active progress + has content), capped.
async function waitLoaded(page, surface, capMs) {
  const dl = Date.now() + capMs;
  while (Date.now() < dl) {
    const done = await page.evaluate((surface) => {
      const running = !!document.querySelector(".gn-progress--active, .gn-insights-progress, [aria-busy='true']");
      if (surface === "ai-insights") {
        const secs = document.querySelectorAll('[data-section]:not(.gn-insights-section--placeholder)').length;
        return !running && secs >= 2;
      }
      if (surface === "ask-pulse") {
        return !!document.querySelector("textarea.gn-input, textarea.pp-ai-sidebar__input");
      }
      // dashboard: a panel / empty-state / iframe present
      return /Pulse Canvas|Embedded BI|Ask Pulse can render/i.test(document.body.innerText || "")
        || !!document.querySelector("iframe, .pp-bi-panel__container, [class*='bi-panel']");
    }, surface);
    if (done) return true;
    await sleep(1500);
  }
  return false;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ["--window-size=1460,960"] });
  const ctx = await browser.newContext({ viewport: VP });
  const page = await ctx.newPage();
  const log = (...a) => console.log(...a);

  if (ONLY === "all" || ONLY === "surfaces") {
    for (const dark of [false, true]) {
      const theme = dark ? "dark" : "light";
      for (const s of SURFACES) {
        await seed(page, dark);
        const t0 = Date.now();
        await page.goto(`${BASE}/?surface=${s.id}`, { waitUntil: "domcontentloaded", timeout: 25_000 });

        // ---- WHILE LOADING ---- (early frame: staging / skeletons / mount)
        await sleep(s.id === "ai-insights" ? 2600 : 1400);
        const loadingFile = `${s.id}-${theme}-loading.png`;
        await page.screenshot({ path: join(OUT, loadingFile) }).catch(() => {});
        log(`📸 ${loadingFile}`);

        // ---- AFTER LOADED ---- (settled)
        const cap = s.id === "ai-insights" ? 150_000 : 12_000;
        const ok = await waitLoaded(page, s.id, cap);
        await sleep(1500);
        const loadedFile = `${s.id}-${theme}-loaded.png`;
        await page.screenshot({ path: join(OUT, loadedFile) }).catch(() => {});
        log(`📸 ${loadedFile}  (settled=${ok}, ${(Date.now() - t0) / 1000 | 0}s)`);
      }
    }
  }

  // ---- SETTINGS — every section, FULL-PAGE (all fields in frame) ----
  if (ONLY === "all" || ONLY === "settings") {
    for (const dark of [false, true]) {
      const theme = dark ? "dark" : "light";
      for (const g of SETTINGS_GROUPS) {
        await seed(page, dark);
        await page.goto(`${BASE}/settings/${g}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
        await sleep(2600);
        // expand any collapsed progressive sections so the capture shows detail
        await page.evaluate(() => {
          document.querySelectorAll("[aria-expanded='false']").forEach(el => { try { (el).click(); } catch { /* */ } });
        }).catch(() => {});
        await sleep(900);
        const f = `settings-${g}-${theme}.png`;
        await page.screenshot({ path: join(OUT, f), fullPage: true }).catch(() => {});
        log(`📸 ${f}`);
      }
    }
  }

  await ctx.close().catch(() => {});
  await browser.close().catch(() => {});
  log(`\n[done] → ${OUT}`);
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
