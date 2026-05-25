// playground/src/components/__tests__/TrustBadge.test.tsx
//
// Thread B — visual + a11y contract for the chat-side trust badge.
// Covers:
//   • Renders the correct label per status
//   • Carries an accessible aria-label
//   • Includes the per-status tooltip in the title attribute
//   • statusReason is appended to the tooltip when present
//   • data-status attribute matches the status for test queries
//
// Uses vanilla DOM assertions (the playground's vitest setup does NOT
// load @testing-library/jest-dom matchers — see vitest.setup.ts).

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TrustBadge } from "../TrustBadge";

afterEach(() => cleanup());

describe("TrustBadge", () => {
    it("renders 'Verified' label for verified status", () => {
        render(<TrustBadge status="verified" />);
        const badge = screen.getByTestId("trust-badge");
        expect(badge.textContent).toBe("Verified");
        expect(badge.getAttribute("data-status")).toBe("verified");
    });

    it("renders 'Grounded draft' for grounded-draft status", () => {
        render(<TrustBadge status="grounded-draft" />);
        expect(screen.getByTestId("trust-badge").textContent).toBe("Grounded draft");
    });

    it("renders 'Suggestion' for suggestion status", () => {
        render(<TrustBadge status="suggestion" />);
        expect(screen.getByTestId("trust-badge").textContent).toBe("Suggestion");
    });

    it("renders 'Blocked' for blocked status", () => {
        render(<TrustBadge status="blocked" />);
        expect(screen.getByTestId("trust-badge").textContent).toBe("Blocked");
    });

    it("carries an accessible aria-label", () => {
        render(<TrustBadge status="verified" />);
        const badge = screen.getByTestId("trust-badge");
        expect(badge.getAttribute("aria-label")).toBe("Answer status: Verified");
        expect(badge.getAttribute("role")).toBe("status");
    });

    it("appends statusReason to the title tooltip for blocked entries", () => {
        render(<TrustBadge status="blocked" statusReason="Ungrounded chart payload." />);
        const badge = screen.getByTestId("trust-badge");
        const title = badge.getAttribute("title") || "";
        expect(title).toContain("Refused");
        expect(title).toContain("Ungrounded chart payload.");
    });

    it("omits the reason line when statusReason is absent", () => {
        render(<TrustBadge status="verified" />);
        const badge = screen.getByTestId("trust-badge");
        const title = badge.getAttribute("title") || "";
        expect(title).toContain("Backed by executed SQL");
        expect(title.includes("\n")).toBe(false);
    });
});
