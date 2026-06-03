import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
const OUT = "D:/Working_Folder/Artifacts/PulsePly_ref/Screenshots-Dev-Genmini-reference";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 820 } });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25000 });
await page.evaluate(() => {
  try { localStorage.clear(); } catch {}
  localStorage.setItem("pulseplay:bi-vendor","native");
  localStorage.setItem("pulseplay:active-ai-profile","default");
  const k="pulseplay:visual-settings:genieSettings";
  const ex=JSON.parse(localStorage.getItem(k)||"{}");
  ex.assistantProfile="default"; ex.connectionMode="proxy"; ex.apiBaseUrl=location.origin+"/api";
  localStorage.setItem(k, JSON.stringify(ex));
});
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 25000 });
await sleep(4500);
const data = await page.evaluate(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return {t:Math.round(b.top),b:Math.round(b.bottom),l:Math.round(b.left),r:Math.round(b.right)}; };
  const out = { panes: [], verboseStrips: document.querySelectorAll(".pp-surface-context").length, pills: document.querySelectorAll(".gn-context-setup__trigger").length };
  const tb = document.querySelector(".pp-top-right-toolbar"); out.toolbar = tb ? r(tb) : null;
  // every collapsed pill + its rect
  out.pillRects = [...document.querySelectorAll(".gn-context-setup__trigger")].map(r);
  out.verboseRects = [...document.querySelectorAll(".pp-surface-context")].map(r);
  // overlap of toolbar with each pill / verbose strip
  const ov = (a,b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  out.toolbarOverlapsPill = out.pillRects.some(p => ov(out.toolbar, p));
  out.toolbarOverlapsVerbose = out.verboseRects.some(p => ov(out.toolbar, p));
  return out;
});
console.log(JSON.stringify(data, null, 2));
await page.screenshot({ path: `${OUT}/split-overlap-check.png`, fullPage: false });
await browser.close();
