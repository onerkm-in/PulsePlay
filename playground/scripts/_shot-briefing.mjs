import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 820, height: 1060 } });
await p.goto(pathToFileURL(resolve("../docs/briefing/PulsePlay-Executive-Briefing.html")).href, { waitUntil: "networkidle" });
await p.waitForTimeout(400);
await p.screenshot({ path: "screenshots/briefing-cover.png" }); // cover (top)
// scroll to the architecture diagram
await p.evaluate(() => { const el = [...document.querySelectorAll('h2')].find(h=>/Architecture & moving/.test(h.textContent)); el?.scrollIntoView(); });
await p.waitForTimeout(300);
await p.screenshot({ path: "screenshots/briefing-arch.png" });
await b.close();
console.log("shots done");
