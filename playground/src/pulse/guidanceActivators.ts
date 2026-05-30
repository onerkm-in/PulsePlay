// playground/src/pulse/guidanceActivators.ts
//
// Activator-keyword framework for author guidance (2026-05-28, per user
// direction "we should have keywords as activators … ##<Keyword> <Instructions>").
//
// Authors switch on a structured capability with a markdown-style header:
//
//     ## <Keyword> <inline instruction?>
//     <block instructions…>
//
// A RECOGNIZED keyword (e.g. "Numeric Formatting", "Masking") activates a
// capability. PulsePlay parses that block, applies it STRUCTURALLY, and
// keeps the raw directive OUT of the model-facing prose — so e.g. a
// `#,###.##` number mask is never parroted into output. UNRECOGNIZED
// `## headers` are ordinary prose guidance and pass through untouched.
//
// This module is intentionally dependency-free (no import from
// visualHelpers) so it stays pure + unit-testable. Capability-specific
// handling (translating numeric-format rules to plain English, applying
// masking, etc.) lives with each capability's owner and consumes the
// generic blocks this module emits.

export type ActivatorId = "numeric-formatting" | "masking";

export interface ActivatorBlock {
    /** Canonical capability id this block activates. */
    id: ActivatorId;
    /** The header keyword text matched (without the leading `## `). */
    header: string;
    /** Instruction text for the capability — any inline text after the
     *  keyword on the header line, plus all following lines up to the next
     *  `##` header or end of guidance. Trimmed. */
    body: string;
}

export interface ParsedGuidance {
    /** Recognized activator blocks, in document order. */
    blocks: ActivatorBlock[];
    /** Guidance with every recognized activator block removed — the free
     *  prose the author wrote outside any activator. Safe to send to the
     *  LLM verbatim (no activator directives remain). */
    prose: string;
}

/** The single source of truth for which keywords activate what. Each entry
 *  matches the keyword as a PREFIX of the header text, so an author can
 *  write either `## Numeric Formatting` (block instructions below) or
 *  `## Masking redact customer names` (inline instruction). Add aliases /
 *  new capabilities here. */
const ACTIVATOR_KEYWORDS: ReadonlyArray<{ id: ActivatorId; prefix: RegExp }> = [
    { id: "numeric-formatting", prefix: /^(numeric\s+formatting|formatting\s+standards|number\s+format(?:ting)?)\b/i },
    { id: "masking",            prefix: /^(data\s+masking|masking)\b/i },
];

function resolveActivator(header: string): { id: ActivatorId; inline: string } | null {
    const norm = header.trim();
    for (const a of ACTIVATOR_KEYWORDS) {
        const m = norm.match(a.prefix);
        if (m) return { id: a.id, inline: norm.slice(m[0].length).replace(/^[\s:–-]+/, "").trim() };
    }
    return null;
}

/** Parse author guidance into recognized activator blocks + the remaining
 *  free prose. Level-2 (`##`) headers are the activator boundary; level-1
 *  (`#`) and level-3+ (`###`) lines stay inside whatever block contains
 *  them (they're treated as body content, not activator boundaries). */
export function parseGuidanceActivators(guidance: string): ParsedGuidance {
    if (!guidance || !guidance.trim()) return { blocks: [], prose: guidance ?? "" };
    const lines = guidance.split("\n");
    const blocks: ActivatorBlock[] = [];
    const proseLines: string[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const h = line.match(/^##\s+(.+?)\s*$/); // exactly level-2
        if (!h) {
            proseLines.push(line);
            i++;
            continue;
        }
        const headerText = h[1].trim();
        const resolved = resolveActivator(headerText);
        // Collect this section's body up to the next level-2 header / EOF.
        const bodyLines: string[] = [];
        let j = i + 1;
        while (j < lines.length && !/^##\s+/.test(lines[j])) {
            bodyLines.push(lines[j]);
            j++;
        }
        if (resolved) {
            const body = [resolved.inline, bodyLines.join("\n")].filter(s => s && s.trim()).join("\n").trim();
            blocks.push({ id: resolved.id, header: headerText, body });
            // recognized → removed from prose entirely
        } else {
            // unrecognized section → preserve verbatim as prose
            proseLines.push(line, ...bodyLines);
        }
        i = j;
    }
    return {
        blocks,
        prose: proseLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    };
}

/** Convenience: find the first block for a capability, if present. */
export function getActivatorBlock(parsed: ParsedGuidance, id: ActivatorId): ActivatorBlock | undefined {
    return parsed.blocks.find(b => b.id === id);
}

/** Author-facing description of each activator keyword. The Settings ⓘ help
 *  panel + the greyed-out placeholder are generated from this list, so what
 *  the UI advertises can never drift from what the parser actually
 *  recognizes. */
export interface ActivatorDescriptor {
    id: ActivatorId;
    /** Canonical keyword to type after `## `. */
    keyword: string;
    /** Other header texts that also activate this capability. */
    aliases: string[];
    /** One-line summary for the ⓘ help. */
    description: string;
    /** Greyed-out example block shown in the guidance placeholder. */
    example: string;
    /** Honesty caveat surfaced in the ⓘ help (precedence / limits). */
    caveat?: string;
    /** "active" = fully wired; "reserved" = recognized but enforcement is a
     *  later slice (kept out of the prompt today, no behavior yet). */
    status: "active" | "reserved";
}

export const ACTIVATOR_DESCRIPTORS: ReadonlyArray<ActivatorDescriptor> = [
    {
        id: "numeric-formatting",
        keyword: "Numeric Formatting",
        aliases: ["Formatting Standards", "Number Formatting"],
        description: "How numeric values are displayed — type and precision (currency, %, pp, decimals, K/M/B abbreviation).",
        example: [
            "## Numeric Formatting",
            "| Range | Format | Example |",
            "| --- | --- | --- |",
            "| < 1000 | #,###.## | 567.89 |",
            "| >= 1000 | #,###.#M | 2.3M |",
        ].join("\n"),
        caveat: "Applies reliably to table / KPI values (formatted by PulsePlay after the AI returns). In prose it is best-effort, and a Genie space instruction can still override it.",
        status: "active",
    },
    {
        id: "masking",
        keyword: "Masking",
        aliases: ["Data Masking"],
        description: "Hide or partially hide sensitive field values (e.g. show last 4 digits, redact names).",
        example: [
            "## Masking",
            "| Field | Rule |",
            "| --- | --- |",
            "| Customer Name | redact |",
            "| Account Number | last4 |",
        ].join("\n"),
        caveat: "Presentation + prompt-redaction only — NOT a security guarantee. The real control is Unity Catalog column masks at the data layer. (Enforcement ships in a follow-up; the keyword is recognized today.)",
        status: "reserved",
    },
];

/** The greyed-out placeholder text for the guidance box — generated from the
 *  descriptors so it always matches the recognized keywords. */
export function buildGuidancePlaceholder(): string {
    return [
        "Type plain guidance, or use ## keywords to activate structured directives:",
        "",
        ...ACTIVATOR_DESCRIPTORS.map(d => d.example),
        "",
        "Anything outside a ## keyword block is treated as normal business guidance.",
    ].join("\n");
}

/** True when the guidance activates the given capability. */
export function hasActivator(guidance: string, id: ActivatorId): boolean {
    return parseGuidanceActivators(guidance).blocks.some(b => b.id === id);
}
