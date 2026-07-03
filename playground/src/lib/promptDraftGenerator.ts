// playground/src/lib/promptDraftGenerator.ts
//
// FEATURE-P1 auto-prompt-from-context (requested 2026-05-29) — deterministic
// draft generation for the two author-facing prompt fields:
//
//   • Custom insights prompt (`insightsPrompt`)
//   • Domain guidance (`insightsDomainGuidance`)
//
// Drafts are TEMPLATED from the cached DiscoverySnapshot (probe + BI
// metadata + pack KPIs) — no LLM call. That keeps generation instant,
// zero-token, and available on every backend path including the no-LLM
// `powerbi-semantic-model` connector and when Genie is blocked upstream.
// The LLM-backed "Suggest from data" panel (domain + sections) remains a
// separate, complementary path.
//
// Honesty contract (per the no-ungrounded-artifacts rule):
//   • Every field name, definition, unit, and direction in a draft comes
//     verbatim from the snapshot. Nothing is invented.
//   • The guidance draft is plain prose — it must NEVER emit a recognized
//     `##` activator block (Numeric Formatting / Masking), because those
//     would require fabricated rules. parseGuidanceActivators() on a
//     generated draft always returns zero blocks (unit-tested).
//   • When the snapshot carries no usable signal, generation returns null
//     and the UI says so instead of producing a generic fake.

import type { DiscoverySnapshot, FusedKpi } from "./discoveryClient";
import { extractMeasuresAndDimensions } from "./insightsSuggestClient";

const MAX_KPI_LINES = 8;
const MAX_PRIORITY_MEASURES = 3;
const MAX_PRIORITY_DIMENSIONS = 2;

export interface PromptDraftContext {
    /** Measure names — from live BI bindings first, pack/probe KPIs second. */
    measures: string[];
    /** Dimension names — from live BI bindings (empty when none exposed). */
    dimensions: string[];
    /** Fused KPIs that carry a definition and/or direction (capped). */
    kpis: FusedKpi[];
    /** Author-typed analytics domain, else probe-inferred pack slug, else "". */
    domainLabel: string;
    /** Human label for the connected backend ("" when unknown). */
    backendLabel: string;
}

export interface PromptDrafts {
    insightsPrompt: string;
    guidance: string;
    /** One-line provenance summary for the UI ("3 measures · 2 dimensions · Genie"). */
    summary: string;
}

/** Normalize a DiscoverySnapshot into the draft-relevant context.
 *  Returns null when there is no signal at all (no measures, dimensions,
 *  KPIs, or domain hint) — the caller renders an honest empty state. */
export function buildPromptDraftContext(
    snapshot: DiscoverySnapshot | null,
    domainHint?: string,
): PromptDraftContext | null {
    const raw = extractMeasuresAndDimensions(snapshot);
    // Collapse internal whitespace so a field name can never smuggle a
    // newline (and thus a `##` activator header) into a generated draft.
    const measures = raw.measures.map(flattenWhitespace).filter(Boolean);
    const dimensions = raw.dimensions.map(flattenWhitespace).filter(Boolean);

    const kpis: FusedKpi[] = [];
    if (snapshot && Array.isArray(snapshot.fused?.availableKpis)) {
        for (const k of snapshot.fused.availableKpis) {
            if (!k || typeof k.name !== "string" || !k.name.trim()) continue;
            if (!k.definition && !k.direction && !k.units) continue;
            kpis.push({
                ...k,
                name: flattenWhitespace(k.name),
                definition: k.definition ? flattenWhitespace(k.definition) : k.definition,
                units: k.units ? flattenWhitespace(k.units) : k.units,
                direction: k.direction ? flattenWhitespace(k.direction) : k.direction,
            });
            if (kpis.length >= MAX_KPI_LINES) break;
        }
    }

    const probe = (snapshot?.sources?.probe ?? null) as Record<string, unknown> | null;
    const inference = probe?.inference as Record<string, unknown> | undefined;
    const suggestedPack =
        inference && typeof inference.suggestedPack === "string" ? inference.suggestedPack : "";
    const domainLabel = flattenWhitespace((domainHint || "").trim() || suggestedPack);

    const backendLabel = flattenWhitespace(
        (probe && typeof probe.displayName === "string" && probe.displayName.trim())
            ? probe.displayName.trim()
            : (probe && typeof probe.connectorType === "string" ? probe.connectorType : ""),
    );

    if (measures.length === 0 && dimensions.length === 0 && kpis.length === 0 && !domainLabel) {
        return null;
    }
    return { measures, dimensions, kpis, domainLabel, backendLabel };
}

/** Draft for the "Custom insights prompt" textarea. Markdown, mirrors the
 *  placeholder's `## Objective` / `## Required output` shape and grounds
 *  every referenced field in the snapshot. */
