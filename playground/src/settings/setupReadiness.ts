// playground/src/settings/setupReadiness.ts
//
// Small shared readiness model for the single top-right setup pill and
// Settings > Setup tree. "Ready" means the author has picked enough of
// both axes for the playground to run: one BI surface with embed config,
// and one AI profile/connector.

import type { BIEmbedConfig } from "../biPanel/BIAdapter";

export interface SetupReadinessInput {
    biVendor?: string | null;
    embedConfig?: BIEmbedConfig | null;
    activeAiProfile?: string | null;
}

export interface SetupReadiness {
    hasBiProvider: boolean;
    hasEmbedConfig: boolean;
    hasAiProfile: boolean;
    biReady: boolean;
    aiReady: boolean;
    ready: boolean;
    missing: string[];
    pillLabel: "Ready" | "Setup needed";
    pillDetail: string;
}

export function isNativeBiVendor(vendor?: string | null): boolean {
    return String(vendor || "").trim() === "native";
}

export function getSetupReadiness(input: SetupReadinessInput): SetupReadiness {
    const hasBiProvider = !!String(input.biVendor || "").trim();
    const nativeBi = isNativeBiVendor(input.biVendor);
    const hasEmbedConfig = nativeBi || (!!input.embedConfig
        && typeof input.embedConfig === "object"
        && !Array.isArray(input.embedConfig)
        && Object.keys(input.embedConfig).length > 0);
    const hasAiProfile = !!String(input.activeAiProfile || "").trim();
    const biReady = hasBiProvider && hasEmbedConfig;
    const aiReady = hasAiProfile;
    const missing: string[] = [];

    if (!hasBiProvider) missing.push("BI provider");
    if (hasBiProvider && !hasEmbedConfig) missing.push("BI config");
    if (!hasAiProfile) missing.push("AI profile");

    const ready = biReady && aiReady;
    return {
        hasBiProvider,
        hasEmbedConfig,
        hasAiProfile,
        biReady,
        aiReady,
        ready,
        missing,
        pillLabel: ready ? "Ready" : "Setup needed",
        pillDetail: ready ? "BI + AI" : missing.join(" + "),
    };
}
