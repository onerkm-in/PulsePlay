// playground/src/lib/__tests__/usageTracker.test.ts
//
// usageTracker — session-wide token accounting for the SustainabilityIndicator.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    recordResponse,
    getSessionUsage,
    subscribeUsage,
    resetSessionUsage,
    tierLabel,
    tierColor,
    tierEmoji,
    tierFace,
    tierTagline,
    __resetUsageTrackerForTests,
    TIER_THRESHOLDS,
} from "../usageTracker";

beforeEach(() => {
    __resetUsageTrackerForTests();
});

/* ─── recordResponse — real usage block ─────────────────────────────── */

describe("recordResponse — real usage block (OpenAI shape)", () => {
    it("records prompt_tokens + completion_tokens from OpenAI", () => {
        const u = recordResponse({
            usage: { prompt_tokens: 1000, completion_tokens: 200 },
        });
        expect(u.inputTokens).toBe(1000);
        expect(u.outputTokens).toBe(200);
        expect(u.totalTokens).toBe(1200);
        expect(u.questionCount).toBe(1);
        expect(u.hasRealData).toBe(true);
        expect(u.hasEstimates).toBe(false);
    });

    it("records input_tokens + output_tokens from Anthropic shape", () => {
        const u = recordResponse({
            usage: { input_tokens: 500, output_tokens: 150 },
        });
        expect(u.inputTokens).toBe(500);
        expect(u.outputTokens).toBe(150);
        expect(u.totalTokens).toBe(650);
        expect(u.hasRealData).toBe(true);
    });

    it("falls back to total_tokens with 70/30 split when input/output absent", () => {
        const u = recordResponse({ usage: { total_tokens: 1000 } });
        expect(u.inputTokens).toBe(700);
        expect(u.outputTokens).toBe(300);
        expect(u.totalTokens).toBe(1000);
        expect(u.hasRealData).toBe(true);
    });

    it("rejects negative or NaN token counts (defensive)", () => {
        const u = recordResponse({ usage: { prompt_tokens: -5, completion_tokens: NaN } });
        // Both invalid → both 0 → falls through to texts (also absent) → all 0.
        expect(u.totalTokens).toBe(0);
        // No question recorded as no real OR estimated tokens accrued? Actually
        // the question count IS incremented regardless — that's intentional so
        // a "free" response still counts as a turn.
        expect(u.questionCount).toBe(1);
    });
});

/* ─── recordResponse — text estimation ──────────────────────────────── */

describe("recordResponse — heuristic estimation from text", () => {
    it("estimates input + output tokens from text length (chars/4)", () => {
        // 400-char system + 100-char question + 200-char response
        // → input ≈ (400+100)/4 = 125; output ≈ 200/4 = 50
        const u = recordResponse({
            texts: {
                systemPrompt: "a".repeat(400),
                userQuestion: "b".repeat(100),
                response: "c".repeat(200),
            },
        });
        expect(u.inputTokens).toBe(125);
        expect(u.outputTokens).toBe(50);
        expect(u.totalTokens).toBe(175);
        expect(u.hasRealData).toBe(false);
        expect(u.hasEstimates).toBe(true);
    });

    it("handles missing text fields without crashing", () => {
        const u = recordResponse({ texts: { response: "answer" } });
        // input from sys+question = 0; output = 6/4 = 2 (Math.ceil)
        expect(u.inputTokens).toBe(0);
        expect(u.outputTokens).toBe(2);
        expect(u.hasEstimates).toBe(true);
    });

    it("real usage block wins over texts when both are provided", () => {
        const u = recordResponse({
            usage: { prompt_tokens: 999, completion_tokens: 1 },
            texts: {
                systemPrompt: "should-be-ignored".repeat(200),
                response: "ignored".repeat(200),
            },
        });
        expect(u.inputTokens).toBe(999);
        expect(u.outputTokens).toBe(1);
        expect(u.hasRealData).toBe(true);
        expect(u.hasEstimates).toBe(false);
    });
});

/* ─── Mixed mode ────────────────────────────────────────────────────── */

describe("recordResponse — mixed real + estimated entries", () => {
    it("tracks hasRealData + hasEstimates flags across entries", () => {
        recordResponse({ usage: { prompt_tokens: 500, completion_tokens: 100 } });
        recordResponse({ texts: { userQuestion: "q".repeat(40), response: "r".repeat(40) } });
        const u = getSessionUsage();
        expect(u.hasRealData).toBe(true);
        expect(u.hasEstimates).toBe(true);
        expect(u.questionCount).toBe(2);
    });
});

/* ─── Tier computation ──────────────────────────────────────────────── */

