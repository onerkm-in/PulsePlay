import { describe, it, expect } from "vitest";
import {
    deriveBundles,
    resolveActiveBundle,
    parseAuthoredBundles,
    vendorLabel,
    profileLabel,
    type ContextBundle,
} from "../contextBundles";
import type { PulsePlayAllowlist } from "../../types/allowlist";

function allowlist(partial: Partial<PulsePlayAllowlist>): PulsePlayAllowlist {
    return {
        configured: true,
        biProviders: [],
        embedOrigins: {},
        aadTenants: [],
        aiProfiles: [],
        packs: [],
        ...partial,
    };
}

describe("contextBundles — labels", () => {
    it("humanizes known vendor/profile ids", () => {
        expect(vendorLabel("powerbi")).toBe("Power BI");
        expect(profileLabel("default")).toBe("Genie");
        expect(profileLabel("powerbi-dwd")).toBe("Semantic Q&A");
    });
    it("title-cases unknown ids", () => {
        expect(vendorLabel("my-vendor")).toBe("My Vendor");
        expect(profileLabel("custom_brain")).toBe("Custom Brain");
    });
});

describe("deriveBundles — allowlist gating", () => {
    it("is permissive when allowlist is null (dev/unconfigured)", () => {
        const bundles = deriveBundles(null);
        // all curated candidates present
        expect(bundles.length).toBeGreaterThanOrEqual(5);
        expect(bundles.some(b => b.id === "powerbi::default")).toBe(true);
    });

    it("filters to pairings whose BOTH axes are allowed", () => {
        const bundles = deriveBundles(allowlist({ biProviders: ["powerbi"], aiProfiles: ["default", "powerbi-dwd"] }));
        const ids = bundles.map(b => b.id).sort();
        expect(ids).toEqual(["powerbi::default", "powerbi::powerbi-dwd"]);
    });

    it("drops a candidate when its AI profile is not allowed", () => {
        const bundles = deriveBundles(allowlist({ biProviders: ["powerbi"], aiProfiles: ["default"] }));
        expect(bundles.some(b => b.id === "powerbi::powerbi-dwd")).toBe(false);
        expect(bundles.some(b => b.id === "powerbi::default")).toBe(true);
    });

    it("drops a candidate when its vendor is not allowed", () => {
        const bundles = deriveBundles(allowlist({ biProviders: ["tableau"], aiProfiles: ["default"] }));
        expect(bundles.every(b => b.biVendor === "tableau")).toBe(true);
        expect(bundles.some(b => b.id === "powerbi::default")).toBe(false);
    });

    it("gives each bundle a human label and a derived id", () => {
        const [b] = deriveBundles(allowlist({ biProviders: ["powerbi"], aiProfiles: ["default"] }));
        expect(b.label).toBe("Power BI × Genie");
        expect(b.id).toBe("powerbi::default");
    });
});

describe("deriveBundles — authored bundles", () => {
    it("merges dev-authored bundles and lets them override a curated id's label", () => {
        const raw = JSON.stringify([
            { biVendor: "powerbi", aiProfile: "default", label: "Finance Enabler" },
            { biVendor: "tableau", aiProfile: "bedrock", label: "Ops Enabler" },
        ]);
        const bundles = deriveBundles(null, { authoredRaw: raw });
        const finance = bundles.find(b => b.id === "powerbi::default");
        expect(finance?.label).toBe("Finance Enabler"); // authored relabel wins
        expect(finance?.custom).toBe(true);
        expect(bundles.some(b => b.id === "tableau::bedrock" && b.label === "Ops Enabler")).toBe(true);
        // no duplicate curated powerbi::default
        expect(bundles.filter(b => b.id === "powerbi::default")).toHaveLength(1);
    });

    it("filters authored bundles by the allowlist too", () => {
        const raw = JSON.stringify([{ biVendor: "tableau", aiProfile: "bedrock", label: "Ops" }]);
        const bundles = deriveBundles(allowlist({ biProviders: ["powerbi"], aiProfiles: ["default"] }), { authoredRaw: raw });
        expect(bundles.some(b => b.id === "tableau::bedrock")).toBe(false);
    });
});

describe("parseAuthoredBundles — defensive", () => {
    it("returns [] for junk / missing fields", () => {
        expect(parseAuthoredBundles(null)).toEqual([]);
        expect(parseAuthoredBundles("not json")).toEqual([]);
        expect(parseAuthoredBundles("{}")).toEqual([]);
        expect(parseAuthoredBundles(JSON.stringify([{ biVendor: "powerbi" }]))).toEqual([]); // missing aiProfile
    });
});

describe("resolveActiveBundle — pure projection", () => {
    const bundles: ContextBundle[] = deriveBundles(null);
    it("matches the bundle for the current pair", () => {
        const active = resolveActiveBundle(bundles, "powerbi", "powerbi-dwd");
        expect(active?.id).toBe("powerbi::powerbi-dwd");
    });
    it("returns null (Custom/unlocked) when the pair is not a known bundle", () => {
        expect(resolveActiveBundle(bundles, "powerbi", "bedrock")).toBeNull();
    });
});
