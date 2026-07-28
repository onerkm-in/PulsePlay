import { describe, expect, it } from "vitest";
import { enforceStageScope } from "../contentSanitizer";

/**
 * Regression pin for the multi-section batch drop found 2026-07-28.
 *
 * The staged planner batches sections (shipped "balanced" cadence = batchSize 2),
 * so a stage legitimately asks for "## KPI SNAPSHOT" AND "## TRENDS" in one
 * Genie call. The call site scoped the response to titles[index].split(" + ")[0]
 * — the FIRST title only — so every later section the model produced was
 * deleted after we had already paid to generate it. On the default cadence that
 * silently lost TRENDS and RECOMMENDED ACTIONS; on "quick" (batchSize 3) it lost
 * two sections of every three.
 */
const TWO_SECTION_RESPONSE = [
    "## KPI SNAPSHOT",
    "| KPI | Current | Prior |",
    "| --- | --- | --- |",
    "| Net Sales | $1.99 B | $1.90 B |",
    "",
    "## TRENDS",
    "- **Net Sales:** up 4.89 % versus the prior half.",
].join("\n");

describe("enforceStageScope keeps every requested section", () => {
    it("keeps both sections of a two-section batch", () => {
        const out = enforceStageScope(TWO_SECTION_RESPONSE, ["KPI SNAPSHOT", "TRENDS"]);
        expect(out).toContain("## KPI SNAPSHOT");
        expect(out).toContain("## TRENDS");
        expect(out).toContain("up 4.89 %");
    });

    it("keeps all three sections of a quick-cadence batch", () => {
        const three = `${TWO_SECTION_RESPONSE}\n\n## RISKS\n- Concentration in one market.`;
        const out = enforceStageScope(three, ["KPI SNAPSHOT", "TRENDS", "RISKS"]);
        expect(out).toContain("## KPI SNAPSHOT");
        expect(out).toContain("## TRENDS");
        expect(out).toContain("## RISKS");
    });

    it("still drops genuinely unrequested over-production", () => {
        // the original purpose: an agent dumping a full essay under one heading
        const out = enforceStageScope(TWO_SECTION_RESPONSE, ["KPI SNAPSHOT"]);
        expect(out).toContain("## KPI SNAPSHOT");
        expect(out).not.toContain("## TRENDS");
    });

    it("preserves document order regardless of the order requested", () => {
        const out = enforceStageScope(TWO_SECTION_RESPONSE, ["TRENDS", "KPI SNAPSHOT"]);
        expect(out.indexOf("## KPI SNAPSHOT")).toBeLessThan(out.indexOf("## TRENDS"));
    });

    it("is unchanged for a single-section response", () => {
        const one = "## HEADLINE\nNet sales rose 4.89 %.";
        expect(enforceStageScope(one, ["HEADLINE"])).toBe(one);
    });

    it("returns content untouched when nothing matches", () => {
        expect(enforceStageScope(TWO_SECTION_RESPONSE, ["NOT A SECTION"])).toBe(TWO_SECTION_RESPONSE);
    });

    it("accepts a bare string for backward compatibility", () => {
        const out = enforceStageScope(TWO_SECTION_RESPONSE, "KPI SNAPSHOT");
        expect(out).toContain("## KPI SNAPSHOT");
        expect(out).not.toContain("## TRENDS");
    });

    it("keeps pre-heading prose", () => {
        const withPre = `Some lead-in.\n\n${TWO_SECTION_RESPONSE}`;
        const out = enforceStageScope(withPre, ["KPI SNAPSHOT", "TRENDS"]);
        expect(out.startsWith("Some lead-in.")).toBe(true);
        expect(out).toContain("## TRENDS");
    });
});
