/**
 * canvasStoreDatabricks.js — production CanvasSection persistence adapter (code-complete,
 * live execution externally blocked).
 *
 * Mirrors the InMemoryCanvasStore interface using parameterized SQL (Statement
 * Execution API parameter markers, never string interpolation) over the approved
 * Delta tables in the org schema. This adapter:
 *   - NEVER executes DDL. `prepareDdl()` returns the CREATE statements for a reviewer
 *     to run under proper authorization (owner-approved, with rollback + retention).
 *   - is NOT auto-selected by the store factory on this workspace, because its tables
 *     live in `uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai`, which is unreachable
 *     here. Selecting it requires the approved profile + the reviewed DDL applied.
 *
 * Every method here would run against that estate; on this free workspace they are
 * classified EXTERNAL_RUNTIME_VALIDATION_BLOCKED and guarded so they cannot silently
 * touch the wrong data source.
 */
'use strict';

const { normalizeProposedSection, dedupeKey, computeContentHash } = require('./canvasSection');

const DEFAULT_SCHEMA = process.env.AI_CANVAS_SCHEMA
    || 'uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai';
const SECTION_TABLE = `${DEFAULT_SCHEMA}.tbl_pp_canvas_sections`;
const SNAPSHOT_TABLE = `${DEFAULT_SCHEMA}.tbl_pp_context_snapshots`;

class ExternalRuntimeBlockedError extends Error {
    constructor(op) {
        super(`Canvas Databricks adapter op "${op}" is EXTERNAL_RUNTIME_VALIDATION_BLOCKED: `
            + `the approved schema ${DEFAULT_SCHEMA} is not reachable on this workspace and DDL is not applied.`);
        this.name = 'ExternalRuntimeBlockedError';
        this.status = 503;
        this.code = 'EXTERNAL_RUNTIME_VALIDATION_BLOCKED';
    }
}

class DatabricksCanvasStore {
    /** @param {{ profile: object, databricksRequest: Function, executeSqlStatement: Function, enabled?: boolean }} deps */
    constructor(deps) {
        this._deps = deps || {};
        // A hard switch: without an explicit enable AND a profile, every op refuses
        // rather than guess at a data source.
        this._enabled = Boolean(deps && deps.enabled && deps.profile && deps.executeSqlStatement);
    }

    _guard(op) {
        if (!this._enabled) throw new ExternalRuntimeBlockedError(op);
    }

    async _param(sql, params) {
        const { profile, databricksRequest, executeSqlStatement } = this._deps;
        return executeSqlStatement({ profile, sql, params, databricksRequest });
    }

    async listSections(ownerActorId, { saveState } = {}) {
        this._guard('listSections');
        const where = ['owner_actor_id = :owner'];
        const params = { owner: ownerActorId };
        if (saveState === 'pinned') where.push("save_state IN ('pinned','pinned-and-bookmarked')");
        else if (saveState === 'bookmarked') where.push("save_state IN ('bookmarked','pinned-and-bookmarked')");
        else if (saveState === 'pinned-and-bookmarked') where.push("save_state = 'pinned-and-bookmarked'");
        const r = await this._param(
            `SELECT * FROM ${SECTION_TABLE} WHERE ${where.join(' AND ')} ORDER BY layout_order, created_at`, params);
        return (r.rows || []).map((row) => rowToSection(r.columns, row));
    }

    async getSection(ownerActorId, sectionId) {
        this._guard('getSection');
        const r = await this._param(
            `SELECT * FROM ${SECTION_TABLE} WHERE section_id = :id AND owner_actor_id = :owner`,
            { id: sectionId, owner: ownerActorId });
        if (!r.rows || !r.rows.length) return null;
        return rowToSection(r.columns, r.rows[0]);
    }

