// playground/src/components/__tests__/AISidebar.test.tsx
//
// Cycle C v0.5 frontend test — submit -> poll -> render lifecycle for the
// AISidebar. We avoid @testing-library/react (not in deps) and drive the
// component with React's own act() + react-dom/client. fetch is mocked
// per test; vi.useFakeTimers() drives the polling cadence deterministically.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AISidebar, MAX_POLL_DURATION_MS, POLL_INTERVAL_MS } from "../AISidebar";
import type { PackSelection } from "../PackPicker";

interface MountState {
    container: HTMLElement;
    root: Root;
}

function mount(ui: React.ReactNode): MountState {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(ui); });
    return { container, root };
}

function unmount(state: MountState) {
    act(() => { state.root.unmount(); });
    state.container.remove();
}

/** Simulate user typing into the textarea + clicking Ask.
 *
 * React 19's controlled-input value tracker hooks the prototype's `value`
 * setter. Direct assignment (`textarea.value = text`) bypasses that hook,
 * so React thinks nothing changed and `question` state stays empty — which
 * leaves the Ask button disabled (`disabled={!question.trim()}`) and the
 * click is a no-op. We invoke the prototype setter explicitly so the
 * tracker fires. */
async function ask(state: MountState, text: string) {
    const textarea = state.container.querySelector("textarea") as HTMLTextAreaElement;
    const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
    )?.set;
    await act(async () => {
        nativeSetter?.call(textarea, text);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const askBtn = state.container.querySelector(".pp-ai-sidebar__ask") as HTMLButtonElement;
    await act(async () => {
        askBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

/** Build a fetch Response-like object the component can consume. */
function jsonResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    } as unknown as Response;
}

describe("AISidebar", () => {
    let originalFetch: typeof fetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.useRealTimers();
        document.body.innerHTML = "";
    });

    it("renders empty initial state", () => {
        const state = mount(
            <AISidebar
                activeVendor="generic-iframe"
                activeConnector=""
                recentEvents={[]}
            />,
        );
        expect(state.container.querySelector(".pp-ai-sidebar__title")?.textContent).toBe("AI Assistant");
        // No history entries.
        expect(state.container.querySelectorAll(".pp-ai-sidebar__entry").length).toBe(0);
        unmount(state);
    });

    it("includes pack and subVertical in the request body", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse({ status: "COMPLETED", content: "hi" }),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const pack: PackSelection = { pack: "cpg-fmcg", subVertical: "supply-chain" };
        const state = mount(
            <AISidebar
                activeVendor="generic-iframe"
                activeConnector="genie-default"
                recentEvents={[]}
                packSelection={pack}
            />,
        );
        await ask(state, "what is OTIF?");

        expect(fetchMock).toHaveBeenCalled();
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/assistant/conversations/start");
        const body = JSON.parse((init as RequestInit).body as string);
        expect(body.pack).toBe("cpg-fmcg");
        expect(body.subVertical).toBe("supply-chain");
        expect(body.assistantProfile).toBe("genie-default");
        expect(body.content).toContain("[Question]");
        expect(body.content).toContain("what is OTIF?");
        unmount(state);
    });

    it("renders answer immediately when start returns COMPLETED (no polling)", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse({
                status: "COMPLETED",
                content: "OTIF means On-Time-In-Full.",
                sqlQuery: "SELECT 1",
                queryResult: { columns: ["a"], rows: [[1]] },
                rows_returned: 1,
                execution_time_ms: 42,
            }),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const state = mount(
            <AISidebar activeVendor="generic-iframe" activeConnector="genie" recentEvents={[]} />,
        );
        await ask(state, "explain OTIF");
        // Allow microtasks to flush.
        await act(async () => { await Promise.resolve(); });

        expect(fetchMock).toHaveBeenCalledTimes(1); // start only, no polling
        const entry = state.container.querySelector(".pp-ai-sidebar__entry") as HTMLElement;
        expect(entry.dataset.status).toBe("completed");
        expect(entry.textContent).toContain("OTIF means On-Time-In-Full.");
        // SQL details should be present.
        expect(entry.querySelector(".pp-ai-sidebar__sql")).not.toBeNull();
        // Result table.
        expect(entry.querySelector(".pp-ai-sidebar__result table")).not.toBeNull();
        unmount(state);
    });

    it("polls when start returns IN_PROGRESS and finalizes on COMPLETED", async () => {
        vi.useFakeTimers();
        let pollCalls = 0;
        const fetchMock = vi.fn().mockImplementation(async (url: string) => {
            if (url === "/api/assistant/conversations/start") {
                return jsonResponse({
                    status: "IN_PROGRESS",
                    conversation_id: "c1",
                    message_id: "m1",
                });
            }
            // Polling endpoint.
            pollCalls += 1;
            if (pollCalls < 2) {
                return jsonResponse({
                    status: "IN_PROGRESS",
                    conversation_id: "c1",
                    message_id: "m1",
                });
            }
            return jsonResponse({
                status: "COMPLETED",
                conversation_id: "c1",
                message_id: "m1",
                content: "the answer",
            });
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const state = mount(
            <AISidebar activeVendor="generic-iframe" activeConnector="genie" recentEvents={[]} />,
        );
        await ask(state, "long-running question");
        // Flush start-response microtasks.
        await act(async () => { await Promise.resolve(); });
        // Component fires one immediate poll on transition; flush it.
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });

        // Status should now be polling (still IN_PROGRESS after first immediate tick).
        let entry = state.container.querySelector(".pp-ai-sidebar__entry") as HTMLElement;
        expect(entry.dataset.status).toBe("polling");

        // Advance time one interval -> second poll resolves to COMPLETED.
        await act(async () => {
            vi.advanceTimersByTime(POLL_INTERVAL_MS);
        });
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });

        entry = state.container.querySelector(".pp-ai-sidebar__entry") as HTMLElement;
        expect(entry.dataset.status).toBe("completed");
        expect(entry.textContent).toContain("the answer");
        unmount(state);
    });

    it("renders error state when polling returns FAILED", async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn().mockImplementation(async (url: string) => {
            if (url === "/api/assistant/conversations/start") {
                return jsonResponse({
                    status: "IN_PROGRESS",
                    conversation_id: "c1",
                    message_id: "m1",
                });
            }
            return jsonResponse({
                status: "FAILED",
                conversation_id: "c1",
                message_id: "m1",
                error: "Genie blew up",
            });
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const state = mount(
            <AISidebar activeVendor="generic-iframe" activeConnector="genie" recentEvents={[]} />,
        );
        await ask(state, "broken q");
        await act(async () => { await Promise.resolve(); });
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });

        const entry = state.container.querySelector(".pp-ai-sidebar__entry") as HTMLElement;
        expect(entry.dataset.status).toBe("failed");
        expect(entry.textContent).toContain("Genie blew up");
        unmount(state);
    });

    it("times out after MAX_POLL_DURATION_MS", async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn().mockImplementation(async (url: string) => {
            if (url === "/api/assistant/conversations/start") {
                return jsonResponse({
                    status: "IN_PROGRESS",
                    conversation_id: "c1",
                    message_id: "m1",
                });
            }
            return jsonResponse({
                status: "IN_PROGRESS",
                conversation_id: "c1",
                message_id: "m1",
            });
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const state = mount(
            <AISidebar activeVendor="generic-iframe" activeConnector="genie" recentEvents={[]} />,
        );
        await ask(state, "q that hangs");
        await act(async () => { await Promise.resolve(); });

        // Advance well past the deadline. The component checks elapsed
        // against Date.now() which fake timers also drive forward.
        await act(async () => {
            vi.advanceTimersByTime(MAX_POLL_DURATION_MS + POLL_INTERVAL_MS * 2);
        });
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });

        const entry = state.container.querySelector(".pp-ai-sidebar__entry") as HTMLElement;
        expect(entry.dataset.status).toBe("failed");
        expect(entry.textContent?.toLowerCase()).toContain("timeout");
        unmount(state);
    });

    it("Stop button cancels in-flight polling", async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn().mockImplementation(async (url: string) => {
            if (url === "/api/assistant/conversations/start") {
                return jsonResponse({
                    status: "IN_PROGRESS",
                    conversation_id: "c1",
                    message_id: "m1",
                });
            }
            return jsonResponse({
                status: "IN_PROGRESS",
                conversation_id: "c1",
                message_id: "m1",
            });
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const state = mount(
            <AISidebar activeVendor="generic-iframe" activeConnector="genie" recentEvents={[]} />,
        );
        await ask(state, "q");
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });

        // Per-entry Stop button.
        const stopBtn = state.container.querySelector('[data-testid^="pp-ai-stop-"]') as HTMLButtonElement;
        expect(stopBtn).not.toBeNull();
        await act(async () => {
            stopBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const entry = state.container.querySelector(".pp-ai-sidebar__entry") as HTMLElement;
        expect(entry.dataset.status).toBe("failed");
        expect(entry.textContent).toContain("stopped by user");
        unmount(state);
    });

    it("renders the pack-context indicator when packSelection is set", () => {
        const state = mount(
            <AISidebar
                activeVendor="generic-iframe"
                activeConnector="genie"
                recentEvents={[]}
                packSelection={{ pack: "cpg-fmcg", subVertical: "supply-chain" }}
            />,
        );
        const indicator = state.container.querySelector(
            '[data-testid="pp-ai-sidebar-pack-indicator"]',
        ) as HTMLElement;
        expect(indicator).not.toBeNull();
        expect(indicator.textContent).toContain("cpg-fmcg");
        expect(indicator.textContent).toContain("supply-chain");
        unmount(state);
    });

    it("renders the no-pack indicator when packSelection is null", () => {
        const state = mount(
            <AISidebar
                activeVendor="generic-iframe"
                activeConnector="genie"
                recentEvents={[]}
                packSelection={null}
            />,
        );
        const indicator = state.container.querySelector(
            '[data-testid="pp-ai-sidebar-pack-indicator"]',
        ) as HTMLElement;
        expect(indicator.textContent?.toLowerCase()).toContain("none");
        unmount(state);
    });

    it("does not include pack/subVertical in body when packSelection is undefined", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse({ status: "COMPLETED", content: "hi" }),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const state = mount(
            <AISidebar activeVendor="generic-iframe" activeConnector="genie" recentEvents={[]} />,
        );
        await ask(state, "q");
        await act(async () => { await Promise.resolve(); });

        const [, init] = fetchMock.mock.calls[0];
        const body = JSON.parse((init as RequestInit).body as string);
        expect(body.pack).toBeUndefined();
        expect(body.subVertical).toBeUndefined();
        unmount(state);
    });
});
