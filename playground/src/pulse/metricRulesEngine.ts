/**
 * metricRulesEngine.ts — Wave 40
 *
 * Pure logic helpers powering the form-first Knowledge Base metric direction
 * editor. The form (metricRuleForm.tsx) holds an array of MetricRule objects
 * as the single source of truth; both the legacy free-text prose field
 * (metricDirectionRules) and the structured JSON field (insightsMetricDirections)
 * are derived from this array on every change.
 *
 * Why this module exists:
 *   - Pre-Wave 40 the visual exposed two textareas that both had to be kept
 *     in sync manually via a "Generate from text" button. Authors edited
 *     one and forgot the other; downstream prompt + renderer drifted.
 *   - This module gives both surfaces a deterministic round-trip so the
 *     form stays the source of truth and downstream consumers (the Genie
 *     prompt builder reads prose, the AI Insights renderer reads JSON) see
 *     consistent data on every keystroke.
 *
 * Public API:
 *   • rulesToProse(rules)    → human-readable prose (what the prompt expects)
 *   • proseToRules(text)     → best-effort parser for legacy prose migration
 *   • rulesToJson(rules)     → serialise to insightsMetricDirections shape
 *   • jsonToRules(json)      → reverse — accepts the existing schema
 *   • validateRules(rules)   → array of ValidationError (no throw)
 *   • DEFAULT_AMBER / DEFAULT_RED constants for sensible blank-form defaults
 *
 * Sanitisation policy (Wave 22 tripwire):
 *   • All string inputs flowing into MetricRule fields are passed through
 *     scrubField() which strips control chars, normalises newlines, blocks
 *     SQL DML keywords, and caps lengths. The form calls scrubField on every
 *     onChange before the value reaches state. Prose / JSON outputs are
 *     therefore safe to inject into prompts without re-scrubbing.
 */

// ── Public types ────────────────────────────────────────────────────────────

export interface MetricRule {
    /** Display name. Required, must be unique (case-insensitive). */
    name: string;
    /** True for higher-is-better, false for lower-is-better. */
    higherIsBetter: boolean;
    /** Optional alternate names the renderer / AI may match against. */
    aliases: string[];
    /** Threshold: at-or-better = green. */
    greenPct?: number;
    /** Threshold: at-or-worse-than-amber-but-better-than-red = warn. */
    amberPct?: number;
    /** Threshold: at-or-worse = bad. */
    redPct?: number;
}

export type ValidationSeverity = "error" | "warn";