    async createSection(ownerActorId, proposed, { idempotencyKey } = {}) {
        this._guard('createSection');
        const body = normalizeProposedSection(proposed);
        const dk = dedupeKey(ownerActorId, body);
        // A conditional MERGE keyed on the dedupe key gives insert-or-focus in one
        // statement (idempotencyKey stored for replay). Kept as a single parameterized
        // MERGE so create is atomic on the warehouse.
        const merge = `
            MERGE INTO ${SECTION_TABLE} t
            USING (SELECT :owner AS owner_actor_id, :dedupe AS dedupe_key) s
            ON t.owner_actor_id = s.owner_actor_id AND t.dedupe_key = s.dedupe_key
            WHEN NOT MATCHED THEN INSERT (section_id, owner_actor_id, dedupe_key, body_json, version, created_at, updated_at)
            VALUES (:id, :owner, :dedupe, :body, 0, current_timestamp(), current_timestamp())`;
        await this._param(merge, {
            owner: ownerActorId, dedupe: dk, id: `sec_${cryptoId()}`, body: JSON.stringify(body),
        });
        // read-back keyed on dedupe to return the canonical (existing or new) row
        const r = await this._param(
            `SELECT * FROM ${SECTION_TABLE} WHERE owner_actor_id = :owner AND dedupe_key = :dedupe`,
            { owner: ownerActorId, dedupe: dk });
        return { section: rowToSection(r.columns, r.rows[0]), idempotencyKey };
    }

    async updateSection(ownerActorId, sectionId, patchBody, { expectedVersion } = {}) {
        this._guard('updateSection');
        // Optimistic concurrency via a version predicate in the UPDATE; a 0-row
        // result means a stale version (surfaced as 409 by the connector).
        patchBody.provenance.content_hash = computeContentHash(patchBody);
        const r = await this._param(
            `UPDATE ${SECTION_TABLE} SET body_json = :body, version = version + 1, updated_at = current_timestamp()
             WHERE section_id = :id AND owner_actor_id = :owner AND version = :ver`,
            { id: sectionId, owner: ownerActorId, ver: Number(expectedVersion), body: JSON.stringify(patchBody) });
        return r;
    }

    async deleteSection(ownerActorId, sectionId, { expectedVersion } = {}) {
        this._guard('deleteSection');
        return this._param(
            `DELETE FROM ${SECTION_TABLE} WHERE section_id = :id AND owner_actor_id = :owner AND version = :ver`,
            { id: sectionId, owner: ownerActorId, ver: Number(expectedVersion) });
    }

    async createSnapshot(ownerActorId, sectionId, snapshotBody) {
        this._guard('createSnapshot');
        return this._param(
            `INSERT INTO ${SNAPSHOT_TABLE} (snapshot_id, owner_actor_id, section_id, body_json, created_at)
             VALUES (:id, :owner, :section, :body, current_timestamp())`,
            { id: `snap_${cryptoId()}`, owner: ownerActorId, section: sectionId, body: JSON.stringify(snapshotBody) });
    }

    /** The CREATE TABLE statements a reviewer runs under authorization. NOT executed. */
    prepareDdl() {
        return [
            `-- Approved schema only. Review retention, RLS, and rollback before applying.`,
            `CREATE TABLE IF NOT EXISTS ${SECTION_TABLE} (`,
            `  section_id STRING NOT NULL,`,
            `  owner_actor_id STRING NOT NULL,`,
            `  dedupe_key STRING NOT NULL,`,
            `  body_json STRING NOT NULL,          -- validated CanvasSection body`,
            `  layout_order INT,`,
            `  save_state STRING,`,
            `  version INT NOT NULL,`,
            `  created_at TIMESTAMP NOT NULL,`,
            `  updated_at TIMESTAMP NOT NULL`,
            `) USING DELTA;`,
            ``,
            `CREATE TABLE IF NOT EXISTS ${SNAPSHOT_TABLE} (`,
            `  snapshot_id STRING NOT NULL,`,
            `  owner_actor_id STRING NOT NULL,`,
            `  section_id STRING NOT NULL,`,
            `  body_json STRING NOT NULL,          -- immutable snapshot body`,
            `  created_at TIMESTAMP NOT NULL`,
            `) USING DELTA;`,
        ].join('\n');
    }
}

function rowToSection(columns, row) {
    const idx = Object.fromEntries((columns || []).map((c, i) => [c, i]));
    const body = JSON.parse(row[idx.body_json] || '{}');
    // Column fields are authoritative and MUST win over any stale copy the body_json
    // happens to carry (e.g. a version snapshotted into the body before an update),
    // so spread the body first and let the columns override.
    return {
        ...body,
        section_id: row[idx.section_id],
        owner_actor_id: row[idx.owner_actor_id],
        version: Number(row[idx.version] || 0),
        created_at: row[idx.created_at],
        updated_at: row[idx.updated_at],
    };
}
function cryptoId() { return require('crypto').randomUUID(); }

module.exports = { DatabricksCanvasStore, ExternalRuntimeBlockedError, SECTION_TABLE, SNAPSHOT_TABLE };
