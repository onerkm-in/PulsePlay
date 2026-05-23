// Ask Pulse home capture probe — captures what the user sees when they land
// on /?surface=ask-pulse with (a) no config and (b) default profile set.
// Writes screenshots + a JSON shape summary for offline diagnosis before any
// code change to the Ask Pulse home design.

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const EVIDENCE_DIR = join(REPO_ROOT, "docs", "evidence", "ask-pulse-home-2026-05-23");
const BASE = process.env.PP_BASE_URL || "http://127.0.0.1:5173/";
const URL_FRESH = new URL("?surface=ask-pulse", BASE).toString();

await mkdir(EVIDENCE_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function capture(label, opts) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", e => consoleErrors.push(`pageerror: ${e.message}`));

    if (opts.seedLocalStorage) {
        // Seed BEFORE navigation so first paint sees the seeded state.
        await page.addInitScript(seed => {
            try {
                for (const [k, v] of Object.entries(seed)) {
                    window.localStorage.setItem(k, v);
                }
            } catch { /* ignore */ }
        }, opts.seedLocalStorage);
    }

    await page.goto(URL_FRESH, { waitUntil: "domcontentloaded" });
    // Wait for the App Suspense boundary to resolve + chat surface to mount.
    // "Loading PulsePlay..." typically clears within 2-3s; the welcome section
    // needs a beat more after that to settle. 5s is generous; reduces flake.
    await page.waitForTimeout(5000);

    const shotPath = join(EVIDENCE_DIR, `${label}.png`);
    try {
        await page.screenshot({ path: shotPath, fullPage: true });
    } catch (err) {
        consoleErrors.push(`screenshot: ${String(err)}`);
    }

    const shape = await page.evaluate(() => {
        const pick = (sel) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
                exists: true,
                tag: el.tagName.toLowerCase(),
                classes: (el.className || "").toString().split(/\s+/).filter(Boolean),
                visibleText: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300),
                width: Math.round(r.width),
                height: Math.round(r.height),
            };
        };
        const all = (sel) => {
            return Array.from(document.querySelectorAll(sel)).map(el => {
                const r = el.getBoundingClientRect();
                return {
                    tag: el.tagName.toLowerCase(),
                    classes: (el.className || "").toString().split(/\s+/).filter(Boolean),
                    text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
                    width: Math.round(r.width),
                    height: Math.round(r.height),
                };
            }).slice(0, 30);
        };
        return {
            url: location.href,
            title: document.title,
            bodyWidth: document.body.scrollWidth,
            bodyHeight: document.body.scrollHeight,
            activeSurface: document.body.getAttribute("data-active-surface"),
            chatRegion: pick("[data-active-surface='ask-pulse']") || pick(".pp-pane--ai") || pick("[class*='chat']"),
            emptyStateCandidates: all("[class*='empty'], [class*='quickstart'], [class*='starter'], [class*='greeting']"),
            buttons: all("button"),
            inputs: all("input, textarea"),
            headings: all("h1, h2, h3"),
            firstParagraphs: all("p"),
            anyAlerts: all("[role='alert']"),
        };
    });

    await writeFile(join(EVIDENCE_DIR, `${label}.json`), JSON.stringify({ ...shape, consoleErrors }, null, 2));
    await ctx.close();
    return { label, shotPath, shape, consoleErrors };
}

const out = [];
out.push(await capture("01_fresh_no_config", {}));
out.push(await capture("02_with_default_profile_and_native", {
    seedLocalStorage: {
        "pulseplay:active-ai-profile": "default",
        "pulseplay:bi-surface-mode": "native",
        "pulseplay:pack-selection": JSON.stringify({ pack: "cpg-fmcg", subVertical: "supply-chain" }),
    },
}));

await browser.close();

const summary = {
    fresh: {
        screenshot: out[0].shotPath,
        title: out[0].shape.title,
        activeSurface: out[0].shape.activeSurface,
        headings: out[0].shape.headings.map(h => h.text),
        buttonCount: out[0].shape.buttons.length,
        inputCount: out[0].shape.inputs.length,
        emptyStateCandidates: out[0].shape.emptyStateCandidates.length,
        anyAlerts: out[0].shape.anyAlerts.length,
        consoleErrors: out[0].consoleErrors.length,
    },
    seeded: {
        screenshot: out[1].shotPath,
        title: out[1].shape.title,
        activeSurface: out[1].shape.activeSurface,
        headings: out[1].shape.headings.map(h => h.text),
        buttonCount: out[1].shape.buttons.length,
        inputCount: out[1].shape.inputs.length,
        emptyStateCandidates: out[1].shape.emptyStateCandidates.length,
        anyAlerts: out[1].shape.anyAlerts.length,
        consoleErrors: out[1].consoleErrors.length,
    },
};
console.log(JSON.stringify(summary, null, 2));
