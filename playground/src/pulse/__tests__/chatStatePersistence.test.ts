import { describe, expect, it } from "vitest";
import {
    __buildPulseChatStateSnapshotForTest,
    __parsePulseChatStateSnapshotForTest,
} from "../visual";

describe("Pulse Ask Pulse chat state persistence", () => {
    it("persists conversation ids and terminal chat turns for the active connection context", () => {
        const snapshot = __buildPulseChatStateSnapshotForTest(
            "proxy||/api",
            { space1: "conv-123", space9: "conv-ignored", rogue: "conv-rogue" },
            {
                space1: [
                    { id: "user-1", role: "user", status: "COMPLETED", content: "What is sales?" },
                    {
                        id: "assistant-1",
                        role: "assistant",
                        status: "COMPLETED",
                        content: "Sales are 42.",
                        sourceQuestion: "What is sales?",
                        viewMode: "chart",
                        queryResult: {
                            columns: ["Category", "Sales"],
                            rows: Array.from({ length: 60 }, (_, index) => [`C${index}`, index]),
                        },
                    },
                    { id: "pending-1", role: "assistant", status: "RUNNING", content: "Still thinking..." },
                    { id: "system-1", role: "system", status: "COMPLETED", content: "Internal note" },
                ],
            },
        );

        expect(snapshot?.conversationMap).toEqual({ space1: "conv-123", space9: "conv-ignored" });
        expect(snapshot?.messageMap.space1).toHaveLength(2);
        expect(snapshot?.messageMap.space1?.[1].queryResult?.rows).toHaveLength(50);

        const restored = __parsePulseChatStateSnapshotForTest(JSON.stringify(snapshot), "proxy||/api");
        expect(restored?.conversationMap.space1).toBe("conv-123");
        expect(restored?.messageMap.space1?.map(message => message.id)).toEqual(["user-1", "assistant-1"]);
    });

    it("rejects snapshots from another connection context or an expired session", () => {
        const snapshot = __buildPulseChatStateSnapshotForTest(
            "proxy||/api",
            { space1: "conv-123" },
            { space1: [{ id: "user-1", role: "user", status: "COMPLETED", content: "Hi" }] },
        );

        expect(__parsePulseChatStateSnapshotForTest(JSON.stringify(snapshot), "direct|https://example|/api")).toBeNull();

        const expired = { ...snapshot, savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 };
        expect(__parsePulseChatStateSnapshotForTest(JSON.stringify(expired), "proxy||/api")).toBeNull();
    });
});
