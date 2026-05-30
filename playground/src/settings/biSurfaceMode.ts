// playground/src/settings/biSurfaceMode.ts
//
// G5 — author-facing BI surface mode. `biVendor` remains the author's
// vendor intent/config target; this resolver decides what the BI pane mounts
// at runtime.

export type BiSurfaceMode = "auto" | "native" | "vendor";

export const BI_SURFACE_MODE_STORAGE_KEY = "pulseplay:bi-surface-mode";
export const DEFAULT_BI_SURFACE_MODE: BiSurfaceMode = "auto";
export const DEFAULT_VENDOR_FALLBACK = "powerbi";

export interface BiSurfaceVendorCandidate {
    vendor: string;
}

export type BiSurfaceResolutionReason =
    | "auto-requested-native"
    | "auto-vendor-configured"
    | "auto-no-vendor-config"
    | "forced-native"
    | "forced-vendor"
    | "forced-vendor-fallback";

export interface BiSurfaceResolution {
    mode: BiSurfaceMode;
    requestedVendor: string;
    runtimeVendor: string;
    reason: BiSurfaceResolutionReason;
    usesNative: boolean;
    requiresVendorConfig: boolean;
}

export function isBiSurfaceMode(value: unknown): value is BiSurfaceMode {
    return value === "auto" || value === "native" || value === "vendor";
}

export function normalizeBiSurfaceMode(value: unknown): BiSurfaceMode {
    return isBiSurfaceMode(value) ? value : DEFAULT_BI_SURFACE_MODE;
}

export function readInitialBiSurfaceMode(): BiSurfaceMode {
    if (typeof window === "undefined") return DEFAULT_BI_SURFACE_MODE;
    try {
        return normalizeBiSurfaceMode(window.localStorage.getItem(BI_SURFACE_MODE_STORAGE_KEY));
    } catch {
        return DEFAULT_BI_SURFACE_MODE;
    }
}

export function isNativeBiVendor(vendor?: string | null): boolean {
    return String(vendor || "").trim() === "native";
}

export function resolveBiSurfaceVendor(input: {
    mode: BiSurfaceMode;
    requestedVendor?: string | null;
    hasVendorEmbedConfig: boolean;
    visibleVendors?: ReadonlyArray<BiSurfaceVendorCandidate>;
}): BiSurfaceResolution {
    const mode = normalizeBiSurfaceMode(input.mode);
    const requestedVendor = normalizeVendor(input.requestedVendor);
    const requestedIsNative = isNativeBiVendor(requestedVendor);

    if (mode === "native") {
        return makeResolution({
            mode,
            requestedVendor,
            runtimeVendor: "native",
            reason: "forced-native",
        });
    }

    if (mode === "vendor") {
        const runtimeVendor = requestedIsNative
            ? firstNonNativeVendor(input.visibleVendors) || DEFAULT_VENDOR_FALLBACK
            : requestedVendor || DEFAULT_VENDOR_FALLBACK;
        return makeResolution({
            mode,
            requestedVendor,
            runtimeVendor,
            reason: requestedIsNative ? "forced-vendor-fallback" : "forced-vendor",
        });
    }

    if (requestedIsNative) {
        return makeResolution({
            mode,
            requestedVendor,
            runtimeVendor: "native",
            reason: "auto-requested-native",
        });
    }

    if (requestedVendor && input.hasVendorEmbedConfig) {
        return makeResolution({
            mode,
            requestedVendor,
            runtimeVendor: requestedVendor,
            reason: "auto-vendor-configured",
        });
    }

    return makeResolution({
        mode,
        requestedVendor,
        runtimeVendor: "native",
        reason: "auto-no-vendor-config",
    });
}

function makeResolution(input: {
    mode: BiSurfaceMode;
    requestedVendor: string;
    runtimeVendor: string;
    reason: BiSurfaceResolutionReason;
}): BiSurfaceResolution {
    const usesNative = isNativeBiVendor(input.runtimeVendor);
    return {
        ...input,
        usesNative,
        requiresVendorConfig: !usesNative,
    };
}

function normalizeVendor(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function firstNonNativeVendor(vendors: ReadonlyArray<BiSurfaceVendorCandidate> | undefined): string | null {
    if (!vendors) return null;
    for (const candidate of vendors) {
        const vendor = normalizeVendor(candidate.vendor);
        if (vendor && !isNativeBiVendor(vendor)) return vendor;
    }
    return null;
}
