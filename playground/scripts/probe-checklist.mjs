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
  localStorage.setItem("pulseplay:bi-vendor", "powerbi");
  localStorage.setItem("pulseplay:active-ai-profile", "default");
  localStorage.setItem("pulseplay:default-landing-surface", "ai-insights");
  const k = "pulseplay:visual-settings:genieSettings";
  const ex = JSON.parse(localStorage.getItem(k) || "{}");
  ex.assistantProfile = "default"; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api";
  localStorage.setItem(k, JSON.stringify(ex));
});
await page.goto(`${BASE}/?surface=ai-insights`, { waitUntil: "domcontentloaded", timeout: 25000 });
// wait for the expanded steps dropdown to exist; if collapsed, click the toggle
const steps = page.locator(".gn-progress-steps").first();
try { await steps.waitFor({ state: "visible", timeout: 30000 }); }
catch {
  const tog = page.locator(".gn-progress-toggle").first();
  try { await tog.click(); } catch {}
}
await sleep(600);
await page.screenshot({ path: `${OUT}/checklist-expanded-desktop.png` });
console.log("shot checklist-expanded-desktop.png; steps visible:", await steps.isVisible().catch(()=>false));
await browser.close();
