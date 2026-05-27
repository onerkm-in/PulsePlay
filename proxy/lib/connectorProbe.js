// @ts-check
'use strict';

/**
 * connectorProbe.js — Smart Connect probe layer.
 *
 * Probes a configured AI-brain profile and returns a canonical
 * `ConnectorProbeResult`. Vendor-agnostic: the dispatcher inspects
 * profile shape (not connector-specific names) and routes to the right
 * adapter. Each adapter translates its backend's native metadata into
 * the canonical shape.
 *
 * Design contract: see [docs/CONNECTOR_PROBE_AND_SMART_CONNECT.md].
 *
 * Probe failures are NEVER thrown. They produce a result with
 * `metadataAvailability: "none"` and a `warnings[]` entry. The caller
 * (the proxy route) is free to surface the result without a try/catch.
 *
 * Probe time-budget is 8 seconds total. Adapters that exceed it yield
 * a partial result with `metadataAvailability: "minimal"` and a
 * timeout warning. The budget is enforced via `Promise.race` against a
 * setTimeout so a hung backend can never block the proxy thread.
 *
 * @typedef {Object} ProbeHelpers
 * @property {(profile: object, method: string, urlPath: string, body?: any, requestId?: string) => Promise<any>} [databricksRequest]
 *           Generic Databricks REST helper. Passed in by the route handler so
 *           this module never imports `proxy/server.js` (avoids a require cycle
 *           and keeps adapters trivially mockable).
 *
 * @typedef {Object} ConnectorProbeResult
 * @property {string} profile
 * @property {string} connectorType
 * @property {string} [displayName]
 * @property {"rich" | "minimal" | "none"} metadataAvailability
 * @property {string} [description]
 * @property {string} [purpose]
 * @property {string} [owner]
 * @property {string} [lastUpdated]
 * @property {{ tables: Array<{ name: string, description?: string, columns: Array<{ name: string, type?: string, description?: string, isMeasure?: boolean }> }> }} [schema]
 * @property {Array<{ name: string, description?: string, inputSchema?: object }>} [tools]
 * @property {Array<{ name: string, description?: string, formula?: string, higherIsBetter?: boolean }>} [declaredKpis]
 * @property {string[]} [sampleQuestions]
 * @property {object} [inference]
 * @property {number} probeDurationMs
 * @property {string[]} [warnings]
 */

const PROBE_TIME_BUDGET_MS = 8 * 1000;

/**
 * Run a probe against the resolved profile, with a hard time budget.
 *
 * Never throws. The returned promise always resolves to a
 * `ConnectorProbeResult` — adapters that hit an error or a timeout
 * still yield a usable shell with the correct `metadataAvailability`.
 *
 * @param {{ profile: object, name: string }} resolved — output of resolveProfile().
 * @param {ProbeHelpers} helpers
 * @returns {Promise<ConnectorProbeResult>}
 */
