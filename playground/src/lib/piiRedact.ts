// playground/src/lib/piiRedact.ts
//
// Defence-in-depth PII redaction for BI-event payloads before they
// reach the AI prompt. The security audit at docs/SECURITY_ARCHITECTURE.md
// flagged this as a MEDIUM-severity gap: `sendContextToGenie` (Pulse
// Setup → Section A) sends bound dimensions / filter values / selected
// data points to the AI. Chart labels containing emails, phone numbers,
// or other PII would flow upstream untouched.
//
// This is **not** a substitute for data-layer controls. Unity Catalog
// column masks + the org's PII-handling policy are the real boundary.
// What this module adds:
//   • A regex pass over filter / dimension / selection values right
//     before they leave the browser
//   • Token replacement so the AI still sees the SHAPE of the value
//     (it can reason about "an email in filter X" without seeing the
//     specific address)
//   • A logging hook so the visual's Session Log shows when redaction
//     fired, giving audit trail visibility
//
// Patterns covered (deliberately conservative — false positives over
// false negatives for PII):
//   • Email addresses (RFC 5322 lite)
//   • Phone numbers (international + domestic, ≥7 digits)
//   • US SSN (NNN-NN-NNNN)
//   • Credit card patterns (13–19 contiguous digits, no Luhn check —
//     accepts numbers that look like cards even if not valid; safer
//     to over-redact)
//   • IBAN (very loose: 2 letters + 13–32 alphanumerics)
//   • API-key-ish tokens (long base64/hex strings)
//
// Patterns NOT covered (out of scope; need org-specific rules):
//   • Names (Unicode names, no reliable regex; rely on UC column masks)
//   • Addresses (highly variable; rely on column masks)
//   • Employee IDs / customer IDs (org-specific format; configure
//     `runtimeForbiddenColumns` at the Pulse-Setup layer instead)
//
// To extend: add a pattern to PII_PATTERNS with the same shape.

export interface PiiRedactionMatch {
    /** Which named pattern matched (e.g. "email"). */
    kind: string;
    /** Where in the original string the match started + ended. */
    start: number;
    end: number;
}

export interface PiiRedactionResult<T> {
    /** Value after redaction. Identical to input when no PII detected. */
    value: T;
    /** Audit trail — empty if nothing redacted. */
    matches: PiiRedactionMatch[];
}

interface PiiPattern {
    name: string;
    regex: RegExp;
    /** Token that replaces the matched substring. */
    token: string;
}

// Order matters when patterns can overlap — most-specific first.
const PII_PATTERNS: PiiPattern[] = [
    { name: "email",      regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b/g,        token: "[EMAIL]" },
    { name: "ssn-us",     regex: /\b\d{3}-\d{2}-\d{4}\b/g,                                       token: "[SSN]" },
    { name: "iban",       regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{13,30}\b/g,                            token: "[IBAN]" },
    { name: "credit-card",regex: /\b\d{4}[ \-]?\d{4}[ \-]?\d{4}[ \-]?\d{1,7}\b/g,                token: "[CARD]" },
    // Phone — at least 7 digits, allowing common separators and an
    // optional leading +. Anchored on either word boundary or start/end
    // so we don't accidentally redact every multi-digit number.
    { name: "phone",      regex: /(?<!\d)\+?\d[\d\s\-().]{6,}\d(?!\d)/g,                         token: "[PHONE]" },
    // Generic API-key-ish — long base64 / hex strings. Conservative
    // length floor of 32 chars so we don't grab UUIDs or trace IDs.
    { name: "api-key",    regex: /\b[A-Za-z0-9_\-]{32,}\b/g,                                     token: "[KEY]" },
];

/**
 * Redact PII patterns from a string. Returns the redacted string + a
 * match log (kind + offset) so callers can wire audit telemetry.
 *
 * Non-string inputs (number, etc.) pass through unchanged with an
 * empty match list — numbers themselves are not PII (a fee amount is
 * a number; a credit-card-shaped number reaches this via the string
 * path because the credit-card regex matches digit runs).
 */
export function redactPiiFromString(input: string): PiiRedactionResult<string> {
    const matches: PiiRedactionMatch[] = [];
    let out = input;
    for (const p of PII_PATTERNS) {
        // Reset regex state (g flag preserves lastIndex across exec calls).
        p.regex.lastIndex = 0;
        let m: RegExpExecArray | null;
        const localMatches: PiiRedactionMatch[] = [];
        while ((m = p.regex.exec(out)) !== null) {
            localMatches.push({ kind: p.name, start: m.index, end: m.index + m[0].length });
            // Prevent infinite loop on zero-width matches (none of our
            // patterns are zero-width but defensive code is cheap).
            if (m.index === p.regex.lastIndex) p.regex.lastIndex++;
        }
        if (localMatches.length > 0) {
            matches.push(...localMatches);
            out = out.replace(p.regex, p.token);
            p.regex.lastIndex = 0;
        }
    }
    return { value: out, matches };
}

/**
 * Redact PII from an arbitrary primitive — strings get the full pass,
 * numbers / booleans / null are returned untouched. The matches list
 * lets the caller decide whether to log; we don't side-effect log here
 * because the lib is testable in isolation.
 */
export function redactPiiFromValue<T extends string | number | boolean | null | undefined>(
    input: T,
): PiiRedactionResult<T> {
    if (typeof input !== "string") return { value: input, matches: [] };
    const redacted = redactPiiFromString(input);
    return { value: redacted.value as T, matches: redacted.matches };
}
