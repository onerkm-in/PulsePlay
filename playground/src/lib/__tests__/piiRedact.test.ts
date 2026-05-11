// Tests for the PII redaction utility. Defence-in-depth for the
// `sendContextToGenie` toggle — see docs/SECURITY_ARCHITECTURE.md § 6.1.

import { describe, it, expect } from "vitest";
import { redactPiiFromString, redactPiiFromValue } from "../piiRedact";

describe("redactPiiFromString", () => {
    it("returns the input unchanged when no PII pattern matches", () => {
        const r = redactPiiFromString("Q3 revenue for the East region was $1,200,000");
        expect(r.value).toBe("Q3 revenue for the East region was $1,200,000");
        expect(r.matches).toEqual([]);
    });

    it("redacts email addresses", () => {
        const r = redactPiiFromString("Owner: jane.doe@example.com (escalate to admin@example.com)");
        expect(r.value).toContain("[EMAIL]");
        expect(r.value).not.toContain("jane.doe@example.com");
        expect(r.value).not.toContain("admin@example.com");
        expect(r.matches.filter(m => m.kind === "email")).toHaveLength(2);
    });

    it("redacts US SSN format", () => {
        const r = redactPiiFromString("Customer SSN: 123-45-6789");
        expect(r.value).toBe("Customer SSN: [SSN]");
        expect(r.matches[0].kind).toBe("ssn-us");
    });

    it("redacts credit-card-shaped digit runs", () => {
        const r = redactPiiFromString("Card on file: 4111 1111 1111 1111");
        expect(r.value).toContain("[CARD]");
        expect(r.value).not.toContain("4111 1111");
    });

    it("redacts phone numbers", () => {
        const r = redactPiiFromString("Call us: +1 415-555-0142 or 02012345678");
        expect(r.value).toContain("[PHONE]");
        expect(r.value).not.toContain("415-555-0142");
    });

    it("redacts IBAN-shaped strings", () => {
        const r = redactPiiFromString("Wire to GB82WEST12345698765432");
        expect(r.value).toContain("[IBAN]");
        expect(r.value).not.toContain("GB82WEST");
    });

    it("redacts API-key-ish long alphanumeric tokens", () => {
        const r = redactPiiFromString("Token: dapi00sdfENTER_YOUR_DATABRICKS_PAT_HERE");
        expect(r.value).toContain("[KEY]");
        expect(r.value).not.toContain("dapi00sdfENTER_YOUR_DATABRICKS_PAT_HERE");
    });

    it("preserves non-PII numbers and short identifiers", () => {
        // 4-digit year / a small order ID / a price — none should be touched
        const r = redactPiiFromString("Year 2026 · order #4521 · $99.99");
        expect(r.value).toBe("Year 2026 · order #4521 · $99.99");
        expect(r.matches).toEqual([]);
    });

    it("returns the audit list ordered by pattern execution", () => {
        const r = redactPiiFromString("Email: a@b.co  SSN: 111-22-3333");
        const kinds = r.matches.map(m => m.kind);
        // Both kinds present
        expect(kinds).toContain("email");
        expect(kinds).toContain("ssn-us");
    });
});

describe("redactPiiFromValue", () => {
    it("passes through numbers untouched", () => {
        const r = redactPiiFromValue(12345);
        expect(r.value).toBe(12345);
        expect(r.matches).toEqual([]);
    });

    it("passes through null and undefined untouched", () => {
        expect(redactPiiFromValue(null).value).toBeNull();
        expect(redactPiiFromValue(undefined).value).toBeUndefined();
    });

    it("redacts string inputs", () => {
        const r = redactPiiFromValue("user@example.com");
        expect(r.value).toBe("[EMAIL]");
        expect(r.matches.length).toBeGreaterThan(0);
    });
});
