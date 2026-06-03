import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
const OUT = "D:/Working_Folder/Artifacts/PulsePly_ref/Screenshots-Dev-Genmini-reference";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25000 });
await page.evaluate(() => {
  try { localStorage.clear(); } catch {}
  localStorage.setItem("pulseplay:bi-vendor","powerbi");
  localStorage.setItem("pulseplay:active-ai-profile","default");
  localStorage.setItem("pulseplay:default-landing-surface","ai-insights");
  const k="pulseplay:visual-settings:genieSettings";
  const ex=JSON.parse(localStorage.getItem(k)||"{}");
  ex.assistantProfile="default"; ex.connectionMode="proxy"; ex.apiBaseUrl=location.origin+"/api";
  localStorage.setItem(k, JSON.stringify(ex));
});
await page.goto(`${BASE}/?surface=ai-insights`, { waitUntil: "domcontentloaded", timeout: 25000 });
await sleep(4000);
const data = await page.evaluate(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return {t:Math.round(b.top),b:Math.round(b.bottom),l:Math.round(b.left),r:Math.round(b.right)}; };
  const named = {};
  const grab = (key, sel) => { const e = document.querySelector(sel); if (e) named[key] = r(e); };
  grab("toolbar", ".pp-top-right-toolbar");
  grab("stop", ".gn-pane-action-btn--stop");
  grab("ctxPill", ".gn-context-setup__trigger");
  grab("ctxProgress", ".gn-context-progress");
  // last meta button (rightmost) in run-state
  const metaBtns = [...document.querySelectorAll(".gn-header-run-state .gn-pane-action-btn")];
  if (metaBtns.length) named.metaRight = r(metaBtns[metaBtns.length-1]);
  const ov = (a,b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  return { named, checks: {
    "toolbar×stop": ov(named.toolbar, named.stop),
    "toolbar×metaRight": ov(named.toolbar, named.metaRight),
    "ctxPill×ctxProgress": ov(named.ctxPill, named.ctxProgress),
  }};
});
console.log(JSON.stringify(data, null, 2));
await page.screenshot({ path: `${OUT}/overlap-check-running.png` });
await browser.close();
