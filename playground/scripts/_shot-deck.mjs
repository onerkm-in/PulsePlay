import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(pathToFileURL(resolve("../docs/briefing/PulsePlay-Deck.html")).href, { waitUntil: "networkidle" });
await p.waitForTimeout(400);
// title
await p.evaluate(()=>document.querySelectorAll('.slide')[0].scrollIntoView()); await p.waitForTimeout(250);
await p.screenshot({ path: "screenshots/deck-1.png" });
// data flow slide (index 5)
await p.evaluate(()=>document.querySelectorAll('.slide')[5].scrollIntoView()); await p.waitForTimeout(250);
await p.screenshot({ path: "screenshots/deck-6.png" });
await b.close(); console.log("deck shots done");