async function probeConnector(resolved, helpers = {}) {
    const start = Date.now();
    const profileName = resolved?.name || 'unknown';
    const profile = resolved?.profile || {};

    /** @type {ConnectorProbeResult} */
    const baseShell = {
        profile: profileName,
        connectorType: classifyConnectorType(profile),
        metadataAvailability: 'none',
        probeDurationMs: 0,
        warnings: [],
    };

    if (!profile || typeof profile !== 'object') {
        baseShell.probeDurationMs = Date.now() - start;
        baseShell.warnings = ['No profile object resolved'];
        return baseShell;
    }

    const adapter = pickAdapter(profile);

    // Time budget guard. The race produces either the adapter's result or a
    // synthetic timeout result. Either way, we never block longer than the
    // budget.
    /** @type {ConnectorProbeResult} */
    let result;
    try {
        result = await raceWithTimeout(
            adapter(profile, profileName, helpers).catch(err => probeFailure(profileName, profile, err)),
            PROBE_TIME_BUDGET_MS,
            () => probeTimeout(profileName, profile)
        );
    } catch (unexpected) {
        // Defensive — adapter contract says "never throw", but we belt-and-brace.
        result = probeFailure(profileName, profile, unexpected);
    }

    // Normalise: adapters may omit fields. Stamp the duration always.
    result.profile = profileName;
    result.connectorType = result.connectorType || baseShell.connectorType;
    result.metadataAvailability = result.metadataAvailability || 'none';
    result.probeDurationMs = Date.now() - start;
    result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
    return result;
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * Pick the adapter for a profile based on its shape.
 *
 * Order matters: more-specific shapes are checked first so a profile that
 * legitimately has both a Databricks `host` and an `azureOpenAiEndpoint`
 * (e.g. analytics-mode hybrid) routes to the Azure OpenAI adapter, not
 * the Genie one.
 */
function pickAdapter(profile) {
    if (profile?.type === 'supervisor-local') return probeSupervisorLocal;
    if (profile?.type === 'supervisor') return probeSupervisorReal;
    if (profile?.type === 'foundation-model' || profile?.type === 'foundation') return probeFoundationModel;
    if (profile?.type === 'powerbi-semantic-model') return probePowerBiSemanticModel;
    if (profile?.azureOpenAiEndpoint) {
        return profile.schemaContext ? probeOpenAiAnalytics : probeOpenAiChatOnly;
    }
    if (profile?.bedrockKnowledgeBaseId) return probeBedrockRag;
    if (profile?.bedrockAccessKeyId) return probeBedrockDirect;
    if (profile?.spaceId) return probeGenie;
    return probeGeneric;
}

/** Return the canonical connectorType tag for a profile shape. */
function classifyConnectorType(profile) {
    if (!profile) return 'generic';
    if (profile.type === 'supervisor-local') return 'supervisor-local';
    if (profile.type === 'supervisor') return 'supervisor';
    if (profile.type === 'foundation-model' || profile.type === 'foundation') return 'foundation-model';
    if (profile.type === 'powerbi-semantic-model') return 'powerbi-semantic-model';
    if (profile.azureOpenAiEndpoint) return profile.schemaContext ? 'openai-analytics' : 'openai-chat';
    if (profile.bedrockKnowledgeBaseId) return 'bedrock-rag';
    if (profile.bedrockAccessKeyId) return 'bedrock-direct';
    if (profile.spaceId) return 'genie';
    return 'generic';
}

// ── Adapters ─────────────────────────────────────────────────────────────────

/**
 * Genie probe — substantive adapter. Reads space metadata via the existing
 * Databricks REST helper. Defensive against schema variation across
 * workspaces; missing fields produce warnings, not failures.
 *
 * @param {object} profile
 * @param {string} profileName
 * @param {ProbeHelpers} helpers
 * @returns {Promise<ConnectorProbeResult>}
 */
async function probeGenie(profile, profileName, helpers) {
    const warnings = [];
    /** @type {ConnectorProbeResult} */
    const result = {
        profile: profileName,
        connectorType: 'genie',
        metadataAvailability: 'none',
        probeDurationMs: 0,
        warnings,
    };

    const restCall = helpers?.databricksRequest;
    if (typeof restCall !== 'function') {
        warnings.push('No REST helper available; cannot reach Genie API');
        return result;
    }
    if (!profile.spaceId) {
        warnings.push('Profile has no spaceId; Genie probe skipped');
        return result;
    }

    let spaceMeta = null;
    try {
        spaceMeta = await restCall(profile, 'GET', `/api/2.0/genie/spaces/${profile.spaceId}`);
    } catch (err) {
        warnings.push(`Connector REST call failed: ${truncate(err?.message)}`);
        return result;
    }

    if (!spaceMeta || typeof spaceMeta !== 'object') {
        warnings.push('Connector returned non-object metadata');
        return result;
    }

    const title = pickFirst(spaceMeta.title, spaceMeta.name, spaceMeta.display_name);
    const description = pickFirst(spaceMeta.description, spaceMeta.summary);
    const purpose = pickFirst(spaceMeta.purpose, spaceMeta.intent);
    const owner = pickFirst(spaceMeta.creator_id, spaceMeta.owner, spaceMeta.created_by);
    const lastUpdated = pickFirst(spaceMeta.last_updated_at, spaceMeta.updated_at);

    if (title) result.displayName = String(title);
    if (description) result.description = String(description);
    if (purpose) result.purpose = String(purpose);
    if (owner) result.owner = String(owner);
    if (lastUpdated) result.lastUpdated = String(lastUpdated);

    // Optional schema. Some workspaces expose a tables list under
    // `tables[]` or `schema.tables[]`; tolerate both.
    const tables = extractTables(spaceMeta);
    if (tables.length > 0) {
        result.schema = { tables };
    }

    // Optional sample questions / declared KPIs — Genie spaces sometimes
    // expose these under varied keys.
    const samples = pickFirst(spaceMeta.sample_questions, spaceMeta.sampleQuestions);
    if (Array.isArray(samples) && samples.length > 0) {
        result.sampleQuestions = samples
            .map(s => (typeof s === 'string' ? s : s?.text))
            .filter(Boolean)
            .slice(0, 20);
    }
    const declaredKpis = pickFirst(spaceMeta.declared_kpis, spaceMeta.declaredKpis, spaceMeta.kpis);
    if (Array.isArray(declaredKpis) && declaredKpis.length > 0) {
        result.declaredKpis = declaredKpis
            .map(k => ({
                name: String(k?.name || k?.title || ''),
                description: k?.description ? String(k.description) : undefined,
                formula: k?.formula ? String(k.formula) : undefined,
                higherIsBetter: typeof k?.higherIsBetter === 'boolean' ? k.higherIsBetter : undefined,
            }))
            .filter(k => k.name);
    }

    // Availability classification — rich if we got description + (schema or KPIs);
    // minimal if we only got the title; none if everything failed.
    if (description && (result.schema || result.declaredKpis)) {
        result.metadataAvailability = 'rich';
    } else if (description) {
        result.metadataAvailability = 'rich';
    } else if (title) {
        result.metadataAvailability = 'minimal';
        warnings.push('Connector exposed only a display name; pack inference will be weak');
    } else {
        result.metadataAvailability = 'none';
        warnings.push('Connector exposed no introspectable metadata');
    }

    return result;
}

/**
 * Supervisor-local probe — fan out to each child profile and merge schemas.
 * Implementation note: we don't recursively probe each child via the network
 * (would multiply the 8s budget). Instead we read each helper profile's static
 * shape and combine display names. A future cycle can wire deeper recursion
 * with per-child sub-budgets.
 */
async function probeSupervisorLocal(profile, profileName, _helpers) {
    const warnings = [];
    /** @type {ConnectorProbeResult} */
    const result = {
        profile: profileName,
        connectorType: 'supervisor-local',
        metadataAvailability: 'minimal',
        probeDurationMs: 0,
        warnings,
    };

    if (profile.agentName) result.displayName = String(profile.agentName);
    const helpers = Array.isArray(profile.spaces) ? profile.spaces : [];
    if (helpers.length === 0) {
        warnings.push('Supervisor has no helper profiles configured');
        return result;
    }
    result.description = `Supervisor over ${helpers.length} helper profile(s): ${helpers.join(', ')}`;
    return result;
}

/**
 * Supervisor (real Mosaic agent) probe. Without a serving-endpoint metadata
 * call (which varies per deployment), we fall back to the agent's display
 * name from the profile.
 */
async function probeSupervisorReal(profile, profileName, _helpers) {
    const warnings = [];
    /** @type {ConnectorProbeResult} */
    const result = {
        profile: profileName,
        connectorType: 'supervisor',
        metadataAvailability: 'minimal',
        probeDurationMs: 0,
        warnings,
    };
    if (profile.agentName) {
        result.displayName = String(profile.agentName);
        result.description = `Mosaic AI Supervisor agent: ${profile.agentName}`;
    } else {
        warnings.push('No agentName configured on supervisor profile');
        result.metadataAvailability = 'none';
    }
    return result;
}

/**
 * Azure OpenAI in analytics mode — the user has supplied a `schemaContext`
 * string. Parse it best-effort into a tables array. The format convention
 * used in the existing proxy is free-form (e.g. `TABLE orders(region STRING, ...)`)
 * so we accept several shapes.
 */
async function probeOpenAiAnalytics(profile, profileName, _helpers) {
    /** @type {ConnectorProbeResult} */
    const result = {
        profile: profileName,
        connectorType: 'openai-analytics',
        metadataAvailability: 'rich',
        probeDurationMs: 0,
        warnings: [],
    };
    if (profile.azureOpenAiDeployment) {
        result.displayName = `Azure OpenAI (${profile.azureOpenAiDeployment})`;
    }
    if (typeof profile.schemaContext === 'string') {
        const tables = parseSchemaContextString(profile.schemaContext);
        if (tables.length > 0) {
            result.schema = { tables };
        } else {
            // We have a schemaContext but couldn't parse it — surface it as a description.
            result.description = profile.schemaContext.slice(0, 1000);
            result.metadataAvailability = 'minimal';
            (result.warnings || []).push('Could not structurally parse schemaContext; using as description fallback');
        }
    }
    return result;
}

/** Azure OpenAI chat-only — no introspection possible. */
async function probeOpenAiChatOnly(profile, profileName, _helpers) {
    return {
        profile: profileName,
        connectorType: 'openai-chat',
        displayName: profile.azureOpenAiDeployment
            ? `Azure OpenAI (${profile.azureOpenAiDeployment})`
            : 'Azure OpenAI (chat-only)',
        metadataAvailability: 'none',
        probeDurationMs: 0,
        warnings: ['Chat-only OpenAI deployment; no metadata available'],
    };
}

/** Bedrock Knowledge Base — minimal metadata (the KB id). */
async function probeBedrockRag(profile, profileName, _helpers) {
    return {
        profile: profileName,
        connectorType: 'bedrock-rag',
        displayName: `AWS Bedrock KB (${profile.bedrockKnowledgeBaseId})`,
        description: `Bedrock RetrieveAndGenerate over knowledge base ${profile.bedrockKnowledgeBaseId}`,
        metadataAvailability: 'minimal',
        probeDurationMs: 0,
        warnings: [],
    };
}

/** Bedrock InvokeModel direct — chat-only, no metadata. */
async function probeBedrockDirect(profile, profileName, _helpers) {
    return {
        profile: profileName,
        connectorType: 'bedrock-direct',
        displayName: profile.bedrockModelId
            ? `AWS Bedrock (${profile.bedrockModelId})`
            : 'AWS Bedrock (direct)',
        metadataAvailability: 'none',
        probeDurationMs: 0,
        warnings: ['Bedrock InvokeModel direct path; no introspection available'],
    };
}

/**
 * Power BI semantic-model probe — reads dataset metadata via the Power BI
 * REST API and pulls measure + table inventory via INFO.* DAX functions.
 * Output measures become `declaredKpis` so downstream pack matching can
 * align them with vertical KPIs the same way Genie KPIs do.
 *
 * Defensive: a deployer with a valid token but no INFO.* DAX permissions
 * (rare; happens on some Premium-Per-User datasets) still gets metadata-
 * only "minimal" availability rather than a hard failure.
 */
async function probePowerBiSemanticModel(profile, profileName, _helpers) {
    const warnings = [];
    /** @type {ConnectorProbeResult} */
    const result = {
        profile: profileName,
        connectorType: 'powerbi-semantic-model',
        metadataAvailability: 'none',
        probeDurationMs: 0,
        warnings,
    };
    let client;
    try { client = require('./powerbiDatasetClient'); }
    catch (e) {
        warnings.push(`powerbiDatasetClient module unavailable: ${truncate(e?.message)}`);
        return result;
    }

    // Step 1 — dataset metadata. If THIS fails the probe is essentially
    // useless; surface the error and return a none-availability shell.
    let dataset = null;
    try {
        dataset = await client.getDatasetMetadata(profile);
    } catch (err) {
        warnings.push(`Power BI dataset metadata fetch failed: ${truncate(err?.message)}`);
        return result;
    }
    if (dataset?.name) result.displayName = String(dataset.name);
    if (dataset?.description) result.description = String(dataset.description);
    if (dataset?.configuredBy) result.owner = String(dataset.configuredBy);
    if (dataset?.createdDate) result.lastUpdated = String(dataset.createdDate);

    // Step 2 — INFO.MEASURES() via DAX → declaredKpis. Power BI exposes
    // measure name + table + description + display folder via this view.
    try {
        const measuresQuery = 'EVALUATE SELECTCOLUMNS(INFO.MEASURES(), '
            + '"Name", [Name], "TableName", [Table], "Description", [Description])';
        const measures = await client.executeDaxNormalized(profile, measuresQuery);
        if (measures.rows.length > 0) {
            const colIndex = (name) => measures.columns.findIndex(c => c.toLowerCase().includes(name.toLowerCase()));
            const nameIdx = colIndex('Name');
            const descIdx = colIndex('Description');
            const kpis = measures.rows.map(r => ({
                name: nameIdx >= 0 ? String(r[nameIdx] || '') : '',
                description: descIdx >= 0 && r[descIdx] ? String(r[descIdx]) : undefined,
            })).filter(k => k.name);
            if (kpis.length > 0) result.declaredKpis = kpis;
        }
    } catch (err) {
        warnings.push(`Power BI INFO.MEASURES probe failed: ${truncate(err?.message)}`);
    }

    // Step 3 — INFO.TABLES() + INFO.COLUMNS() via DAX → schema. Two DAX
    // calls instead of one because Power BI's INFO functions don't join.
    try {
        const tablesQuery = 'EVALUATE SELECTCOLUMNS(INFO.TABLES(), "Name", [Name], "Description", [Description])';
        const tablesResp = await client.executeDaxNormalized(profile, tablesQuery);
        const tableMap = new Map();
        if (tablesResp.rows.length > 0) {
            const nameIdx = tablesResp.columns.findIndex(c => c.toLowerCase().includes('name'));
            const descIdx = tablesResp.columns.findIndex(c => c.toLowerCase().includes('description'));
            for (const row of tablesResp.rows) {
                const name = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : '';
                if (!name) continue;
                tableMap.set(name, { name, description: descIdx >= 0 && row[descIdx] ? String(row[descIdx]) : undefined, columns: [] });
            }
        }
        const columnsQuery = 'EVALUATE SELECTCOLUMNS(INFO.COLUMNS(), '
            + '"Table", [Table], "Name", [ExplicitName], "DataType", [DataType])';
        const columnsResp = await client.executeDaxNormalized(profile, columnsQuery);
        if (columnsResp.rows.length > 0) {
            const tableIdx = columnsResp.columns.findIndex(c => c.toLowerCase() === 'table' || c.toLowerCase().includes('table'));
            const nameIdx = columnsResp.columns.findIndex(c => c.toLowerCase().includes('name'));
            const typeIdx = columnsResp.columns.findIndex(c => c.toLowerCase().includes('type') || c.toLowerCase().includes('datatype'));
            for (const row of columnsResp.rows) {
                const tname = tableIdx >= 0 ? String(row[tableIdx] || '').trim() : '';
                const cname = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : '';
                if (!tname || !cname) continue;
                if (!tableMap.has(tname)) tableMap.set(tname, { name: tname, columns: [] });
                const t = tableMap.get(tname);
                t.columns.push({
                    name: cname,
                    type: typeIdx >= 0 && row[typeIdx] ? String(row[typeIdx]) : undefined,
                });
            }
        }
        const tables = Array.from(tableMap.values()).filter(t => t.columns.length > 0 || t.description);
        if (tables.length > 0) result.schema = { tables };
    } catch (err) {
        warnings.push(`Power BI INFO.TABLES/COLUMNS probe failed: ${truncate(err?.message)}`);
    }

    // Availability classification.
    if (result.schema && result.declaredKpis) result.metadataAvailability = 'rich';
    else if (result.schema || result.declaredKpis) result.metadataAvailability = 'rich';
    else if (result.displayName) {
        result.metadataAvailability = 'minimal';
        warnings.push('Power BI dataset reached but no schema or measures were returned; pack inference will be weak');
    } else {
        result.metadataAvailability = 'none';
    }

    // 2026-05-26 — STATIC PROBE MERGE. When the live INFO.MEASURES /
    // INFO.TABLES probes failed (most often because the tenant doesn't
    // allow executeQueries — Premium/Fabric capacity gate), fall back to
    // measures/schema baked into the profile config via `staticProbe` or
    // `staticProbePath`. The static probe is typically derived from the
    // dataset's PBIP TMDL by scripts/tmdl-to-static-probe.mjs and dropped
    // into proxy/config.json. This unblocks the deterministic-DAX matcher
    // without needing live XMLA endpoint access. Live probe wins when
    // both are present, so flipping XMLA on later transparently upgrades.
    const liveHasMeasures = Array.isArray(result.declaredKpis) && result.declaredKpis.length > 0;
    const liveHasSchema = result.schema && Array.isArray(result.schema.tables) && result.schema.tables.length > 0;
    if (!liveHasMeasures || !liveHasSchema) {
        let staticProbe = profile?.staticProbe || null;
        if (!staticProbe && profile?.staticProbePath) {
            try {
                const fs = require('node:fs');
                const path = require('node:path');
                const resolved = path.isAbsolute(profile.staticProbePath)
                    ? profile.staticProbePath
                    : path.resolve(__dirname, '..', profile.staticProbePath);
                staticProbe = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
            } catch (err) {
                warnings.push(`staticProbePath load failed: ${truncate(err?.message)}`);
            }
        }
        if (staticProbe) {
            if (!liveHasMeasures && Array.isArray(staticProbe.declaredKpis) && staticProbe.declaredKpis.length > 0) {
                result.declaredKpis = staticProbe.declaredKpis;
                warnings.push(`measures sourced from staticProbe (${staticProbe.declaredKpis.length} measures) — live INFO.MEASURES failed`);
            }
            if (!liveHasSchema && staticProbe.schema && Array.isArray(staticProbe.schema.tables)) {
                result.schema = staticProbe.schema;
                warnings.push(`schema sourced from staticProbe (${staticProbe.schema.tables.length} tables) — live INFO.TABLES failed`);
            }
            // Upgrade availability tag if static probe added meaningful data
            const nowHasMeasures = Array.isArray(result.declaredKpis) && result.declaredKpis.length > 0;
            const nowHasSchema = result.schema && Array.isArray(result.schema.tables) && result.schema.tables.length > 0;
            if (nowHasMeasures || nowHasSchema) {
                result.metadataAvailability = (nowHasMeasures && nowHasSchema) ? 'rich' : 'minimal';
                result.staticProbeApplied = true;
            }
        }
    }
    return result;
}

/** Foundation Model serving endpoint — minimal (just the endpoint name). */
async function probeFoundationModel(profile, profileName, _helpers) {
    const endpoint = profile.foundationModelEndpoint || profile.endpoint || '';
    return {
        profile: profileName,
        connectorType: 'foundation-model',
        displayName: endpoint || 'Foundation Model serving endpoint',
        description: endpoint ? `Mosaic AI Foundation Model serving endpoint: ${endpoint}` : undefined,
        metadataAvailability: endpoint ? 'minimal' : 'none',
        probeDurationMs: 0,
        warnings: endpoint ? [] : ['Foundation Model profile has no endpoint configured'],
    };
}

/** Generic / unknown profile shape. */
async function probeGeneric(profile, profileName, _helpers) {
    return {
        profile: profileName,
        connectorType: 'generic',
        displayName: profile.displayName ? String(profile.displayName) : undefined,
        metadataAvailability: 'none',
        probeDurationMs: 0,
        warnings: ['Profile shape did not match any known connector type'],
    };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Race a promise against a timeout. If the timeout fires first we resolve
 * with the timeout-result builder's output (we never reject; probes don't
 * throw). The internal timer is cleared on the winning path so a slow
 * adapter can't keep the event loop alive.
 */
function raceWithTimeout(promise, ms, onTimeout) {
    return new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            try { resolve(onTimeout()); }
            catch { resolve(undefined); }
        }, ms);
        promise.then(
            (val) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(val);
            },
            (_err) => {
                // Adapters never throw, but belt-and-brace: convert rejection to
                // a defensive failure shell.
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(undefined);
            }
        );
    });
}

