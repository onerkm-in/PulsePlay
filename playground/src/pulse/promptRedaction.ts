/**
 * promptRedaction.ts — IDEA-039 Codex Review #2 C3.
 *
 * Author-supplied prompt fields (`domainGuidance`, `insightsDomainGuidance`,
 * `metricDirectionRules`, `insightsCustomSections`) are concatenated verbatim
 * into the Genie / supervisor request body. If a report author pastes a raw
 * PAT, bearer token, AWS key, or full email signature into one of those
 * fields, it ends up sitting in the Databricks request log forever — even
 * though the report was published to viewers who shouldn't see it.
 *
 * This module is a last-line scrubber that runs over every author-controlled
 * string just before it leaves the browser. Patterns are intentionally
 * conservative: false positives are tolerable (they read as `[redacted]`),
 * false negatives — leaking a real secret — are not.
 *
 * Tested in `tests/promptRedaction.test.ts`.
 */

const PLACEHOLDER = "[redacted]";

// Order matters — longer / more specific patterns first so they win against
// the email and generic-token patterns that follow.
const PATTERNS: { name: string; regex: RegExp }[] = [
    // Databricks PAT: dapi + 32 hex chars (often dapiXXXX...).
    { name: "databricks-pat", regex: /\bdapi[0-9a-f]{32,}\b/gi },
    // GitHub fine-grained / classic tokens.
    { name: "github-token", regex: /\bghp_[A-Za-z0-9]{30,}\b/g },
    { name: "github-fine-grained", regex: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g },
    // AWS access key (AKIA...) and Google API key (AIza...).
    { name: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
    { name: "google-api-key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
    // Slack tokens (xoxb-, xoxp-, xoxa-).
    { name: "slack-token", regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
    // OpenAI / Anthropic style keys.
    { name: "openai-key", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
    { name: "anthropic-key", regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
    // Generic Bearer / PAT prefixed inline ("Bearer eyJhb...", "Authorization: ...").
    { name: "bearer-token", regex: /\b[Bb]earer\s+[A-Za-z0-9._~+/=-]{16,}/g },
    { name: "authorization-header", regex: /\b[Aa]uthorization\s*:\s*\S+/g },
    // JWT-shaped: three base64url segments separated by dots, first two start with "ey".
    { name: "jwt", regex: /\bey[A-Za-z0-9_-]{10,}\.ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
    // Email addresses — least-specific, applied last.
    { name: "email", regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g }
];

/**
 * Redact secrets from a single author-supplied string. Empty/null in →
 * empty string out. Returns the string with every match replaced by
 * `[redacted]`.
 */
export function redactAuthorPrompt(input: string | null | undefined): string {
    if (!input) return "";
    let out = String(input);
    for (const { regex } of PATTERNS) {
        out = out.replace(regex, PLACEHOLDER);
    }
    return out;
}

/**
 * Returns a list of pattern names that fire on the input. Used by the
 * Setup tab to surface a yellow callout ("we found 1 email and 1 PAT —
 * these will be redacted before the request is sent") so authors notice
 * before they ship.
 */
export function detectAuthorPromptSecrets(input: string | null | undefined): string[] {
    if (!input) return [];
    const hits: string[] = [];
    for (const { name, regex } of PATTERNS) {
        // RegExp with /g — clone via a fresh regex so global state doesn't
        // bleed across calls.
        const r = new RegExp(regex.source, regex.flags);
        if (r.test(input)) hits.push(name);
    }
    return hits;
}

export const _internals = { PATTERNS, PLACEHOLDER };
