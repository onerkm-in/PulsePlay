export interface PulsePlayLicensePosture {
    powerbi?: {
        minTier?: string;
        allowedTiers?: string[];
        embedSku?: string[];
        /** When false (MVP 0.2 default), Fabric features (Direct Lake,
         *  Dataflow Gen2, semantic-link APIs) are explicitly unavailable
         *  in this deployment. The Settings page surfaces this so authors
         *  don't expect features the deployment doesn't license. */
        fabricEnabled?: boolean;
    };
    /** Loose-but-typed escape hatch for future vendor licensing blocks
     *  (Tableau / Qlik / Looker etc.) without re-shipping the type. */
    [vendor: string]: unknown;
}

export type PulsePlayBiTileMode = "1" | "2" | "4";

export interface PulsePlayDisplayPolicy {
    /** Organization-defined BI tile count for the canvas. This is an
     *  admin/deployment policy, not a casual end-user toggle. */
    biTileMode?: PulsePlayBiTileMode;
}

export interface PulsePlayAllowlist {
    configured?: boolean;
    biProviders: string[];
    embedOrigins: Record<string, string[]>;
    aadTenants: string[];
    aiProfiles: string[];
    packs: string[];
    knowledgeSources?: string[];
    powerbiWorkspaces?: string[];
    powerbiReports?: string[];
    genieSpaces?: string[];
    /** License posture per vendor (read-only). Surfaced by SystemGroup ›
     *  Security and by BI › Status. */
    license?: PulsePlayLicensePosture;
    /** Read-only display policy supplied by the proxy/admin config. */
    display?: PulsePlayDisplayPolicy;
    enforcement?: "strict" | "warn" | string;
    fetchedAt?: string;
}
