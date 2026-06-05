#!/usr/bin/env node
// Pre-deploy guard. Scans the deploy config (proxy/app.yaml for Databricks Apps,
// and proxy/config.json if present) for unfilled placeholder values and exits
// non-zero if any remain. Without this, deploying app.yaml as-is (e.g. a
// GENIE_SPACE_ID still set to "ENTER_YOUR_..._HERE") starts the app fine but
// every call to that space fails SILENTLY at runtime — a 30-minute mystery.
//
//   node scripts/validate-deploy-config.mjs
//
// Wire this into the CD workflow BEFORE the deploy step (NOT the unit-test CI —
// the committed app.yaml legitimately ships placeholders as a template).
// config.example.json is intentionally skipped (it IS the placeholder template).
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PROXY_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

// Patterns that mark an unfilled value. Case-insensitive. Deliberately specific
// so real values (GUIDs, hostnames, endpoint names) are never false-flagged.
const PLACEHOLDER_PATTERNS = [
    /ENTER_[A-Z0-9_]*HERE/i,
    /ENTER_YOUR_/i,
    /ENTER_WAREHOUSE_ID/i,
    /\bREPLACE_ME\b/i,
    /\bYOUR_ORG_GUID\b/i,
    /\bYOUR_[A-Z0-9_]+_HERE\b/i,
    /<ENTER[^>]*>/i,
    /<your-[a-z0-9-]+>/i,
    /xxxxxxxx-xxxx/i,
];

const TARGETS = [
    { path: join(PROXY_DIR, "app.yaml"), required: false },
    { path: join(PROXY_DIR, "config.json"), required: false },
];

function findPlaceholders(text) {
    const hits = [];
    text.split(/\r?\n/).forEach((line, i) => {
        for (const re of PLACEHOLDER_PATTERNS) {
            const m = line.match(re);
            if (m) { hits.push({ line: i + 1, value: m[0], context: line.trim().slice(0, 100) }); break; }
        }
    });
    return hits;
}

let totalHits = 0;
let scanned = 0;
for (const t of TARGETS) {
    if (!existsSync(t.path)) {
        if (t.required) { console.error(`FAIL  required config missing: ${t.path}`); totalHits++; }
        continue;
    }
    scanned++;
    const text = await readFile(t.path, "utf8");
    const hits = findPlaceholders(text);
    if (hits.length === 0) {
        console.log(`OK    ${t.path.replace(PROXY_DIR, ".")} — no placeholders`);
    } else {
        totalHits += hits.length;
        console.error(`FAIL  ${t.path.replace(PROXY_DIR, ".")} — ${hits.length} unfilled placeholder(s):`);
        for (const h of hits) console.error(`        line ${h.line}: ${h.value}   (${h.context})`);
    }
}

if (scanned === 0) {
    console.log("No deploy config found (app.yaml / config.json) — nothing to validate. (config.example.json is skipped on purpose.)");
}
if (totalHits > 0) {
    console.error(`\n${totalHits} placeholder(s) remain — fill them before deploying, or the app will start but fail silently at runtime.`);
    process.exit(1);
}
console.log("\nDeploy config clean — no unfilled placeholders.");
process.exit(0);
