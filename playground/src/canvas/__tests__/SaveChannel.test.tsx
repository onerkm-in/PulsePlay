import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SaveChannel } from "../SaveChannel";
import type { EligibleSection } from "../canvasTypes";

const eligible: EligibleSection = {
    type: "decision_prompt",
    title: "OTIF below target",
    source: { surface: "action-insights", prompt_id: "pp_1" },
    provenance: { data_as_of: "2026-07-23" },
};

function sectionResponse(overrides: Record<string, unknown> = {}) {
    return {
        ok: true,
        section: {
            section_id: "sec_1", version: 0, owner_actor_id: "dev|dev|u", schema_version: 1,
            type: "decision_prompt", title: "OTIF below target",
            source: eligible.source, provenance: { content_hash: "h", classification: "internal", filters: {} },
            state: { lifecycle: "active", freshness: "current", save_state: "pinned", emphasis: "normal" },
            capabilities: {}, layout: { order: 0 }, created_at: "", updated_at: "",
            ...overrides,
        },
        deduped: false,
    };
}

describe("SaveChannel uniform save affordance", () => {
    beforeEach(() => window.localStorage.clear());
    afterEach(() => { cleanup(); vi.restoreAllMocks(); });

    test("opens the overflow menu with all save actions", () => {
        render(<SaveChannel eligible={eligible} />);
        fireEvent.click(screen.getByRole("button", { name: /save section/i }));
        expect(screen.getByRole("button", { name: /Pin to Canvas/i })).toBeTruthy();
        expect(screen.getByRole("button", { name: /Bookmark/i })).toBeTruthy();
        expect(screen.getByRole("button", { name: /Add note/i })).toBeTruthy();
        expect(screen.getByRole("button", { name: /Highlight/i })).toBeTruthy();
        expect(screen.getByRole("button", { name: /Capture snapshot/i })).toBeTruthy();
    });

    test("Pin creates a server section and reflects the saved state", async () => {
        const fetchMock = vi.fn(async () => ({ ok: true, json: async () => sectionResponse() })) as unknown as typeof fetch;
        vi.stubGlobal("fetch", fetchMock);
        render(<SaveChannel eligible={eligible} />);
        fireEvent.click(screen.getByRole("button", { name: /save section/i }));
        fireEvent.click(screen.getByRole("button", { name: /Pin to Canvas/i }));
        await waitFor(() => expect(screen.getByText(/Pinned to Canvas/i)).toBeTruthy());
        // the POST body carries the governed descriptor, not rows/SQL
        const call = fetchMock.mock.calls[0];
        expect(String(call[0])).toMatch(/\/decision-canvas\/sections$/);
        const sent = JSON.parse((call[1] as RequestInit).body as string);
        expect(sent.section.source.prompt_id).toBe("pp_1");
        expect(sent.save_op).toBe("pin");
        expect(JSON.stringify(sent)).not.toMatch(/rows|sqlQuery|SELECT/i);
    });

    test("a failed save surfaces an error and keeps the control usable", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: "boom" }) })) as unknown as typeof fetch);
        render(<SaveChannel eligible={eligible} />);
        fireEvent.click(screen.getByRole("button", { name: /save section/i }));
        fireEvent.click(screen.getByRole("button", { name: /Pin to Canvas/i }));
        await waitFor(() => expect(screen.getByText(/boom/i)).toBeTruthy());
    });
});
