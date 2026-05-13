// playground/src/knowledge/__tests__/knowledgeRoute.test.ts
//
// Phase 8 (KB UI) — pure-function coverage for parseKnowledgeRoute.

import { describe, it, expect } from "vitest";
import { parseKnowledgeRoute, KNOWLEDGE_SECTIONS } from "../knowledgeRoute";

describe("parseKnowledgeRoute", () => {
    it("returns isKnowledgeRoute=false for non-knowledge paths", () => {
        const state = parseKnowledgeRoute("/");
        expect(state.isKnowledgeRoute).toBe(false);
    });

    it("returns the bare KB index for /knowledge", () => {
        const state = parseKnowledgeRoute("/knowledge");
        expect(state.isKnowledgeRoute).toBe(true);
        expect(state.pack).toBeNull();
        expect(state.section).toBe("overview");
        expect(state.subVertical).toBeNull();
    });

    it("parses /knowledge/<pack> as overview", () => {
        const state = parseKnowledgeRoute("/knowledge/cpg-fmcg");
        expect(state.isKnowledgeRoute).toBe(true);
        expect(state.pack).toBe("cpg-fmcg");
        expect(state.section).toBe("overview");
        expect(state.subVertical).toBeNull();
    });

    it.each(KNOWLEDGE_SECTIONS)("parses /knowledge/<pack>/%s as section=%s", (section) => {
        const state = parseKnowledgeRoute(`/knowledge/cpg-fmcg/${section}`);
        expect(state.section).toBe(section);
    });

    it("parses /knowledge/<pack>/sub-verticals/<sv> as sub-vertical detail", () => {
        const state = parseKnowledgeRoute("/knowledge/cpg-fmcg/sub-verticals/supply-chain");
        expect(state.section).toBe("sub-verticals");
        expect(state.subVertical).toBe("supply-chain");
    });

    it("falls back to overview for unknown section segments", () => {
        const state = parseKnowledgeRoute("/knowledge/cpg-fmcg/not-a-real-section");
        expect(state.section).toBe("overview");
    });
});
