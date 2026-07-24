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
        // all curated candidates present (2026-07-24 curation: the proven
        // stack only — Power BI + Pulse Canvas surfaces × Genie + Semantic Q&A)
        expect(bundles.map(b => b.id).sort()).toEqual([
            "native::genie",
            "native::powerbi-dwd",
            "powerbi::genie",
            "powerbi::powerbi-dwd",
        ]);
    });

    it("filters to pairings whose BOTH axes are allowed", () => {
        const bundles = deriveBundles(allowlist({ biProviders: ["powerbi"], aiProfiles: ["genie", "powerbi-dwd"] }));
        const ids = bundles.map(b => b.id).sort();
        expect(ids).toEqual(["powerbi::genie", "powerbi::powerbi-dwd"]);
    });

    it("drops a candidate when its AI profile is not allowed", () => {
        const bundles = deriveBundles(allowlist({ biProviders: ["powerbi"], aiProfiles: ["genie"] }));
        expect(bundles.some(b => b.id === "powerbi::powerbi-dwd")).toBe(false);
        expect(bundles.some(b => b.id === "powerbi::genie")).toBe(true);
    });

    it("drops a candidate when its vendor is not allowed", () => {
        const bundles = deriveBundles(allowlist({ biProviders: ["tableau"], aiProfiles: ["genie"] }));
        expect(bundles.every(b => b.biVendor === "tableau")).toBe(true);
        expect(bundles.some(b => b.id === "powerbi::genie")).toBe(false);
    });

    it("gives each bundle a human label and a derived id", () => {
        const [b] = deriveBundles(allowlist({ biProviders: ["powerbi"], aiProfiles: ["genie"] }));
        expect(b.label).toBe("Power BI × Genie");
        expect(b.id).toBe("powerbi::genie");
    });
});

describe("deriveBundles — authored bundles", () => {
    it("merges dev-authored bundles and lets them override a curated id's label", () => {
        const raw = JSON.stringify([
            { biVendor: "powerbi", aiProfile: "genie", label: "Finance Enabler" },
            { biVendor: "tableau", aiProfile: "bedrock", label: "Ops Enabler" },
        ]);
        const bundles = deriveBundles(null, { authoredRaw: raw });
        const finance = bundles.find(b => b.id === "powerbi::genie");
        expect(finance?.label).toBe("Finance Enabler"); // authored relabel wins
        expect(finance?.custom).toBe(true);
        expect(bundles.some(b => b.id === "tableau::bedrock" && b.label === "Ops Enabler")).toBe(true);
        // no duplicate curated powerbi::genie
        expect(bundles.filter(b => b.id === "powerbi::genie")).toHaveLength(1);
    });

    it("filters authored bundles by the allowlist too", () => {
        const raw = JSON.stringify([{ biVendor: "tableau", aiProfile: "bedrock", label: "Ops" }]);
        const bundles = deriveBundles(allowlist({ biProviders: ["powerbi"], aiProfiles: ["genie"] }), { authoredRaw: raw });
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
    it("recognizes the flagship Pulse Canvas × Genie pair (never 'Custom')", () => {
        const active = resolveActiveBundle(bundles, "native", "genie");
        expect(active?.label).toBe("Pulse Canvas × Genie");
    });
    it("returns null (Custom/unlocked) when the pair is not a known bundle", () => {
        expect(resolveActiveBundle(bundles, "powerbi", "bedrock")).toBeNull();
    });
});
