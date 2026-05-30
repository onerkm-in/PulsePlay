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

// ── L12 — Prompt-injection keyword sanitizer ────────────────────────────
//
// Author-supplied free text from Pulse Setup (domain guidance, metric
// rules, custom section instructions) lands inside the AI system prompt.
// A malicious or naive author could include phrases that try to redirect
// the model — "ignore previous instructions", "you are now…", "from now
// on respond as…", etc. The AI vendor's own prompt-hierarchy is the real
// fence; this is best-effort defense in depth.
//
// Strategy:
//   1. Strip a small allowlist of high-confidence injection phrases by
//      replacing them with `[stripped]` so the model sees the attempt
//      was neutralized but the surrounding context survives.
//   2. Truncate to a max length so a 100KB free-text dump doesn't
//      smuggle a hidden instruction past human review.
//   3. (Caller responsibility) Surround the sanitized text with a
//      reference-data fence string in the system prompt so the AI can
//      tell user-supplied text apart from system instructions.

const INSTRUCTION_PLACEHOLDER = "[stripped]";

/** Heuristic regex set. Conservative: only patterns where false positives
 *  cost little (the surrounding sentence still reads) and false negatives
 *  cost a real bypass. Each pattern matches case-insensitively. */
const INJECTION_PATTERNS: { name: string; regex: RegExp }[] = [
    { name: "ignore-prior", regex: /\bignore\s+(?:all|any|the|your|previous|prior|above)\s+(?:instructions?|prompts?|rules?|policies)\b/gi },
    { name: "disregard-prior", regex: /\bdisregard\s+(?:all|any|the|your|previous|prior|above)\s+(?:instructions?|prompts?|rules?|policies)\b/gi },
    { name: "override-system", regex: /\b(?:override|replace|forget)\s+(?:the|your|all)?\s*system\s+prompt\b/gi },
    { name: "you-are-now", regex: /\byou\s+are\s+now\s+(?:a\s+)?(?:different|new|jailbroken|unrestricted)\b/gi },
    { name: "act-as", regex: /\b(?:act|behave|respond|operate)\s+as\s+(?:if|though|a)\s+.*?(?:no\s+rules|no\s+restrictions|jailbroken|dan|developer\s+mode)\b/gi },
    { name: "from-now-on", regex: /\bfrom\s+now\s+on,?\s+(?:you\s+(?:will|must|should)\s+)?(?:ignore|forget|disregard|bypass)\b/gi },
    { name: "developer-mode", regex: /\b(?:developer|debug|dan|jailbreak)\s+mode\s+(?:enabled|activated|on)\b/gi },
    { name: "reveal-system", regex: /\b(?:reveal|show|print|output|dump)\s+(?:the|your)?\s*(?:system\s+prompt|hidden\s+instructions|original\s+prompt)\b/gi },
    { name: "end-of-prompt", regex: /\b(?:end|finish|stop)\s+of\s+(?:system|prior)\s+(?:prompt|instructions?)\b/gi },
    // Special-character heuristic — repeated injection separators that
    // some attackers use to confuse the prompt parser.
    { name: "instruction-fence-attack", regex: /(?:^|\s)(?:---+|===+|\*\*\*+)\s*(?:system|instructions?|user|assistant)\s*(?:---+|===+|\*\*\*+|:)/gi },
];

const MAX_AUTHOR_PROMPT_CHARS = 16000;

/** Strip recognized injection-attempt phrases from an author-supplied
 *  string. Replaces matches with `[stripped]`. Truncates the result to
 *  MAX_AUTHOR_PROMPT_CHARS so a long dump can't smuggle a hidden tail. */
export function stripInstructionKeywords(input: string | null | undefined): string {
    if (!input) return "";
    let out = String(input);
    for (const { regex } of INJECTION_PATTERNS) {
        out = out.replace(regex, INSTRUCTION_PLACEHOLDER);
    }
    if (out.length > MAX_AUTHOR_PROMPT_CHARS) {
        out = out.slice(0, MAX_AUTHOR_PROMPT_CHARS) + " […truncated]";
    }
    return out;
}

/** Returns recognized injection patterns that fire on the input. Used by
 *  Setup tab to surface a yellow callout so authors see the heuristic
 *  before submit. Mirrors the shape of `detectAuthorPromptSecrets`. */
export function detectInstructionKeywords(input: string | null | undefined): string[] {
    if (!input) return [];
    const hits: string[] = [];
    for (const { name, regex } of INJECTION_PATTERNS) {
        const r = new RegExp(regex.source, regex.flags);
        if (r.test(input)) hits.push(name);
    }
    return hits;
}

/** Combined helper — runs the existing `redactAuthorPrompt` (secrets) then
 *  `stripInstructionKeywords` (injection attempts). This is what call
 *  sites should use going forward; the two-step helpers stay exported for
 *  callers that need finer control. */
export function safeAuthorPrompt(input: string | null | undefined): string {
    return stripInstructionKeywords(redactAuthorPrompt(input));
}
