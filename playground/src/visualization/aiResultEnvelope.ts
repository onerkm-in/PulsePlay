// playground/src/visualization/aiResultEnvelope.ts
//
// G2 - serializable AI result envelope. This is the host-independent shape
// that can travel from proxy/assistant output into chart intent, validation,
// native rendering, PulsePlay workbench, or the Pulse PBI sibling.

import { isDatabricksSourceRef, type DatabricksSourceRef } from "./sourceRef";
import { isGovernanceAttestation, type GovernanceAttestation } from "./governance";

export type AIResultCell = string | number | boolean | null;

export interface AIResultColumn {
    readonly name: string;
    readonly type?: string;
    readonly role?: "dimension" | "measure" | "time" | "unknown";
    readonly semanticType?: string;
}

export interface AIResultEnvelope {
    readonly id: string;
    readonly question?: string;
    readonly answer?: string;
    readonly rows?: ReadonlyArray<ReadonlyArray<AIResultCell>>;
    readonly schema?: ReadonlyArray<AIResultColumn>;
    readonly sql?: string;
    readonly structuredInsight?: Readonly<Record<string, unknown>>;
    readonly sourceRef?: DatabricksSourceRef;
    /**
     * G3a narrowed this from `unknown` to the typed `GovernanceAttestation`.
     * The field stays OPTIONAL in the type system — production fail-closed
     * policy ("missing attestation in production blocks render") lives in
     * the native adapter / render gate (queued for G3d), not in this guard.
     *
     * The envelope guard `isAIResultEnvelope` only validates SHAPE: if
     * `governance` is present it must structurally satisfy
     * `isGovernanceAttestation`; if absent the envelope is still valid.
     * Deployments enforce policy at the renderer layer where they have
     * NODE_ENV / config context.
     */
    readonly governance?: GovernanceAttestation;
    readonly metadata?: Readonly<Record<string, unknown>>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAIResultCell(value: unknown): value is AIResultCell {
    return value === null
        || typeof value === "string"
        || typeof value === "number"
        || typeof value === "boolean";
}

function isColumn(value: unknown): value is AIResultColumn {
    if (!isPlainObject(value)) return false;
    if (typeof value.name !== "string" || value.name.length === 0) return false;
    if (value.type !== undefined && typeof value.type !== "string") return false;
    if (value.semanticType !== undefined && typeof value.semanticType !== "string") return false;
    if (value.role !== undefined && !["dimension", "measure", "time", "unknown"].includes(String(value.role))) return false;
    return true;
}

export function isAIResultEnvelope(value: unknown): value is AIResultEnvelope {
    if (!isPlainObject(value)) return false;
    if (typeof value.id !== "string" || value.id.length === 0) return false;
    if (value.question !== undefined && typeof value.question !== "string") return false;
    if (value.answer !== undefined && typeof value.answer !== "string") return false;
    if (value.sql !== undefined && typeof value.sql !== "string") return false;
    if (value.structuredInsight !== undefined && !isPlainObject(value.structuredInsight)) return false;
    if (value.metadata !== undefined && !isPlainObject(value.metadata)) return false;
    if (value.sourceRef !== undefined && !isDatabricksSourceRef(value.sourceRef)) return false;
    // G3a — validate governance shape if present; do NOT require it. Production
    // fail-closed policy applies at the renderer, not this guard.
    if (value.governance !== undefined && !isGovernanceAttestation(value.governance)) return false;
    if (value.schema !== undefined) {
        if (!Array.isArray(value.schema)) return false;
        if (!value.schema.every(isColumn)) return false;
    }
    if (value.rows !== undefined) {
        if (!Array.isArray(value.rows)) return false;
        for (const row of value.rows) {
            if (!Array.isArray(row)) return false;
            if (!row.every(isAIResultCell)) return false;
        }
    }
    return true;
}

export function createAIResultEnvelope(input: AIResultEnvelope): AIResultEnvelope {
    if (!isAIResultEnvelope(input)) {
        throw new Error("Invalid AIResultEnvelope");
    }
    return {
        ...input,
        ...(input.schema ? { schema: input.schema.map(col => ({ ...col })) } : {}),
        ...(input.rows ? { rows: input.rows.map(row => row.slice()) } : {}),
        ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    };
}

export function aiResultRowsToObjects(envelope: AIResultEnvelope): ReadonlyArray<Record<string, AIResultCell>> {
    const columns = envelope.schema ?? [];
    const rows = envelope.rows ?? [];
    return rows.map(row => {
        const out: Record<string, AIResultCell> = {};
        columns.forEach((col, index) => {
            out[col.name] = row[index] ?? null;
        });
        return out;
    });
}
