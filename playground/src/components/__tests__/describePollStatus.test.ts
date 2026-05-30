// playground/src/components/__tests__/describePollStatus.test.ts
//
// Coverage for the upstream-poll-status → loading-message mapper used by
// the UnifiedAssistantSurface's "polling" state. Live-smoke 2026-05-14
// showed users thought the proxy was hung when the warehouse cold-started
// (~40 s PENDING_WAREHOUSE wait); this helper turns each upstream state
// into a sympathetic, specific loading line + an optional "typical wait"
// hint.

import { describe, it, expect } from "vitest";
import { describePollStatus } from "../UnifiedAssistantSurface";

describe("describePollStatus", () => {
    it("returns null for undefined / null / empty input (caller falls back to 'Thinking…')", () => {
        expect(describePollStatus(undefined)).toBeNull();
        expect(describePollStatus("")).toBeNull();
    });

    it("returns null for unknown statuses so the caller can fall back", () => {
        expect(describePollStatus("UNKNOWN_STATE")).toBeNull();
        expect(describePollStatus("WAITING")).toBeNull();
    });

    it("returns null for terminal statuses (caller stops showing pending)", () => {
        expect(describePollStatus("COMPLETED")).toBeNull();
        expect(describePollStatus("FAILED")).toBeNull();
    });

    it("PENDING_WAREHOUSE surfaces the warehouse cold-start hint", () => {
        const d = describePollStatus("PENDING_WAREHOUSE");
        expect(d).not.toBeNull();
        expect(d!.label).toMatch(/warming/i);
        expect(d!.hint).toMatch(/30-60/);
        expect(d!.hint).toMatch(/cluster/i);
    });

    it("STARTING is treated as warehouse cold-start (same hint)", () => {
        const d = describePollStatus("STARTING");
        expect(d!.label).toMatch(/warming/i);
        expect(d!.hint).toBeTruthy();
    });

    it("ASKING_AI and PENDING render the 'asking the AI' label without an extra hint", () => {
        expect(describePollStatus("ASKING_AI")?.label).toMatch(/asking the ai/i);
        expect(describePollStatus("ASKING_AI")?.hint).toBeUndefined();
        expect(describePollStatus("PENDING")?.label).toMatch(/asking the ai/i);
    });

    it("EXECUTING_QUERY and RUNNING_QUERY both map to 'running the SQL'", () => {
        expect(describePollStatus("EXECUTING_QUERY")?.label).toMatch(/running the sql/i);
        expect(describePollStatus("RUNNING_QUERY")?.label).toMatch(/running the sql/i);
    });

    it("SUMMARIZING and NARRATING map to 'writing the narrative'", () => {
        expect(describePollStatus("SUMMARIZING")?.label).toMatch(/narrative/i);
        expect(describePollStatus("NARRATING")?.label).toMatch(/narrative/i);
    });

    it("FETCHING_METADATA surfaces a metadata-specific label", () => {
        expect(describePollStatus("FETCHING_METADATA")?.label).toMatch(/metadata/i);
    });

    it("status comparison is case-insensitive (proxy lowercases for some routes)", () => {
        expect(describePollStatus("pending_warehouse")?.label).toMatch(/warming/i);
        expect(describePollStatus("Executing_Query")?.label).toMatch(/running/i);
    });
});