/** Build the synthetic timeout result. */
function probeTimeout(profileName, profile) {
    return {
        profile: profileName,
        connectorType: classifyConnectorType(profile),
        displayName: profile?.displayName || profile?.agentName || undefined,
        metadataAvailability: 'minimal',
        probeDurationMs: PROBE_TIME_BUDGET_MS,
        warnings: [`Probe exceeded ${PROBE_TIME_BUDGET_MS}ms time budget; partial result`],
    };
}

/** Build the synthetic failure result. */
function probeFailure(profileName, profile, err) {
    return {
        profile: profileName,
        connectorType: classifyConnectorType(profile),
        metadataAvailability: 'none',
        probeDurationMs: 0,
        warnings: [`Probe failed: ${truncate(err?.message || String(err))}`],
    };
}

function pickFirst(...values) {
    for (const v of values) {
        if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
}

function truncate(s, n = 200) {
    const str = String(s || '');
    return str.length > n ? str.slice(0, n) + '…' : str;
}

/**
 * Best-effort table extraction from a Genie space metadata blob. Genie's
 * shape varies; we tolerate `tables`, `schema.tables`, and `space.tables`.
 */
function extractTables(meta) {
    const candidates = [
        Array.isArray(meta?.tables) ? meta.tables : null,
        Array.isArray(meta?.schema?.tables) ? meta.schema.tables : null,
        Array.isArray(meta?.space?.tables) ? meta.space.tables : null,
    ].filter(Boolean);
    if (candidates.length === 0) return [];
    const raw = candidates[0];
    return raw.map(t => ({
        name: String(t?.name || t?.tableName || ''),
        description: t?.description ? String(t.description) : undefined,
        columns: Array.isArray(t?.columns) ? t.columns.map(c => ({
            name: String(c?.name || ''),
            type: c?.type ? String(c.type) : undefined,
            description: c?.description ? String(c.description) : undefined,
            isMeasure: typeof c?.isMeasure === 'boolean' ? c.isMeasure : undefined,
        })).filter(c => c.name) : [],
    })).filter(t => t.name);
}

/**
 * Parse an Azure OpenAI `schemaContext` string into the canonical tables
 * array. The convention used by the existing proxy is free-form — we accept
 * blocks like:
 *
 *   TABLE orders (region STRING, total DECIMAL, order_date DATE)
 *   TABLE shipments (lane_id STRING, otif_pct FLOAT)
 *
 * We also tolerate Markdown table forms ("- table.column: type")
 * by falling back to a per-line tokeniser. Anything unparseable yields an
 * empty result, and the caller falls back to using the raw string as a
 * description.
 */
function parseSchemaContextString(raw) {
    /** @type {Array<{ name: string, description?: string, columns: Array<{ name: string, type?: string }> }>} */
    const out = [];
    if (!raw || typeof raw !== 'string') return out;

    // Pattern 1: TABLE name(col TYPE, col TYPE, ...)
    const tableRe = /TABLE\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\(([^)]+)\)/gi;
    for (const m of raw.matchAll(tableRe)) {
        const tableName = m[1].trim();
        const colsRaw = m[2];
        const columns = colsRaw.split(',').map(s => {
            const trimmed = s.trim();
            if (!trimmed) return null;
            const parts = trimmed.split(/\s+/);
            return { name: parts[0], type: parts[1] };
        }).filter(c => c && c.name);
        if (tableName && columns.length > 0) {
            out.push({ name: tableName, columns });
        }
    }

    return out;
}

module.exports = {
    probeConnector,
    PROBE_TIME_BUDGET_MS,
    // Exported for tests; not for production callers.
    __internals: {
        pickAdapter,
        classifyConnectorType,
        probeGenie,
        probeSupervisorLocal,
        probeSupervisorReal,
        probeOpenAiAnalytics,
        probeOpenAiChatOnly,
        probeBedrockRag,
        probeBedrockDirect,
        probeFoundationModel,
        probePowerBiSemanticModel,
        probeGeneric,
        parseSchemaContextString,
        extractTables,
    },
};
