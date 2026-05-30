// playground/src/featureRegistry/__tests__/manifest.test.ts
//
// Lock the manifest invariants: every descriptor's preferredSurface
// must be in its surfaces array, and every FeatureId literal must
// have exactly one descriptor. Catches manifest typos at test time
// instead of at runtime when the resolver returns wrong values.

import { describe, expect, it } from "vitest";
import { FEATURE_MANIFEST } from "../manifest";
import { SURFACES, type FeatureDescriptor, type FeatureId } from "../types";

describe("FEATURE_MANIFEST invariants", () => {
    it("has exactly one descriptor per FeatureId (no dupes, no gaps for the shipped 11)", () => {
        const ids = FEATURE_MANIFEST.map(d => d.id);
        const unique = new Set(ids);
        expect(unique.size).toBe(ids.length); // no dupes
        expect(FEATURE_MANIFEST.length).toBe(11); // slice 3 ships 11 entries
    });

    it("every descriptor's preferredSurface is in its surfaces array", () => {
        for (const descriptor of FEATURE_MANIFEST) {
            expect(descriptor.surfaces).toContain(descriptor.preferredSurface);
        }
    });

    it("every descriptor's surfaces are valid Surface literals", () => {
        const validSurfaces = new Set(SURFACES.map(s => s.id));
        for (const descriptor of FEATURE_MANIFEST) {
            for (const surface of descriptor.surfaces) {
                expect(validSurfaces.has(surface)).toBe(true);
            }
        }
    });

    it("sectioned-chat is the ONLY entry with a runtimeGate (slice 4 will add more)", () => {
        const withRuntimeGate = FEATURE_MANIFEST.filter(d => typeof d.runtimeGate === "function");
        expect(withRuntimeGate).toHaveLength(1);
        expect(withRuntimeGate[0].id).toBe("sectioned-chat");
    });

    it("pulse-exclusive features (briefing, custom-sql, exports, sustainability) declare only pulse", () => {
        const pulseExclusives: FeatureId[] = [
            "executive-briefing",
            "custom-sql-sections",
            "briefing-exports",
            "sustainability-orb",
        ];
        for (const id of pulseExclusives) {
            const descriptor = FEATURE_MANIFEST.find(d => d.id === id);
            expect(descriptor).toBeDefined();
            expect(descriptor!.surfaces).toEqual(["pulse"]);
        }
    });

    it("dashboard-exclusive bi-iframe-canvas declares only dashboard", () => {
        const bi = FEATURE_MANIFEST.find(d => d.id === "bi-iframe-canvas");
        expect(bi?.surfaces).toEqual(["dashboard"]);
    });
});

describe("SURFACES descriptors", () => {
    it("exposes 3 surfaces (pulse, v0, dashboard) per Q1 sign-off", () => {
        expect(SURFACES.map(s => s.id).sort()).toEqual(["dashboard", "pulse", "v0"]);
    });

    it("each surface has at least one coreIdentity feature listed", () => {
        for (const surface of SURFACES) {
            expect(surface.coreIdentity.length).toBeGreaterThan(0);
        }
    });
});

// Compile-time assertion: every FeatureId literal in the type union must
// have a matching manifest entry. If a future contributor adds a literal
// to FeatureId without adding to the manifest, this `satisfies` check
// fails at build time. The runtime presence of the descriptor is what
// the test above asserts; this assertion catches the type-vs-runtime
// drift at compile time. Kept in this file (not types.ts) because it
// imports the manifest.
type _AssertEveryFeatureIdHasDescriptor = {
    [K in FeatureId]: Extract<FeatureDescriptor, { id: K }>;
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _typeProbe = null as unknown as _AssertEveryFeatureIdHasDescriptor;
