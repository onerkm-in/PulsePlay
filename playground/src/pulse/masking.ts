// playground/src/pulse/masking.ts
//
// `## Masking` activator enforcement — Slice 4a (prompt-context redaction).
//
// PRESENTATION + PROMPT-REDACTION ONLY. This is defence-in-depth, NOT a
// security guarantee — Unity Catalog column masks at the data layer are the
// real control (same posture as lib/piiRedact.ts). What this adds: when an
// author declares masked fields in a `## Masking` block, their VALUES are
// redacted out of the AI prompt context before it leaves the browser, so the
// model never sees the raw sensitive value.
//
// Rule vocabulary (author-confirmed 2026-05-28): redact / last4 / hide.
//   redact → "•••"            (full obfuscation)
//   last4  → "••••1234"       (show only the last 4 characters)
//   hide   → field dropped entirely from the context
//
// Scope: dimension (categorical) values — the usual PII vector (names,
// account numbers, emails). Numeric measures support `hide` (drop); a
// numeric value can't be partially revealed meaningfully, so redact/last4
// on a measure also drops it (over-masking is the safe default for privacy).

import type { ContextSummary } from "./contextBuilder";
import type powerbi from "./_adapter/powerbi-visuals-api";
import { parseGuidanceActivators, getActivatorBlock } from "./guidanceActivators";

type PrimitiveValue = powerbi.PrimitiveValue;

export type MaskRule = "redact" | "last4" | "hide";

export interface MaskingRule {
    field: string;
    rule: MaskRule;
}

function toRule(raw: string): MaskRule | null {
    const r = raw.trim().toLowerCase();
    return r === "redact" || r === "last4" || r === "hide" ? r : null;
}

/** Parse the `## Masking` block's `| Field | Rule |` table into rules. Never
 *  throws; returns [] when the block is absent or unparseable. */
export function parseMaskingRules(guidance: string): MaskingRule[] {
    const block = getActivatorBlock(parseGuidanceActivators(guidance), "masking");
    if (!block) return [];
    const lines = block.body.split("\n").map(l => l.trim()).filter(l => l.startsWith("|"));
    if (lines.length === 0) return [];
    // Skip a markdown separator row (|---|---|) and a header row (| Field | Rule |).
    const sepIdx = lines.findIndex(l => {
        const inner = l.replace(/^\||\|$/g, "");
        return /^[\s\-:|]+$/.test(inner) && inner.includes("-");
    });
    const dataLines = sepIdx >= 0
        ? lines.slice(sepIdx + 1)
        : lines.filter(l => !/\bfield\b\s*\|\s*\brule\b/i.test(l));
    const rules: MaskingRule[] = [];
    const seen = new Set<string>();
    for (const row of dataLines) {
        const cells = row.split("|").map(c => c.trim()).filter(c => c.length > 0);
        if (cells.length < 2) continue;
        const field = cells[0];
        const rule = toRule(cells[1]);
        const key = field.toLowerCase();
        if (field && rule && !seen.has(key)) {
            rules.push({ field, rule });
            seen.add(key);
        }
    }
    return rules;
}

/** Apply a single masking rule to one stringified value. */
export function maskValue(value: PrimitiveValue, rule: MaskRule): string {
    const s = String(value ?? "");
    if (rule === "hide") return "";
    if (rule === "last4") {
        if (s.length <= 4) return "••••";
        return "••••" + s.slice(-4);
    }
    return "•••"; // redact
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Return a masked COPY of the context for the prompt path. Redacts the
 *  values of declared masked fields out of `dimensions`, `safeContextText`,
 *  and `contextText`; drops `hide` fields entirely (incl. from
 *  `boundFieldNames` + `measures`). Field match is case-insensitive on the
 *  column/dimension/measure name. No-op when there are no rules. */
export function applyMaskingToContext(context: ContextSummary, rules: ReadonlyArray<MaskingRule>): ContextSummary {
    if (!rules.length) return context;
    const ruleFor = (name: string): MaskingRule | undefined =>
        rules.find(r => r.field.toLowerCase() === name.toLowerCase());

    const dimensions: Record<string, PrimitiveValue[]> = {};
    const hidden = new Set<string>();
    // original value string -> masked form, for scrubbing the serialized text.
    const replacements: Array<[string, string]> = [];

    for (const [name, vals] of Object.entries(context.dimensions)) {
        const r = ruleFor(name);
        if (!r) { dimensions[name] = vals; continue; }
        if (r.rule === "hide") { hidden.add(name.toLowerCase()); continue; }
        dimensions[name] = vals.map(v => {
            const orig = String(v ?? "");
            const masked = maskValue(v, r.rule);
            if (orig && masked !== orig) replacements.push([orig, masked]);
            return masked;
        });
    }

    // Measures: any masked measure is dropped (numbers can't be partially
    // revealed). Capture the numeric string for text scrubbing first.
    const measures: Record<string, number> = {};
    for (const [name, val] of Object.entries(context.measures)) {
        const r = ruleFor(name);
        if (!r) { measures[name] = val; continue; }
        hidden.add(name.toLowerCase());
        replacements.push([String(val), "•••"]);
    }

    // Scrub the serialized text. Replace longest originals first so a value
    // that is a substring of another doesn't partially mask the longer one.
    replacements.sort((a, b) => b[0].length - a[0].length);
    let safeText = context.safeContextText;
    let ctxText = context.contextText;
    for (const [orig, masked] of replacements) {
        if (!orig) continue;
        const re = new RegExp(escapeRegExp(orig), "g");
        safeText = safeText.replace(re, masked);
        ctxText = ctxText.replace(re, masked);
    }

    const boundFieldNames = context.boundFieldNames.filter(n => !hidden.has(n.toLowerCase()));

    return {
        ...context,
        dimensions,
        measures,
        boundFieldNames,
        safeContextText: safeText,
        contextText: ctxText,
    };
}

/** Convenience: parse rules from guidance and apply in one call. */
export function maskContextForPrompt(context: ContextSummary, guidance: string): ContextSummary {
    return applyMaskingToContext(context, parseMaskingRules(guidance));
}

/** Mask selected filter VALUES for fields covered by a masking rule. The
 *  filter key is the field name; `hide` drops the filter entirely. Returns a
 *  new object; no-op when there are no rules. */
export function maskFilters(
    filters: Record<string, string>,
    rules: ReadonlyArray<MaskingRule>,
): Record<string, string> {
    if (!rules.length) return filters;
    const out: Record<string, string> = {};
    for (const [field, value] of Object.entries(filters)) {
        const r = rules.find(rr => rr.field.toLowerCase() === field.toLowerCase());
        if (!r) { out[field] = value; continue; }
        if (r.rule === "hide") continue; // drop the filter
        out[field] = maskValue(value, r.rule);
    }
    return out;
}
