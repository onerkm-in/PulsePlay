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
  localStorage.setItem("pulseplay:bi-vendor","native");
  localStorage.setItem("pulseplay:active-ai-profile","default");
  const k="pulseplay:visual-settings:genieSettings";
  const ex=JSON.parse(localStorage.getItem(k)||"{}");
  ex.assistantProfile="default"; ex.connectionMode="proxy"; ex.apiBaseUrl=location.origin+"/api";
  localStorage.setItem(k, JSON.stringify(ex));
});
await page.goto(`${BASE}/?surface=dashboard`, { waitUntil: "domcontentloaded", timeout: 25000 });
await sleep(3500);
const r = await page.evaluate(() => ({
  collapsedPills: document.querySelectorAll(".gn-context-setup__trigger").length,
  verboseStrips: document.querySelectorAll(".pp-surface-context").length,
}));
console.log("RESULT:", JSON.stringify(r));
await page.screenshot({ path: `${OUT}/dash-context-collapsed.png` });
// also click the pill to show the popover
const pill = page.locator(".gn-context-setup__trigger").last();
if (await pill.isVisible().catch(()=>false)) { await pill.click(); await sleep(500); await page.screenshot({ path: `${OUT}/dash-context-popover.png` }); console.log("popover captured"); }
await browser.close();
