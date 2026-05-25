// playground/src/lib/cellCatalog.ts
//
// Client-side registry and contract for PulsePlay "Product Cells".
//
// A Cell is a queryable, nameable, and testable contract combining a
// BI Surface (Y-axis) with an AI Assistant Connector (X-axis). The
// catalog lives in JSON manifests at `playground/src/cells/*.json`
// — those files are the single source of truth. This module imports
// them statically so:
//
//   1. tsc + Vite + tests all see the same data.
//   2. Platform / admins can edit the JSON without touching TS.
//   3. Future build-time tooling can prune from the JSON manifest
//      without parsing TS constants.
//
// Locked 2026-05-25 (Step 0 of the unified-surface beast-mode plan):
// previously the cells were ALSO declared as inline TS constants in
// this file, which created two sources of truth that would drift. The
// JSON manifests are now the only place a cell is declared.

import powerbiGenie from "../cells/powerbi-genie.json";
import tableauFoundation from "../cells/tableau-foundation.json";
import qlikBedrock from "../cells/qlik-bedrock.json";
import lookerSupervisor from "../cells/looker-supervisor.json";
import genericIframeResponses from "../cells/generic-iframe-responses.json";

/** Capabilities a cell can require or optionally consume. Typed so a
 *  typo in a manifest fails at compile time instead of silently being
 *  treated as "not active" at audit time. Extend this union when a new
 *  capability ships. */
export type Capability =
    | "chat"
    | "sectioned-chat"
    | "trust-badges"
    | "kpi-tone"
    | "embed-token-server"
    | "multi-agent-coordination"
    | "ai-assisted-authoring"
    | "preset-library";

export interface CellSurfaceSpec {
    readonly vendor: "powerbi" | "tableau" | "qlik" | "looker" | "generic-iframe";
    readonly adapterMinVersion: string;
}

export interface CellAssistantSpec {
    readonly kind: "genie" | "foundation-model" | "bedrock" | "supervisor" | "responses-agent";
    readonly profileType: "genie" | "foundation" | "bedrock" | "supervisor" | "responses";
}

export interface CellPacksSpec {
    readonly supported: ReadonlyArray<string>;
}

export interface CellCapabilitiesSpec {
    readonly required: ReadonlyArray<Capability>;
    readonly optional: ReadonlyArray<Capability>;
}

export type CellStatus = "production" | "preview" | "deprecated";

export interface CellCatalogEntry {
    readonly id: string;
    readonly label: string;
    readonly surface: CellSurfaceSpec;
    readonly assistant: CellAssistantSpec;
    readonly packs: CellPacksSpec;
    readonly capabilities: CellCapabilitiesSpec;
    readonly status: CellStatus;
}

/** Defensively freeze nested objects so consumers can't accidentally
 *  mutate the catalog. Top-level Object.freeze only shallow-freezes;
 *  nested arrays + objects would still be mutable without this. */
function deepFreeze<T>(obj: T): T {
    if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
        Object.freeze(obj);
        for (const key of Object.keys(obj)) {
            deepFreeze((obj as Record<string, unknown>)[key]);
        }
    }
    return obj;
}

/** The authoritative cell catalog. Each entry is loaded from its
 *  matching `playground/src/cells/<id>.json` manifest. Adding a new
 *  cell = create the JSON file + extend this array + extend any
 *  Capability union members the cell needs. */
export const CELL_CATALOG: ReadonlyArray<CellCatalogEntry> = Object.freeze(
    [
        powerbiGenie,
        tableauFoundation,
        qlikBedrock,
        lookerSupervisor,
        genericIframeResponses,
    ].map(entry => deepFreeze(entry as CellCatalogEntry)),
);

/** Resolve a cell id to its catalog entry, or `undefined` when no cell
 *  with that id is registered. */
export function getCellEntry(id: string): CellCatalogEntry | undefined {
    return CELL_CATALOG.find(cell => cell.id === id);
}

/** Resolve an active (vendor, profileType) pair to the matching cell
 *  entry, or `undefined` when no cell covers that combination. Both
 *  inputs are compared case-insensitively so settings-store casing
 *  doesn't matter. */
export function matchActiveCell(vendor: string, profileType: string): CellCatalogEntry | undefined {
    const v = vendor.toLowerCase();
    const p = profileType.toLowerCase();
    return CELL_CATALOG.find(cell =>
        cell.surface.vendor.toLowerCase() === v
        && cell.assistant.profileType.toLowerCase() === p,
    );
}

export interface CellAuditResult {
    /** True iff every required capability is active. */
    readonly conforms: boolean;
    /** Required capabilities the active environment does NOT provide. */
    readonly missingRequired: ReadonlyArray<Capability>;
    /** Human-readable warnings for missing optional capabilities. */
    readonly warnings: ReadonlyArray<string>;
}

/** Audit a cell against an active-capabilities map. Used by Settings +
 *  Launchpad surfaces to render a cell's readiness state without
 *  reimplementing the contract. */
export function auditCellCompliance(
    cell: CellCatalogEntry,
    activeCapabilities: Partial<Record<Capability, boolean>>,
): CellAuditResult {
    const missingRequired: Capability[] = [];
    const warnings: string[] = [];

    for (const cap of cell.capabilities.required) {
        if (!activeCapabilities[cap]) missingRequired.push(cap);
    }
    for (const cap of cell.capabilities.optional) {
        if (!activeCapabilities[cap]) warnings.push(`Optional capability ${cap} is not active.`);
    }

    return {
        conforms: missingRequired.length === 0,
        missingRequired,
        warnings,
    };
}
