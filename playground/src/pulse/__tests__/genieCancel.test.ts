// playground/src/pulse/__tests__/genieCancel.test.ts
//
// Guards the Genie poll-loop cancellation fix (genie.ts waitForMessageWithProgress).
//
// Defect: the recursive poll()/pollDirect() had no cancellation check. cancel()
// aborts in-flight XHRs, but during the inter-poll sleep (sleepThenAdvance) there
// is NO XHR in flight — so a cancel() landing in that window let the loop wake up
// and fire ONE more request before the 5-min deadline finally stopped it. The
// GenieClient is reused per space (clientMap in visual.tsx) and cancel() is called
// on that shared ref, so this is a real dangling-XHR on every Stop-during-sleep.
//
// Fix: a per-client cancel EPOCH, snapshotted per wait cycle and checked at the
// top of each poll() / pollDirect() iteration. Reuse- and overlap-safe (a plain
// boolean would either permanently cancel the reused client or re-enable a
// just-cancelled loop when the next send starts mid-sleep).
//
// These tests use fake timers + a mocked transport — no live Genie needed.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GenieClient } from "../genie";

function makeProxyClient(): GenieClient {
    // Minimal proxy-mode config; force proxy mode so the loop uses this.request.
    const client = new GenieClient({
        apiBaseUrl: "/api",
        assistantProfile: "default",
        spaceId: "s1",
    } as unknown as ConstructorParameters<typeof GenieClient>[0]);
    (client as unknown as { isDirectMode: () => boolean }).isDirectMode = () => false;
    return client;
}

describe("GenieClient.cancel() stops the poll loop without a trailing XHR", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("a cancel() during the inter-poll sleep fires NO further request (fails-on-old)", async () => {
        const client = makeProxyClient();
        const requestSpy = vi.fn().mockResolvedValue({ status: "IN_PROGRESS" });
        (client as unknown as { request: unknown }).request = requestSpy;

        const p = client.waitForMessageWithProgress("conv-1", "msg-1");
        p.catch(() => { /* cancellation rejects the wait; swallow */ });

        // poll() fires its first request synchronously, then awaits + sleeps.
        expect(requestSpy).toHaveBeenCalledTimes(1);

        // Cancel during the sleep window — no XHR is in flight to abort, so only
        // the epoch guard can stop the next iteration.
        client.cancel();

        // Drain the pending sleep + any recursion. The guard must prevent req #2.
        await vi.advanceTimersByTimeAsync(10_000);
        expect(requestSpy).toHaveBeenCalledTimes(1);
    });

    it("a NEW wait after cancel() still polls — reuse-safe (guards the naive-boolean regression)", async () => {
        const client = makeProxyClient();
        const requestSpy = vi.fn().mockResolvedValue({ status: "IN_PROGRESS" });
        (client as unknown as { request: unknown }).request = requestSpy;

        // Run A on the (reused) client, then cancel it mid-sleep.
        const a = client.waitForMessageWithProgress("conv-A", "msg-A");
        a.catch(() => {});
        client.cancel();
        await vi.advanceTimersByTimeAsync(10_000);
        const callsAfterA = requestSpy.mock.calls.length;

        // Run B on the SAME instance must poll again — NOT be permanently cancelled.
        const b = client.waitForMessageWithProgress("conv-B", "msg-B");
        b.catch(() => {});
        expect(requestSpy.mock.calls.length).toBe(callsAfterA + 1);
    });
});
