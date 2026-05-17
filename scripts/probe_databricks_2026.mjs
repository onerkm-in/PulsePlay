// scripts/probe_databricks_2026.mjs
//
// Read-only discovery probe — GET against candidate Databricks REST endpoints to
// see what's available on the user's workspace. No POST/PATCH/DELETE.
// Output: a table per endpoint family with status + truncated body summary.
//
// Usage: node scripts/probe_databricks_2026.mjs [profile-name]
//        Defaults to "default" profile from proxy/config.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const configPath = path.join(repoRoot, "proxy", "config.json");

const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
const profileName = process.argv[2] || "default";
const profile = cfg.profiles?.[profileName];
if (!profile) {
    console.error(`profile "${profileName}" not found in ${configPath}`);
    process.exit(1);
}
const host = (profile.databricksHost || profile.host || "").replace(/\/+$/, "");
const token = profile.databricksToken || profile.token;
const spaceId = profile.spaceId || profile.genieSpaceId;
const warehouseId = profile.warehouseId || profile.warehouse_id;

if (!host || !token) {
    console.error("profile missing host or token");
    process.exit(1);
}
console.error(`host: ${host}`);
console.error(`spaceId: ${spaceId ?? "(none)"}`);
console.error(`warehouseId: ${warehouseId ?? "(none)"}`);
console.error("");

const probes = [
    // --- Genie family (already integrated) ---
    { family: "Genie", path: `/api/2.0/genie/spaces/${spaceId}`, label: "space metadata (baseline)" },
    { family: "Genie", path: `/api/2.0/genie/spaces`, label: "spaces list" },
    { family: "Genie", path: `/api/2.0/preview/genie/spaces`, label: "preview spaces list" },
    { family: "Genie", path: `/api/2.0/genie/spaces/${spaceId}/conversations`, label: "conversations list" },

    // --- AI/BI Dashboards (new product, 2024+) ---
    { family: "Dashboards", path: `/api/2.0/lakeview/dashboards`, label: "lakeview dashboards" },
    { family: "Dashboards", path: `/api/2.0/preview/dashboards`, label: "preview dashboards" },
    { family: "Dashboards", path: `/api/2.0/dashboards`, label: "legacy dashboards" },
    { family: "Dashboards", path: `/api/2.0/preview/sql/dashboards`, label: "legacy SQL dashboards (preview)" },

    // --- Mosaic AI Agent Framework ---
    { family: "Agents", path: `/api/2.0/serving-endpoints`, label: "serving endpoints list" },
    { family: "Agents", path: `/api/2.0/agents`, label: "agents list" },
    { family: "Agents", path: `/api/2.0/preview/agents`, label: "preview agents" },

    // --- Vector Search ---
    { family: "VectorSearch", path: `/api/2.0/vector-search/endpoints`, label: "vector search endpoints" },
    { family: "VectorSearch", path: `/api/2.0/preview/vector-search/endpoints`, label: "preview vector search" },

    // --- Unity Catalog functions ---
    { family: "UC-Functions", path: `/api/2.1/unity-catalog/functions`, label: "UC functions list" },
    { family: "UC-Functions", path: `/api/2.0/preview/functions`, label: "preview functions" },

    // --- Lakeflow / Jobs ---
    { family: "Lakeflow", path: `/api/2.2/lakeflow/jobs`, label: "lakeflow jobs (new)" },
    { family: "Lakeflow", path: `/api/2.1/jobs/list`, label: "jobs list (current)" },

    // --- Databricks Apps ---
    { family: "Apps", path: `/api/2.0/apps`, label: "apps list" },
    { family: "Apps", path: `/api/2.0/preview/apps`, label: "preview apps" },

    // --- Databricks Assistant (the IDE one) ---
    { family: "Assistant", path: `/api/2.0/assistant/v1`, label: "assistant root" },
    { family: "Assistant", path: `/api/2.0/preview/assistant`, label: "preview assistant" },

    // --- MLflow Deployments / agent endpoints ---
    { family: "MLflow", path: `/api/2.0/mlflow/runs/search`, label: "mlflow runs (POST in real life; expect method-not-allowed if path exists)" },
    { family: "MLflow", path: `/api/2.0/preview/mlflow/deployments`, label: "mlflow deployments" },

    // --- AI Functions (SQL ai_query) — typically warehouse statement, not REST ---
    { family: "SQLStatement", path: `/api/2.0/sql/statements/`, label: "sql statements (GET on root)" },
];

const headers = {
    Authorization: `Bearer ${token}`,
    "User-Agent": "PulsePlay-Probe/2026-05-17",
};

async function probe(p) {
    const url = `${host}${p.path}`;
    const start = Date.now();
    try {
        const res = await fetch(url, { method: "GET", headers });
        const elapsed = Date.now() - start;
        let bodyTail = "";
        try {
            const text = await res.text();
            bodyTail = text.length > 200 ? text.slice(0, 200) + "…" : text;
        } catch { /* ignore */ }
        return {
            family: p.family,
            label: p.label,
            path: p.path,
            status: res.status,
            ms: elapsed,
            bodyTail,
        };
    } catch (err) {
        return {
            family: p.family,
            label: p.label,
            path: p.path,
            status: "ERR",
            ms: Date.now() - start,
            bodyTail: String(err.message || err).slice(0, 200),
        };
    }
}

const results = [];
// Sequential to avoid rate-limit pile-up.
for (const p of probes) {
    const r = await probe(p);
    results.push(r);
    const statusLabel = typeof r.status === "number"
        ? (r.status === 200 ? "✓ 200" : r.status === 404 ? "✗ 404" : `· ${r.status}`)
        : `? ${r.status}`;
    console.log(`${statusLabel.padEnd(8)} ${r.ms.toString().padStart(5)}ms  ${p.family.padEnd(13)} ${p.path}`);
}

console.log("");
console.log("=== Summary ===");
const byStatus = {};
for (const r of results) {
    const k = typeof r.status === "number" ? r.status : "ERR";
    byStatus[k] = (byStatus[k] ?? 0) + 1;
}
console.log(JSON.stringify(byStatus, null, 2));

// Print interesting 200s with body tails
const interesting = results.filter(r => r.status === 200);
if (interesting.length > 0) {
    console.log("");
    console.log("=== 200 bodies (first 200 chars each) ===");
    for (const r of interesting) {
        console.log(`\n[${r.family}] ${r.path}`);
        console.log(`  ${r.bodyTail}`);
    }
}
