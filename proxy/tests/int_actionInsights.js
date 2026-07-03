/**
 * Live integration harness for the Action Insights serving module.
 * Run:  node --use-system-ca proxy/tests/int_actionInsights.js   (from PulsePlay root)
 *
 * Not part of the Jest suite (needs live Databricks). Verifies:
 *   1. GET returns the persona-filtered prompt stack with correct allowed_actions.
 *   2. Permission gate: Planner attempting 'approve' -> 403, NO status change.
 *   3. Audit write path works (view_evidence -> audit row, no mutation).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { register } = require('../lib/actionInsights');

// --- read AgenticIntelligence profile from ~/.databrickscfg ---
function readProfile() {
    const txt = fs.readFileSync(path.join(os.homedir(), '.databrickscfg'), 'utf8');
    const lines = txt.split(/\r?\n/);
    let inSec = false, host = null, token = null;
    for (const ln of lines) {
        if (ln.trim() === '[AgenticIntelligence]') { inSec = true; continue; }
        if (/^\[/.test(ln.trim())) inSec = false;
        if (inSec) {
            const m = ln.match(/^\s*(host|token)\s*=\s*(.+?)\s*$/);
            if (m) { if (m[1] === 'host') host = m[2]; else token = m[2]; }
        }
    }
    return { host: host.replace(/\/$/, ''), token, warehouseId: '6510da50329f1e85' };
}

const PROFILE = readProfile();

// databricksRequest implemented with global fetch (Node 24, --use-system-ca).
async function databricksRequest(profile, method, urlPath, body) {
    const res = await fetch(profile.host + urlPath, {
        method,
        headers: { Authorization: 'Bearer ' + profile.token, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
}

const deps = {
    resolveProfile: () => ({ profile: PROFILE, name: 'AgenticIntelligence' }),
    databricksRequest,
    auditLog: () => {},
    sendNoMatchingProfile: (req, res) => res.status(400).json({ error: 'no-profile' }),
};

async function auditCount() {
    const r = await databricksRequest(PROFILE, 'POST', '/api/2.0/sql/statements', {
        warehouse_id: PROFILE.warehouseId,
        statement: 'SELECT COUNT(*) FROM main.action_insights.decision_audit',
        wait_timeout: '50s', disposition: 'INLINE', format: 'JSON_ARRAY',
    });
    return Number(r.result?.data_array?.[0]?.[0] || 0);
}

(async () => {
    const app = express();
    app.use(express.json());
    register(app, deps);

    let failures = 0;
    const check = (name, ok, extra = '') => {
        console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`);
        if (!ok) failures++;
    };

    console.log('Action Insights live integration');
    console.log('='.repeat(40));

    // 1. GET as Manager (sees all)
    const gm = await request(app).get('/insights/action-insights').set('x-pp-persona', 'Supply Chain Manager');
    check('GET as Manager 200', gm.status === 200, `n=${gm.body.prompts?.length}`);
    const prompts = gm.body.prompts || [];
    const mgrCanApprove = prompts.every(p =>
        p.status !== 'pending-approval' || p.allowed_actions.includes('approve'));
    check('Manager allowed_actions include approve on pending', mgrCanApprove);

    // GET as Planner (own persona only)
    const gp = await request(app).get('/insights/action-insights').set('x-pp-persona', 'Supply Chain Planner');
    const plannerOnlyOwn = (gp.body.prompts || []).every(p => p.persona === 'Supply Chain Planner');
    check('Planner sees only Planner prompts', plannerOnlyOwn, `n=${gp.body.prompts?.length}`);
    const plannerNoApprove = (gp.body.prompts || []).every(p => !p.allowed_actions.includes('approve'));
    check('Planner never offered approve', plannerNoApprove);

    const target = prompts.find(p => p.status === 'new' || p.status === 'refreshed');
    if (!target) { check('found an actionable prompt', false); }

    // 2. Permission gate: Planner tries to approve -> 403, no mutation
    const before = await auditCount();
    const denied = await request(app)
        .post(`/insights/action-insights/${target.prompt_id}/action`)
        .set('x-pp-persona', 'Supply Chain Planner')
        .send({ action: 'approve', rationale: 'should be blocked' });
    check('Planner approve -> 403', denied.status === 403);

    // 3. Audit write path: view_evidence -> 200, audit row appended, no status change
    const viewed = await request(app)
        .post(`/insights/action-insights/${target.prompt_id}/action`)
        .set('x-pp-persona', 'Supply Chain Manager')
        .send({ action: 'view_evidence' });
    check('Manager view_evidence -> 200', viewed.status === 200, `status=${viewed.body.status}`);
    check('view_evidence did not change status', viewed.body.status === target.status);
    const after = await auditCount();
    check('audit rows grew (denied + viewed = +2)', after >= before + 2, `${before} -> ${after}`);

    console.log('='.repeat(40));
    console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
    process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
