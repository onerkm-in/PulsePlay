// Probe what element is rendering at the bottom-right corner of the screen.
import { chromium } from "@playwright/test";

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
    await page.goto("http://127.0.0.1:7001/", { waitUntil: "networkidle" });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // Switch to Ask Pulse so we get the composer view
    const askTab = page.locator('button:has-text("Ask Pulse")').first();
    if (await askTab.count() > 0) { await askTab.click(); await page.waitForTimeout(1200); }

    // Find element at bottom-right region
    const at = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        const chain = [];
        let cur = el;
        while (cur && chain.length < 5) {
            chain.push({
                tag: cur.tagName,
                class: cur.className && typeof cur.className === "string" ? cur.className : (cur.className?.baseVal || ""),
                id: cur.id || "",
                text: (cur.textContent || "").slice(0, 60).trim(),
                rect: cur.getBoundingClientRect && JSON.stringify(cur.getBoundingClientRect()).slice(0, 200),
            });
            cur = cur.parentElement;
        }
        return chain;
    }, { x: 1360, y: 905 });
    console.log("bottom-right chain at (1360,905):", JSON.stringify(at, null, 2));

    // Sweep emoji presence in body
    const emojis = await page.evaluate(() => {
        const text = document.body.innerText;
        const found = {};
        for (const ch of ["🌴", "🏝", "🍃", "🌱", "🍁", "🌿", "✨", "📊"]) {
            const re = new RegExp(ch, "g");
            const matches = text.match(re);
            if (matches) found[ch] = matches.length;
        }
        return found;
    });
    console.log("emojis in body:", emojis);

    await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
