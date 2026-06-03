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
// RUNNING: status should be on the context line
await page.locator(".gn-context-progress").first().waitFor({ state: "visible", timeout: 30000 }).catch(()=>console.log("context-progress NOT visible while running"));
await sleep(3500);
await page.screenshot({ path: `${OUT}/ctxstatus-running.png` });
const onCtx = await page.locator(".gn-context-bar .gn-context-progress").count();
console.log("running: .gn-context-progress in context bar =", onCtx);
// wait for completion (insightsBusy false → status hides). Cap ~150s.
const dl = Date.now() + 150000;
let hidden = false;
while (Date.now() < dl) {
  const busy = await page.locator(".gn-context-progress").isVisible().catch(()=>false);
  const secs = await page.locator('[data-section]:not(.gn-insights-section--placeholder)').count();
  if (!busy && secs >= 2) { hidden = true; break; }
  await sleep(2000);
}
await sleep(1000);
await page.screenshot({ path: `${OUT}/ctxstatus-complete.png` });
console.log("complete: status hidden =", hidden, "; .gn-context-progress count =", await page.locator(".gn-context-progress").count());
await browser.close();