export interface ValidationError {
    /** Index of the rule with the problem. -1 for whole-form issues. */
    index: number;
    /** Field on the rule that triggered the error, or "form" for global. */
    field: "name" | "thresholds" | "form";
    severity: ValidationSeverity;
    message: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Soft cap on number of rules — protects prompt size + UX scrolling. */
export const MAX_RULES = 50;
/** Cap per name to keep prose readable + prompt tokens predictable. */
export const MAX_NAME_LEN = 80;
/** Per-alias cap. */
export const MAX_ALIAS_LEN = 80;
/** Cap on prose-input length the legacy migrator will accept. */
export const MAX_PROSE_LEN = 8000;

// Built-in fallbacks so a freshly added card has plausible thresholds the
// author can immediately tune. 15/8 mirrors the "Margin %" example bundled
// throughout the docs and Section A help body.
export const DEFAULT_GREEN = 15;
export const DEFAULT_AMBER = 8;
export const DEFAULT_RED = 0;

// ── Sanitisation (Wave 22 contract) ────────────────────────────────────────

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const SQL_DML_RE = /\b(DROP|DELETE|UPDATE|INSERT|TRUNCATE|ALTER|GRANT|REVOKE)\b/gi;

/** Scrub a single user-typed field — call before storing in MetricRule. */
export function scrubField(input: string, maxLen: number): string {
    if (typeof input !== "string") return "";
    return input
        .replace(CONTROL_CHARS, "")
        .replace(/\r\n?/g, " ")        // collapse newlines (single-line fields)
        .replace(/[`{}]/g, "")         // template-injection chars
        .replace(SQL_DML_RE, "")       // blast any DML keyword
        .replace(/\s+/g, " ")          // collapse internal whitespace
        .trim()
        .slice(0, maxLen);
}

// ── Construction helpers ───────────────────────────────────────────────────

/** Fresh blank rule with sensible defaults — used by + Add Row in the form. */
export function createBlankRule(): MetricRule {
    return {
        name: "",
        higherIsBetter: true,
        aliases: [],
        greenPct: DEFAULT_GREEN,
        amberPct: DEFAULT_AMBER,
        redPct: DEFAULT_RED
    };
}

// ── prose ↔ rules ──────────────────────────────────────────────────────────

/**
 * Convert structured rules to human-readable prose. The output mirrors the
 * format authors typed manually pre-Wave 40 so downstream prompt builders
 * (visualHelpers.buildInsightsStagePrompts reads `metricDirectionRules` text
 * verbatim) keep working with no changes.
 *
 * Example output for a single rule:
 *   "Margin %: higher is better — 🟢 ≥15% · 🟡 8-15% · 🔴 <8%."
 */
export function rulesToProse(rules: MetricRule[]): string {
    if (!Array.isArray(rules) || rules.length === 0) return "";
    return rules
        .filter(r => r && r.name && r.name.trim())
        .map(rule => {
            const dir = rule.higherIsBetter ? "higher is better" : "lower is better";
            const head = `${rule.name.trim()}: ${dir}`;
            const g = rule.greenPct;
            const a = rule.amberPct;
            const r = rule.redPct;
            const hasThresholds =
                typeof g === "number" && typeof a === "number" && typeof r === "number";
            if (!hasThresholds) return `${head}.`;
            // Format depends on direction so the bands read intuitively.
            if (rule.higherIsBetter) {
                return `${head} — 🟢 ≥${g}% · 🟡 ${a}-${g}% · 🔴 <${a}%.`;
            }
            return `${head} — 🟢 ≤${g}% · 🟡 ${g}-${a}% · 🔴 >${a}%.`;
        })
        .join(" ");
}

/**
 * Best-effort legacy prose parser. Mirrors the regex strategy used by
 * `migrateLegacyMetricDirectionRules` in rendering/metricDirections.ts so
 * existing reports authored before Wave 40 round-trip cleanly into the new
 * form on first open.
 *
 * Captures: metric name, direction, and (optionally) the 3 threshold numbers
 * if the prose carries them in the canonical "🟢 ≥N% · 🟡 N-N% · 🔴 <N%" shape
 * (or any reasonable variant — non-strict).
 */
export function proseToRules(text: string): MetricRule[] {
    const raw = (text || "").slice(0, MAX_PROSE_LEN).trim();
    if (!raw) return [];
    const rules: MetricRule[] = [];
    const seen = new Set<string>();
    // Split into clauses on sentence boundaries so each rule lives in
    // exactly one clause and threshold numbers don't leak between rules.
    const clauses = raw.split(/(?<=[.!?])\s+|;\s+/);
    // Per-clause regex tolerates an optional colon between the metric name
    // and the direction phrase ("Margin %: higher is better"). The `[^.;:]`
    // exclusion keeps name extraction tight when prose chains multiple
    // metrics in one sentence ("X higher is better, Y lower is better").
    const directionRe = /([^.;]+?)\s*:?\s*(higher|lower)\s+(?:(?:is|are|usually)\s+)*(?:better|best)\b/i;

    for (const clauseRaw of clauses) {
        const clause = clauseRaw.trim();
        if (!clause) continue;
        const dirMatch = clause.match(directionRe);
        if (!dirMatch) continue;
        const rawName = dirMatch[1].replace(/^[\s,]+|[\s,]+$/g, "");
        const parts = rawName.split(/\s*\/\s*/).map(p => p.trim()).filter(Boolean);
        const name = scrubField(parts[0] || "", MAX_NAME_LEN);
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const higherIsBetter = dirMatch[2].toLowerCase() === "higher";
        const aliases = parts.slice(1).map(a => scrubField(a, MAX_ALIAS_LEN)).filter(Boolean);

        // Try to pull thresholds from the clause. We look for any number
        // followed by % and bucket them by emoji proximity if present, else
        // by ordering. This is intentionally permissive — partial matches
        // simply leave thresholds undefined and the form falls back to the
        // built-in defaults when the author tunes.
        const numbers = Array.from(clause.matchAll(/(\d+(?:\.\d+)?)\s*%/g)).map(m => Number(m[1]));
        let greenPct: number | undefined;
        let amberPct: number | undefined;
        let redPct: number | undefined;
        if (numbers.length >= 2) {
            // Pick out by sorted order — for higher-is-better: highest = green,
            // lowest = red. For lower-is-better: highest = red, lowest = green.
            const sorted = [...numbers].sort((a, b) => a - b);
            if (higherIsBetter) {
                greenPct = sorted[sorted.length - 1];
                redPct = sorted[0];
                amberPct = sorted.length >= 3 ? sorted[Math.floor(sorted.length / 2)] : sorted[0];
            } else {
                greenPct = sorted[0];
                redPct = sorted[sorted.length - 1];
                amberPct = sorted.length >= 3 ? sorted[Math.floor(sorted.length / 2)] : sorted[sorted.length - 1];
            }
        }

        rules.push({
            name,
            higherIsBetter,
            aliases,
            greenPct,
            amberPct,
            redPct
        });
        if (rules.length >= MAX_RULES) break;
    }
    return rules;
}

// ── json ↔ rules ───────────────────────────────────────────────────────────

/**
 * Serialise to the existing insightsMetricDirections JSON shape — array of
 * { name, higherIsBetter, aliases?, amberPct?, redPct? }. The renderer
 * (rendering/metricDirections.ts parseMetricDirectionsJson) already accepts
 * this shape so the JSON view stays a backward-compatible read for the
 * downstream consumer.
 *
 * Note: the renderer schema only carries amberPct + redPct (no greenPct).
 * We persist greenPct as a top-level field too so a round-trip jsonToRules
 * → rulesToJson preserves it; older renderer versions simply ignore the
 * unknown key. This is additive — no breaking change for downstream.
 */
export function rulesToJson(rules: MetricRule[]): string {
    const filtered = (rules || []).filter(r => r && r.name && r.name.trim());
    if (!filtered.length) return "";
    const payload = filtered.map(r => {
        const out: Record<string, unknown> = {
            name: r.name.trim(),
            higherIsBetter: r.higherIsBetter !== false
        };
        const aliases = (r.aliases || []).map(a => a.trim()).filter(Boolean);
        if (aliases.length) out.aliases = aliases;
        if (typeof r.greenPct === "number" && Number.isFinite(r.greenPct)) out.greenPct = r.greenPct;
        if (typeof r.amberPct === "number" && Number.isFinite(r.amberPct)) out.amberPct = r.amberPct;
        if (typeof r.redPct === "number" && Number.isFinite(r.redPct)) out.redPct = r.redPct;
        return out;
    });
    return JSON.stringify(payload, null, 2);
}

/** Parse JSON in the existing insightsMetricDirections schema into rules. */
export function jsonToRules(raw: string): MetricRule[] {
    const text = (raw || "").trim();
    if (!text) return [];
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return []; }
    if (!Array.isArray(parsed)) return [];
    const out: MetricRule[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const name = scrubField(typeof rec.name === "string" ? rec.name : "", MAX_NAME_LEN);
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        // Tolerate older shapes that used direction: "lowerIsBetter".
        const higherIsBetter =
            rec.higherIsBetter !== false && rec.direction !== "lowerIsBetter";
        const aliasesIn = Array.isArray(rec.aliases) ? rec.aliases : [];
        const aliases = aliasesIn
            .map(a => scrubField(typeof a === "string" ? a : String(a), MAX_ALIAS_LEN))
            .filter(Boolean);
        const numOrUndef = (v: unknown): number | undefined =>
            typeof v === "number" && Number.isFinite(v) ? v : undefined;
        out.push({
            name,
            higherIsBetter,
            aliases,
            greenPct: numOrUndef(rec.greenPct),
            amberPct: numOrUndef(rec.amberPct),
            redPct: numOrUndef(rec.redPct)
        });
        if (out.length >= MAX_RULES) break;
    }
    return out;
}

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * Returns ALL validation issues (does not short-circuit on first error). The
 * form surfaces these inline next to the offending card / field.
 *
 * Rules:
 *   - name required + non-empty
 *   - no duplicate names (case-insensitive)
 *   - thresholds: if any of (green/amber/red) provided, all 3 must be numeric
 *   - threshold ordering:
 *       higher-is-better → green > amber > red
 *       lower-is-better  → green < amber < red
 *   - max-rules cap (warn, not error — author can still save)
 */
export function validateRules(rules: MetricRule[]): ValidationError[] {
    const errors: ValidationError[] = [];
    if (!Array.isArray(rules)) return errors;
    if (rules.length > MAX_RULES) {
        errors.push({
            index: -1,
            field: "form",
            severity: "warn",
            message: `Over ${MAX_RULES} rules — only the first ${MAX_RULES} will be used.`
        });
    }
    const nameCounts = new Map<string, number[]>();
    rules.forEach((rule, i) => {
        if (!rule) return;
        const trimmed = (rule.name || "").trim();
        if (!trimmed) {
            errors.push({ index: i, field: "name", severity: "error", message: "Metric name is required." });
        } else {
            const key = trimmed.toLowerCase();
            const list = nameCounts.get(key) || [];
            list.push(i);
            nameCounts.set(key, list);
        }
        // Threshold checks
        const g = rule.greenPct;
        const a = rule.amberPct;
        const r = rule.redPct;
        const provided = [g, a, r].filter(v => typeof v === "number");
        if (provided.length > 0 && provided.length < 3) {
            errors.push({
                index: i,
                field: "thresholds",
                severity: "error",
                message: "Set all three thresholds (green / amber / red) or leave them blank."
            });
        } else if (provided.length === 3) {
            const goodToBad = rule.higherIsBetter
                ? (g as number) > (a as number) && (a as number) > (r as number)
                : (g as number) < (a as number) && (a as number) < (r as number);
            if (!goodToBad) {
                const expected = rule.higherIsBetter
                    ? "green > amber > red"
                    : "green < amber < red (lower-is-better inverts ordering)";
                errors.push({
                    index: i,
                    field: "thresholds",
                    severity: "error",
                    message: `Threshold ordering invalid — expected ${expected}.`
                });
            }
        }
    });
    nameCounts.forEach((indices, key) => {
        if (indices.length > 1) {
            indices.forEach(idx => {
                errors.push({
                    index: idx,
                    field: "name",
                    severity: "error",
                    message: `Duplicate metric name "${key}" — names must be unique.`
                });
            });
        }
    });
    return errors;
}

// ── Migration helpers ──────────────────────────────────────────────────────

/**
 * Auto-migrate the two legacy textareas into a unified rule list on first
 * load. Strategy: prefer JSON when present (renderer-authoritative); fall
 * back to prose. When both differ in non-trivial ways the form surfaces a
 * banner so the author can choose; this helper just returns BOTH so the
 * caller can decide how to surface the difference.
 */
export interface MigrationResult {
    /** Final rule list to seed the form with. */
    rules: MetricRule[];
    /** Set when both legacy fields had values that produced different rule sets. */
    drift: boolean;
    /** When drift is set, the prose-derived alternative for "switch to text" recovery. */
    proseRules?: MetricRule[];
    /** When drift is set, the json-derived alternative for "switch to map" recovery. */
    jsonRules?: MetricRule[];
}

export function migrateLegacy(legacyText: string, legacyJson: string): MigrationResult {
    const proseRules = proseToRules(legacyText || "");
    const jsonRules = jsonToRules(legacyJson || "");
    if (jsonRules.length && proseRules.length) {
        const drift = !sameNameSet(proseRules, jsonRules);
        if (drift) {
            return { rules: jsonRules, drift: true, proseRules, jsonRules };
        }
        return { rules: jsonRules, drift: false };
    }
    if (jsonRules.length) return { rules: jsonRules, drift: false };
    if (proseRules.length) return { rules: proseRules, drift: false };
    return { rules: [], drift: false };
}

function sameNameSet(a: MetricRule[], b: MetricRule[]): boolean {
    if (a.length !== b.length) return false;
    const ka = new Set(a.map(r => r.name.toLowerCase()));
    const kb = new Set(b.map(r => r.name.toLowerCase()));
    if (ka.size !== kb.size) return false;
    for (const k of ka) if (!kb.has(k)) return false;
    return true;
}
