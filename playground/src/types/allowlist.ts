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
    enforcement?: "strict" | "warn" | string;
    fetchedAt?: string;
}
