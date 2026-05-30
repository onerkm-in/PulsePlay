import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const OUT = "screenshots/evolving";
await mkdir(OUT, { recursive: true });
const b = await chromium.launch({ headless: true });
const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
await c.addInitScript(() => {
  try {
    localStorage.setItem("pulseplay:ai-profile", "genie-default");
    localStorage.setItem("pulseplay:bi-vendor", "powerbi");
    localStorage.setItem("pulseplay:api-base-url", "/api");
    localStorage.setItem("pulseplay:setup-wizard-dismissed", "true");
    // Turn dark mode ON via the genieSettings slice PreferencesAppearance writes.
    localStorage.setItem("pulseplay:visual-settings:genieSettings", JSON.stringify({
      assistantProfile: "genie-default", connectionMode: "proxy", apiBaseUrl: "/api", darkMode: true,
    }));
  } catch {}
});
const p = await c.newPage();
// Workbench
await p.goto("http://127.0.0.1:7001/", { waitUntil: "domcontentloaded", timeout: 25000 });
await p.waitForTimeout(2500);
const shellClass = await p.evaluate(() => document.querySelector(".gn-shell")?.className || "(no gn-shell)");
const shellBg = await p.evaluate(() => {
  const el = document.querySelector(".gn-shell"); return el ? getComputedStyle(el).backgroundColor : "(none)";
});
console.log("Workbench .gn-shell class:", shellClass);
console.log("Workbench .gn-shell bg:", shellBg);
await p.screenshot({ path: `${OUT}/15-dark-workbench.png` });
// Settings
await p.goto("http://127.0.0.1:7001/settings/ai", { waitUntil: "domcontentloaded", timeout: 20000 });
await p.waitForTimeout(1500);
const settingsBg = await p.evaluate(() => {
  const el = document.querySelector(".pp-settings"); return el ? getComputedStyle(el).backgroundColor : "(none)";
});
console.log("Settings .pp-settings bg:", settingsBg);
await p.screenshot({ path: `${OUT}/16-dark-settings.png` });
await b.close();