describe("tier transitions", () => {
    it("starts at 'ready' with 0 tokens", () => {
        expect(getSessionUsage().tier).toBe("ready");
    });

    it("transitions to 'lean' when totalTokens ≤ LEAN threshold", () => {
        recordResponse({ usage: { prompt_tokens: TIER_THRESHOLDS.LEAN - 100, completion_tokens: 0 } });
        expect(getSessionUsage().tier).toBe("lean");
    });

    it("transitions to 'green' at LEAN+1 .. GREEN range", () => {
        recordResponse({ usage: { prompt_tokens: TIER_THRESHOLDS.LEAN + 1, completion_tokens: 0 } });
        expect(getSessionUsage().tier).toBe("green");
    });

    it("transitions to 'moderate' beyond GREEN", () => {
        recordResponse({ usage: { prompt_tokens: TIER_THRESHOLDS.GREEN + 1, completion_tokens: 0 } });
        expect(getSessionUsage().tier).toBe("moderate");
    });

    it("transitions to 'heavy' beyond MODERATE", () => {
        recordResponse({ usage: { prompt_tokens: TIER_THRESHOLDS.MODERATE + 1, completion_tokens: 0 } });
        expect(getSessionUsage().tier).toBe("heavy");
    });

    it("transitions to 'very-heavy' beyond HEAVY", () => {
        recordResponse({ usage: { prompt_tokens: TIER_THRESHOLDS.HEAVY + 1, completion_tokens: 0 } });
        expect(getSessionUsage().tier).toBe("very-heavy");
    });
});

/* ─── Subscribe + reset ─────────────────────────────────────────────── */

describe("subscribeUsage / resetSessionUsage", () => {
    it("fires subscribers on every recordResponse", () => {
        const handler = vi.fn();
        const unsubscribe = subscribeUsage(handler);
        try {
            recordResponse({ usage: { prompt_tokens: 100, completion_tokens: 50 } });
            recordResponse({ usage: { prompt_tokens: 200, completion_tokens: 100 } });
            expect(handler).toHaveBeenCalledTimes(2);
            expect(handler.mock.calls[1][0].totalTokens).toBe(450);
        } finally {
            unsubscribe();
        }
    });

    it("unsubscribed listeners stop firing", () => {
        const handler = vi.fn();
        const unsubscribe = subscribeUsage(handler);
        unsubscribe();
        recordResponse({ usage: { prompt_tokens: 100, completion_tokens: 50 } });
        expect(handler).not.toHaveBeenCalled();
    });

    it("resetSessionUsage zeros every counter and notifies listeners", () => {
        const handler = vi.fn();
        const unsubscribe = subscribeUsage(handler);
        try {
            recordResponse({ usage: { prompt_tokens: 5000, completion_tokens: 2000 } });
            expect(getSessionUsage().totalTokens).toBe(7000);
            resetSessionUsage();
            const u = getSessionUsage();
            expect(u.totalTokens).toBe(0);
            expect(u.questionCount).toBe(0);
            expect(u.tier).toBe("ready");
            expect(u.hasRealData).toBe(false);
            expect(u.hasEstimates).toBe(false);
            expect(handler).toHaveBeenLastCalledWith(expect.objectContaining({ totalTokens: 0 }));
        } finally {
            unsubscribe();
        }
    });
});

/* ─── Tier display helpers ──────────────────────────────────────────── */

describe("tier display helpers", () => {
    it("tierLabel returns human-readable labels", () => {
        expect(tierLabel("ready")).toBe("Ready");
        expect(tierLabel("lean")).toBe("Lean");
        expect(tierLabel("very-heavy")).toBe("Very heavy");
    });

    it("tierColor returns CSS color hints", () => {
        expect(tierColor("lean")).toMatch(/var\(--pp-leaf-lean/);
        expect(tierColor("very-heavy")).toMatch(/var\(--pp-leaf-very-heavy/);
    });

    it("tierEmoji returns leaf emoji per tier", () => {
        expect(tierEmoji("ready")).toBe("🌱");
        expect(tierEmoji("lean")).toBe("🍃");
        expect(tierEmoji("very-heavy")).toBe("🍁");
    });

    it("tierFace returns expressive face per tier", () => {
        expect(tierFace("lean")).toBe("😄");
        expect(tierFace("very-heavy")).toBe("☹️");
    });

    it("tierTagline returns the brand-message line", () => {
        expect(tierTagline("ready")).toMatch(/Ready/);
        expect(tierTagline("lean")).toMatch(/best of both worlds|Lean and mean/);
        expect(tierTagline("very-heavy")).toMatch(/fresh conversation/);
    });
});
