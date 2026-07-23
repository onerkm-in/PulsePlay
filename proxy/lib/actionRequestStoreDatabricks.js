/**
 * actionRequestStoreDatabricks.js — production event-store adapter (code-complete,
 * live execution externally blocked).
 *
 * The authoritative store for Action Requests is the append-only, event-sourced
 * `tbl_pp_decision_events` Delta table (v3.2 §8). This adapter appends immutable
 * events with parameterized SQL and derives the request projection with a query.
 * It NEVER runs DDL; prepareDdl() returns the CREATE statement for a reviewer.
 *
 * Not auto-selected on this workspace — the table is org-scoped + unreachable, so
 * the in-memory ActionRequestStore is the runtime authority here. Concurrency
 * safety on the warehouse requires a proven conditional-append POC (§8) before this
 * adapter is trusted live; that POC is part of the blocked live-Delta work.
 */
'use strict';

const DEFAULT_SCHEMA = process.env.AI_DECISION_SCHEMA
    || 'uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai';
const EVENT_TABLE = `${DEFAULT_SCHEMA}.tbl_pp_decision_events`;

class ExternalRuntimeBlockedError extends Error {
    constructor(op) {
        super(`Action Request Databricks op "${op}" is EXTERNAL_RUNTIME_VALIDATION_BLOCKED: `
            + `${EVENT_TABLE} is unreachable on this workspace and the conditional-append concurrency POC is not run.`);
        this.name = 'ExternalRuntimeBlockedError'; this.status = 503; this.code = 'EXTERNAL_RUNTIME_VALIDATION_BLOCKED';
    }
}

class DatabricksActionRequestStore {
    constructor(deps) {
        this._deps = deps || {};
        this._enabled = Boolean(deps && deps.enabled && deps.profile && deps.executeSqlStatement);
    }
    _guard(op) { if (!this._enabled) throw new ExternalRuntimeBlockedError(op); }

    async appendEvent(event) {
        this._guard('appendEvent');
        const { profile, databricksRequest, executeSqlStatement } = this._deps;
        // append-only insert with a conditional "no prior terminal event for this
        // (request, expected_version)" guard would live in a MERGE; parameterized.
        return executeSqlStatement({
            profile, databricksRequest,
            sql: `INSERT INTO ${EVENT_TABLE} (event_id, request_id, prompt_id, event_type, actor_id, prev_state, new_state, payload_json, event_ts)
                  VALUES (:eid, :rid, :pid, :etype, :actor, :prev, :next, :payload, current_timestamp())`,
            params: {
                eid: event.event_id, rid: event.request_id, pid: event.prompt_id, etype: event.event_type,
                actor: event.actor_id, prev: event.prev_state, next: event.new_state, payload: JSON.stringify(event.payload || null),
            },
        });
    }

    async listEvents(requestId) {
        this._guard('listEvents');
        const { profile, databricksRequest, executeSqlStatement } = this._deps;
        return executeSqlStatement({
            profile, databricksRequest,
            sql: `SELECT * FROM ${EVENT_TABLE} WHERE request_id = :rid ORDER BY event_ts`,
            params: { rid: requestId },
        });
    }

    prepareDdl() {
        return [
            `-- Approved schema only. Review retention, RLS, rollback, and run the`,
            `-- conditional-append concurrency POC (v3.2 §8) before trusting live.`,
            `CREATE TABLE IF NOT EXISTS ${EVENT_TABLE} (`,
            `  event_id STRING NOT NULL,`,
            `  request_id STRING NOT NULL,`,
            `  prompt_id STRING,`,
            `  event_type STRING NOT NULL,`,
            `  actor_id STRING NOT NULL,`,
            `  prev_state STRING,`,
            `  new_state STRING NOT NULL,`,
            `  payload_json STRING,`,
            `  event_ts TIMESTAMP NOT NULL`,
            `) USING DELTA;`,
        ].join('\n');
    }
}

module.exports = { DatabricksActionRequestStore, ExternalRuntimeBlockedError, EVENT_TABLE };
