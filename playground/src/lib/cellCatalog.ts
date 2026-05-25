// playground/src/lib/cellCatalog.ts
//
// Client-side registry and contract for PulsePlay "Product Cells".
// A Cell is a queryable, nameable, and testable contract combining a
// BI Surface (Y-axis) with an AI Assistant Connector (X-axis).
//
// Governed by docs/cells/ manifests. Helps settings UI and wizards prevent
// informal configuration drift and validate E2E capability compliance.

export interface CellSurfaceSpec {
    readonly vendor: "powerbi" | "tableau" | "qlik" | "looker" | "generic-iframe" | string;
    readonly adapterMinVersion: string;
}

export interface CellAssistantSpec {
    readonly kind: "genie" | "foundation-model" | "bedrock" | "supervisor" | "responses-agent" | string;
    readonly profileType: "genie" | "foundation" | "bedrock" | "supervisor" | "responses" | string;
}

export interface CellPacksSpec {
    readonly supported: ReadonlyArray<string>;
}

export interface CellCapabilitiesSpec {
    readonly required: ReadonlyArray<string>;
    readonly optional: ReadonlyArray<string>;
}

export interface CellCatalogEntry {
    readonly id: string;
    readonly label: string;
    readonly surface: CellSurfaceSpec;
    readonly assistant: CellAssistantSpec;
    readonly packs: CellPacksSpec;
    readonly capabilities: CellCapabilitiesSpec;
    readonly status: "production" | "preview" | "deprecated";
}

function deepFreeze<T>(obj: T): T {
    if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
        Object.freeze(obj);
        Object.keys(obj).forEach(key => {
            deepFreeze((obj as any)[key]);
        });
    }
    return obj;
}

export const CELL_CATALOG: ReadonlyArray<CellCatalogEntry> = Object.freeze([
    {
        id: "powerbi-genie",
        label: "Power BI + Genie",
        surface: {
            vendor: "powerbi",
            adapterMinVersion: "1.0",
        },
        assistant: {
            kind: "genie",
            profileType: "genie",
        },
        packs: {
            supported: ["cpg-fmcg", "retail-digital", "*"],
        },
        capabilities: {
            required: ["chat", "sectioned-chat", "trust-badges"],
            optional: ["embed-token-server"],
        },
        status: "production",
    },
    {
        id: "tableau-foundation",
        label: "Tableau + Foundation Model",
        surface: {
            vendor: "tableau",
            adapterMinVersion: "1.0",
        },
        assistant: {
            kind: "foundation-model",
            profileType: "foundation",
        },
        packs: {
            supported: ["supply-chain", "hospital-operations", "*"],
        },
        capabilities: {
            required: ["chat", "trust-badges"],
            optional: [],
        },
        status: "production",
    },
    {
        id: "qlik-bedrock",
        label: "Qlik + Bedrock",
        surface: {
            vendor: "qlik",
            adapterMinVersion: "1.0",
        },
        assistant: {
            kind: "bedrock",
            profileType: "bedrock",
        },
        packs: {
            supported: ["finance-budget", "*"],
        },
        capabilities: {
            required: ["chat"],
            optional: ["trust-badges"],
        },
        status: "preview",
    },
    {
        id: "looker-supervisor",
        label: "Looker + Supervisor Agent",
        surface: {
            vendor: "looker",
            adapterMinVersion: "1.0",
        },
        assistant: {
            kind: "supervisor",
            profileType: "supervisor",
        },
        packs: {
            supported: ["hr-workforce", "retail-digital", "*"],
        },
        capabilities: {
            required: ["chat", "sectioned-chat", "multi-agent-coordination"],
            optional: [],
        },
        status: "preview",
    },
    {
        id: "generic-iframe-responses",
        label: "Generic Iframe + Responses Agent",
        surface: {
            vendor: "generic-iframe",
            adapterMinVersion: "1.0",
        },
        assistant: {
            kind: "responses-agent",
            profileType: "responses",
        },
        packs: {
            supported: ["*"],
        },
        capabilities: {
            required: ["chat"],
            optional: [],
        },
        status: "production",
    },
].map(deepFreeze));

/**
 * Resolves a Cell ID to its Catalog Entry.
 */
export function getCellEntry(id: string): CellCatalogEntry | undefined {
    return CELL_CATALOG.find(cell => cell.id === id);
}

/**
 * Scans the active configuration of BI vendor and AI profile name to
 * check if it matches a registered Product Cell. Returns the matched cell entry.
 */
export function matchActiveCell(vendor: string, profileType: string): CellCatalogEntry | undefined {
    return CELL_CATALOG.find(cell => {
        const matchesVendor = cell.surface.vendor.toLowerCase() === vendor.toLowerCase();
        const matchesAssistant = cell.assistant.profileType.toLowerCase() === profileType.toLowerCase();
        return matchesVendor && matchesAssistant;
    });
}

/**
 * Audits whether a cell's required capabilities are supported by the active
 * environment's active profile and surface.
 */
export interface CellAuditResult {
    readonly conforms: boolean;
    readonly missingRequired: string[];
    readonly warnings: string[];
}

export function auditCellCompliance(
    cell: CellCatalogEntry,
    activeCapabilities: Record<string, boolean>
): CellAuditResult {
    const missingRequired: string[] = [];
    const warnings: string[] = [];

    cell.capabilities.required.forEach(cap => {
        if (!activeCapabilities[cap]) {
            missingRequired.push(cap);
        }
    });

    cell.capabilities.optional.forEach(cap => {
        if (!activeCapabilities[cap]) {
            warnings.push(`Optional capability ${cap} is not active.`);
        }
    });

    return {
        conforms: missingRequired.length === 0,
        missingRequired,
        warnings,
    };
}
