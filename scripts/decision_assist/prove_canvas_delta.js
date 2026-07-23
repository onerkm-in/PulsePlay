/**
 * prove_canvas_delta.js — engineering proof that the DatabricksCanvasStore adapter
 * runs against REAL Delta (v3.2 §11, live-Delta step).
 *
 * The approved org schema (uc_dev_snt_supplychain_01) is unreachable on this free
 * workspace, so this proves the adapter's parameterized SQL (CREATE, MERGE dedupe,
 * UPDATE-with-version predicate, SELECT read-back) against a DEV stand-in schema on
 * the reachable warehouse. It validates the adapter's approach, not the canonical
 * serving data. Run: node scripts/decision_assist/prove_canvas_delta.js
 *
 * Uses the genie profile's host/token/warehouse from proxy/config.json. Creates a
 * dev canvas table, exercises the adapter, prints results. Non-destructive to any
 * existing data (its own table only).
 */
'use strict';

// Dev proof only: this box's Databricks TLS chain isn't in Node's default store.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
// Point the adapter's tables at a reachable dev schema (NOT the org schema).
process.env.AI_CANVAS_SCHEMA = process.env.AI_CANVAS_SCHEMA || 'main.action_insights';

const path = require('path');
const cfg = require(path.join(__dirname, '..', '..', 'proxy', 'config.json'));
const { executeSqlStatement } = require(path.join(__dirname, '..', '..', 'proxy', 'lib', 'sqlExecutor'));
const { DatabricksCanvasStore, SECTION_TABLE } = require(path.join(__dirname, '..', '..', 'proxy', 'lib', 'canvasStoreDatabricks'));

const g = cfg.profiles.genie;
const profile = { host: g.host.replace(/\/+$/, ''), token: g.token, warehouseId: g.warehouseId };

async function databricksRequest(prof, method, apiPath, body) {
    const res = await fetch(prof.host + apiPath, {
        method,
        headers: { Authorization: `Bearer ${prof.token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
}

async function runSql(sql, params) {
    return executeSqlStatement({ profile, sql, params, databricksRequest });
}

async function main() {
    const OWNER = 'idp|t|proof-user';
    console.log(`[proof] target dev table: ${SECTION_TABLE}`);

    // 1. DDL — create the dev canvas table (the adapter itself never runs DDL; the
    //    proof runs the prepared statement to stand up the dev stand-in).
    const store = new DatabricksCanvasStore({ profile, databricksRequest, executeSqlStatement, enabled: true });
    const ddl = store.prepareDdl().split(';')[0] + ';'; // first CREATE (sections)
    await runSql(ddl);
    console.log('[proof] DDL applied (CREATE TABLE IF NOT EXISTS).');

    const proposed = {
        type: 'decision_prompt', title: 'Live-Delta proof section',
        source: { surface: 'action-insights', prompt_id: `pp_proof_${Date.now()}` },
        provenance: { data_as_of: '2026-07-23', classification: 'internal' },
    };

    // 2. create (MERGE insert) → read-back
    const created = await store.createSection(OWNER, proposed);
    console.log('[proof] created section_id:', created.section.section_id, 'version:', created.section.version);

    // 3. create the SAME source again → dedupe (MERGE no-match skips; read-back same row)
    const again = await store.createSection(OWNER, proposed);
    const deduped = again.section.section_id === created.section.section_id;
    console.log('[proof] dedupe returns same section_id:', deduped);

    // 4. update with the version predicate (optimistic concurrency)
    const patchBody = { ...created.section, state: { ...created.section.state, note: 'proof note' } };
    const upd = await store.updateSection(OWNER, created.section.section_id, patchBody, { expectedVersion: 0 });
    console.log('[proof] update rowsAffected (version predicate):', upd.rowsReturned ?? upd.totalRowCount ?? 'n/a');

    // 5. read back via list
    const list = await store.listSections(OWNER);
    console.log('[proof] listSections returned rows:', list.length);
    const found = list.find((s) => s.section_id === created.section.section_id);
    console.log('[proof] read-back version now:', found ? found.version : 'MISSING', 'note:', found?.state?.note);

    // 6. cleanup this proof row (leave the table)
    await runSql(`DELETE FROM ${SECTION_TABLE} WHERE owner_actor_id = :owner`, { owner: OWNER });
    console.log('[proof] cleaned up proof rows.');

    const pass = created.section.section_id && deduped && found && found.version === 1;
    console.log(pass ? '\n[proof] PASS — adapter verified against real Delta.' : '\n[proof] FAIL — see output above.');
    process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error('[proof] ERROR:', e.message); process.exit(1); });