export function buildInsightsPromptDraft(ctx: PromptDraftContext): string {
    const domain = ctx.domainLabel || "the connected data";
    const lines: string[] = [
        "## Objective",
        `Analyse ${domain}${ctx.backendLabel ? ` (source: ${ctx.backendLabel})` : ""} and produce a decision-ready briefing for business stakeholders. Base every number on the connected data; if something cannot be grounded, say so instead of estimating.`,
        "",
    ];

    if (ctx.measures.length > 0 || ctx.dimensions.length > 0 || ctx.kpis.length > 0) {
        lines.push("## Data context");
        if (ctx.measures.length > 0) lines.push(`- Measures available: ${ctx.measures.join(", ")}`);
        if (ctx.dimensions.length > 0) lines.push(`- Dimensions available: ${ctx.dimensions.join(", ")}`);
        for (const k of ctx.kpis) {
            if (k.definition) lines.push(`- ${k.name}: ${k.definition}${k.units ? ` (${k.units})` : ""}`);
        }
        lines.push("");
    }

    lines.push("## Priorities");
    if (ctx.measures.length > 0) {
        lines.push(`- Quantify the most recent movement in ${ctx.measures.slice(0, MAX_PRIORITY_MEASURES).join(", ")}.`);
    }
    if (ctx.measures.length > 0 && ctx.dimensions.length > 0) {
        lines.push(`- Compare performance across ${ctx.dimensions.slice(0, MAX_PRIORITY_DIMENSIONS).join(" and ")}, and call out the best and worst segments.`);
    }
    const directional = ctx.kpis.filter(k => k.direction);
    if (directional.length > 0) {
        lines.push("- Flag any KPI moving against its preferred direction as a risk.");
    }
    lines.push("- Recommend concrete next actions a business owner can take this week.");
    lines.push("");
    lines.push("## Required output");
    lines.push("- HEADLINE — the single most important takeaway");
    lines.push("- TRENDS — what is moving and by how much");
    lines.push("- RISKS — where numbers are deteriorating or data is missing");
    lines.push("- RECOMMENDED ACTIONS — specific, owner-ready steps");

    return lines.join("\n");
}

/** Draft for the "Domain guidance" textarea. Plain prose only — MUST NOT
 *  emit recognized `##` activator blocks (see honesty contract above). */
export function buildGuidanceDraft(ctx: PromptDraftContext): string {
    const domain = ctx.domainLabel || "this dataset";
    const lines: string[] = [
        `Business guidance for ${domain}:`,
        "",
    ];

    if (ctx.measures.length > 0) {
        lines.push(`- Refer to metrics by their exact field names: ${ctx.measures.join(", ")}.`);
    }
    if (ctx.dimensions.length > 0) {
        lines.push(`- Break results down by: ${ctx.dimensions.join(", ")}.`);
    }
    const directional = ctx.kpis.filter(k => k.direction);
    for (const k of directional) {
        lines.push(`- ${k.name}: ${describeDirection(k.direction)}.`);
    }
    const withUnits = ctx.kpis.filter(k => k.units);
    for (const k of withUnits) {
        lines.push(`- Report ${k.name} in ${k.units}.`);
    }
    lines.push("- Do not speculate beyond the connected data; state explicitly when a figure is unavailable.");

    return lines.join("\n");
}

/** Collapse all internal whitespace (incl. newlines) to single spaces. */
function flattenWhitespace(s: string): string {
    return s.replace(/\s+/g, " ").trim();
}

/** Human phrasing for a KPI's preferred direction. Falls back to quoting
 *  the raw value when it isn't a recognized token — never drops it. */
function describeDirection(direction: string | undefined): string {
    const d = (direction || "").trim().toLowerCase();
    if (d === "higher" || d === "up" || d === "higher-is-better") return "higher is better";
    if (d === "lower" || d === "down" || d === "lower-is-better") return "lower is better";
    return `preferred direction "${direction}"`;
}

/** One-shot convenience: snapshot → both drafts + provenance summary,
 *  or null when there is no usable signal. */
export function buildPromptDrafts(
    snapshot: DiscoverySnapshot | null,
    domainHint?: string,
): PromptDrafts | null {
    const ctx = buildPromptDraftContext(snapshot, domainHint);
    if (!ctx) return null;
    const parts: string[] = [];
    if (ctx.measures.length > 0) parts.push(`${ctx.measures.length} measure${ctx.measures.length === 1 ? "" : "s"}`);
    if (ctx.dimensions.length > 0) parts.push(`${ctx.dimensions.length} dimension${ctx.dimensions.length === 1 ? "" : "s"}`);
    if (ctx.kpis.length > 0) parts.push(`${ctx.kpis.length} KPI definition${ctx.kpis.length === 1 ? "" : "s"}`);
    if (ctx.backendLabel) parts.push(ctx.backendLabel);
    return {
        insightsPrompt: buildInsightsPromptDraft(ctx),
        guidance: buildGuidanceDraft(ctx),
        summary: parts.join(" · ") || "domain hint only",
    };
}
