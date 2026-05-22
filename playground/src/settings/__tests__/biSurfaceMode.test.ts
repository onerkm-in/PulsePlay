import { describe, expect, it } from "vitest";
import {
    BI_SURFACE_MODE_STORAGE_KEY,
    isBiSurfaceMode,
    isNativeBiVendor,
    normalizeBiSurfaceMode,
    readInitialBiSurfaceMode,
    resolveBiSurfaceVendor,
} from "../biSurfaceMode";

describe("biSurfaceMode", () => {
    it("normalizes only the three shipped modes", () => {
        expect(isBiSurfaceMode("auto")).toBe(true);
        expect(isBiSurfaceMode("native")).toBe(true);
        expect(isBiSurfaceMode("vendor")).toBe(true);
        expect(isBiSurfaceMode("fusion")).toBe(false);
        expect(normalizeBiSurfaceMode("fusion")).toBe("auto");
    });

    it("reads auto by default and validates persisted values", () => {
        window.localStorage.removeItem(BI_SURFACE_MODE_STORAGE_KEY);
        expect(readInitialBiSurfaceMode()).toBe("auto");
        window.localStorage.setItem(BI_SURFACE_MODE_STORAGE_KEY, "native");
        expect(readInitialBiSurfaceMode()).toBe("native");
        window.localStorage.setItem(BI_SURFACE_MODE_STORAGE_KEY, "bad");
        expect(readInitialBiSurfaceMode()).toBe("auto");
    });

    it("detects the native vendor literal only", () => {
        expect(isNativeBiVendor("native")).toBe(true);
        expect(isNativeBiVendor(" powerbi ")).toBe(false);
        expect(isNativeBiVendor("")).toBe(false);
    });

    it("auto mode uses configured vendor when embed config exists", () => {
        const resolved = resolveBiSurfaceVendor({
            mode: "auto",
            requestedVendor: "powerbi",
            hasVendorEmbedConfig: true,
        });
        expect(resolved.runtimeVendor).toBe("powerbi");
        expect(resolved.usesNative).toBe(false);
        expect(resolved.requiresVendorConfig).toBe(true);
        expect(resolved.reason).toBe("auto-vendor-configured");
    });

    it("auto mode falls back to native when no vendor embed config exists", () => {
        const resolved = resolveBiSurfaceVendor({
            mode: "auto",
            requestedVendor: "powerbi",
            hasVendorEmbedConfig: false,
        });
        expect(resolved.runtimeVendor).toBe("native");
        expect(resolved.usesNative).toBe(true);
        expect(resolved.requiresVendorConfig).toBe(false);
        expect(resolved.reason).toBe("auto-no-vendor-config");
    });

    it("auto mode respects a native vendor request for backward compatibility", () => {
        const resolved = resolveBiSurfaceVendor({
            mode: "auto",
            requestedVendor: "native",
            hasVendorEmbedConfig: true,
        });
        expect(resolved.runtimeVendor).toBe("native");
        expect(resolved.reason).toBe("auto-requested-native");
    });

    it("native mode preserves the requested vendor while forcing native runtime", () => {
        const resolved = resolveBiSurfaceVendor({
            mode: "native",
            requestedVendor: "tableau",
            hasVendorEmbedConfig: true,
        });
        expect(resolved.requestedVendor).toBe("tableau");
        expect(resolved.runtimeVendor).toBe("native");
        expect(resolved.reason).toBe("forced-native");
    });

    it("vendor mode forces the selected vendor even when embed config is missing", () => {
        const resolved = resolveBiSurfaceVendor({
            mode: "vendor",
            requestedVendor: "powerbi",
            hasVendorEmbedConfig: false,
        });
        expect(resolved.runtimeVendor).toBe("powerbi");
        expect(resolved.usesNative).toBe(false);
        expect(resolved.requiresVendorConfig).toBe(true);
        expect(resolved.reason).toBe("forced-vendor");
    });

    it("vendor mode falls back to the first visible non-native vendor when requested vendor is native", () => {
        const resolved = resolveBiSurfaceVendor({
            mode: "vendor",
            requestedVendor: "native",
            hasVendorEmbedConfig: false,
            visibleVendors: [{ vendor: "native" }, { vendor: "databricks-aibi" }, { vendor: "powerbi" }],
        });
        expect(resolved.runtimeVendor).toBe("databricks-aibi");
        expect(resolved.reason).toBe("forced-vendor-fallback");
    });
});
