/**
 * contentSanitizer.ts — pure (no JSX, no React) text-cleaning helpers used
 * by the AI Insights renderer and the Copy button.
 *
 * Extracted from `visual.tsx` as part of the H1 split (Codex Review #1 / #2).
 * The renderer-side functions (renderInsightsSections, renderNarrative, …)
 * still live in `visual.tsx`; only the regex- and string-only helpers are
 * here so they can be unit-tested without a DOM.
 *
 * Two layers of stripping:
 *
 *   1. `stripTrailingProseKeywordsOnly` — section-agnostic. Drops content
 *      from the earliest known wrap-up phrase (`Bottom Line Up Front`,
 *      `Overall`, …) to end. Used for preamble or unstructured content.
 *
 *   2. `stripTrailingProse` — section-aware. For sections whose body is
 *      supposed to end with a list (RISKS, ACTIONS, …) or a table
 *      (CATEGORY MIX, REGIONAL BREAKDOWN, …), it finds the last structural
 *      line and truncates everything after it.
 *
 *   3. `cleanInsightsContent` — orchestrates 1 + 2 across an entire raw
 *      insights string, splitting on `## ` headings.
 *
 * Idempotent — running twice yields the same result.
 */

export const STRUCTURED_LIST_SECTIONS = new Set([
    "RISKS", "OPPORTUNITIES", "RECOMMENDED ACTIONS", "TRENDS", "TOP DRIVERS",
    "DRIVERS", "NEXT ACTIONS", "OPS ACTIONS", "MERCH ACTIONS", "CONTROL ACTIONS",
    "FIELD ACTIONS", "CARE OPS ACTIONS", "WORKFORCE ACTIONS", "FINANCE ACTIONS",
    "SAVE PLAYS", "ATTACH PLAYS", "DECISION FOCUS", "EXECUTIVE READOUT"
]);

export const STRUCTURED_TABLE_SECTIONS = new Set([
    "CATEGORY MIX", "REGIONAL BREAKDOWN", "SCORECARD", "KPI SNAPSHOT",
    "REGION HOTSPOTS", "PRODUCT MIX", "CHURN SIGNALS", "NPS DRIVERS",
    "SEGMENT GROWTH", "SERVICE GAPS", "SUPPLIER RISK", "STOCK PRESSURE",
    "BED PRESSURE", "READMISSION COHORTS", "FLOW BOTTLENECKS",
    "ATTRITION HOTSPOTS", "HIRING FUNNEL", "PERFORMANCE MIX",
    "VARIANCE DRIVERS", "EXPENSE HOTSPOTS", "CASH POSITION",
    "REGION MARGIN MAP", "SEGMENT PRESSURE", "SHIP MODE SIGNALS", "STATE OUTLIERS",
    "SUBCATEGORY RANKING", "LOSS MAKERS", "GEOGRAPHIC UPSIDE",
    "RETURN EXPOSURE", "DISCOUNT ABUSE", "MARGIN EROSION"
]);

export const TRAILING_WRAP_UP_PATTERNS: RegExp[] = [
    /^Bottom Line Up Front[:\s]/im,
    /^In summary[,\s]/im,
    /^In conclusion[,\s]/im,
    /^Overall[,\s]/im,
    /^To summari[sz]e[,\s]/im,
    /^To recap[,\s]/im,
    /^Current period[:\s].*all filtered/im,
    /^Period summary[:\s]/im,
    /^Closing note[:\s]/im
];

export function stripTrailingProseKeywordsOnly(text: string): string {
    if (!text) return text;
    const lines = text.split("\n");
    let earliest = -1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        for (const pat of TRAILING_WRAP_UP_PATTERNS) {
            if (pat.test(line)) {
                earliest = earliest === -1 ? i : Math.min(earliest, i);
                break;
            }
        }
    }
    return earliest >= 0 ? lines.slice(0, earliest).join("\n").trimEnd() : text;
}

export function stripHeadlineChrome(body: string, sectionTitle?: string): string {
    if (!body || !sectionTitle) return body;
    if (sectionTitle.trim().toUpperCase() !== "HEADLINE") return body;

    return body
        .split("\n")
        .map(line => line.replace(/\b(?:SITUATION|IMPLICATION|BLUF|Bottom Line|Overview|Recommendation)\s*[:—-]\s*/gi, ""))
        .join("\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

export function stripTrailingProse(body: string, sectionTitle?: string): string {
    if (!body || !sectionTitle) return body;
    const upperTitle = sectionTitle.trim().toUpperCase();
    const lines = stripHeadlineChrome(body, sectionTitle).split("\n");

    let earliestWrapUp = -1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        for (const pat of TRAILING_WRAP_UP_PATTERNS) {
            if (pat.test(line)) {
                earliestWrapUp = earliestWrapUp === -1 ? i : Math.min(earliestWrapUp, i);
                break;
            }
        }
    }
    let workingLines = earliestWrapUp >= 0 ? lines.slice(0, earliestWrapUp) : lines;

    if (STRUCTURED_LIST_SECTIONS.has(upperTitle)) {
        const isListLine = (s: string) => /^\s*(?:[-*+•]|\d+\.)\s+/.test(s);
        let lastListIdx = -1;
        for (let i = workingLines.length - 1; i >= 0; i--) {
            if (isListLine(workingLines[i])) { lastListIdx = i; break; }
        }
        if (lastListIdx >= 0 && lastListIdx < workingLines.length - 1) {
            const tail = workingLines.slice(lastListIdx + 1).join("\n").trim();
            if (tail) {
                workingLines = workingLines.slice(0, lastListIdx + 1);
            }
        }
    } else if (STRUCTURED_TABLE_SECTIONS.has(upperTitle)) {
        const isTableLine = (s: string) => /^\s*\|.*\|\s*$/.test(s);
        const isListLine = (s: string) => /^\s*(?:[-*+•]|\d+\.)\s+/.test(s);
        // L4 — bullet lines that show up AFTER the table can be either:
        //   (a) a legitimate footnote like `- Profit-negative sub-categories: bookcases, tables`
        //       (has a colon, or contains numbers / %), OR
        //   (b) dangling nouns like `- Bookcases, Supplies, Tables` that are
        //       trailing prose disguised as a bullet — drop these.
        // Heuristic: a bullet is informative if it contains a `:` separator,
        // a digit, a percent sign, or a currency symbol; otherwise it's nouns.
        const isInformativeBullet = (s: string) => {
            if (!isListLine(s)) return false;
            const body = s.replace(/^\s*(?:[-*+•]|\d+\.)\s+/, "");
            return /[:%]|\d|[$€£₹¥]/.test(body);
        };
        // Find the last table line first.
        let lastTableIdx = -1;
        for (let i = workingLines.length - 1; i >= 0; i--) {
            if (isTableLine(workingLines[i])) { lastTableIdx = i; break; }
        }
        if (lastTableIdx >= 0) {
            // Walk forward from the line after the table; keep informative
            // bullets, drop everything else.
            const kept: string[] = workingLines.slice(0, lastTableIdx + 1);
            for (let j = lastTableIdx + 1; j < workingLines.length; j++) {
                const ln = workingLines[j];
                if (!ln.trim()) {
                    kept.push(ln);
                    continue;
                }
                if (isInformativeBullet(ln)) {
                    kept.push(ln);
                    continue;
                }
                // Non-informative line — stop and drop the rest.
                break;
            }
            workingLines = kept;
        } else {
            // No table found — fall back to the prior list-line heuristic so
            // sections that emit a list instead of a table still strip prose.
            let lastListIdx = -1;
            for (let i = workingLines.length - 1; i >= 0; i--) {
                if (isListLine(workingLines[i])) { lastListIdx = i; break; }
            }
            if (lastListIdx >= 0 && lastListIdx < workingLines.length - 1) {
                const tail = workingLines.slice(lastListIdx + 1).join("\n").trim();
                if (tail) workingLines = workingLines.slice(0, lastListIdx + 1);
            }
        }
    }

    return workingLines.join("\n").trimEnd();
}

/**
 * Session 53 — guarantee a stage's response leads with `## EXPECTED_TITLE`
 * regardless of what the model emits. Lifts header-match accuracy from the
 * 80-90% LLM-variance plateau toward 99.99% by normalising the rendered
 * output even when Genie ignores the structure-check rule.
 *
 * Behaviour matrix:
 *   - Already starts with `## EXPECTED_TITLE` (case-insensitive)  → unchanged
 *   - Starts with a different `## OTHER_TITLE`                    → unchanged
 *     (preserves author intent if a Custom Section reformatted; only fixes
 *     missing-heading and prose-preamble cases)
 *   - Has `## EXPECTED_TITLE` later in the body (preceded by prose
 *     preamble like a clarifying question)                        → strips
 *     the preamble; response now starts with the heading
 *   - Has NO `## EXPECTED_TITLE` anywhere                         → prepends
 *     `## EXPECTED_TITLE\n\n` so the section card renders correctly
 *   - Empty / whitespace-only                                     → returned
 *     as-is (caller handles empty as a soft-fail / Retry path)
 *
 * Returns the normalised string. Idempotent.
 */
export function normalizeStageHeading(content: string, expectedTitle: string): string {
    if (!content || !expectedTitle) return content;
    const upper = expectedTitle.trim().toUpperCase();
    if (!upper) return content;
    const trimmed = content.trim();
    if (!trimmed) return content;
    // Tolerate up to 3 leading whitespace chars and #/##/### markdown levels.
    const leadingHeadingMatch = /^\s*#{1,3}\s+(.+?)\s*$/m.exec(trimmed.split("\n")[0] ?? "");
    if (leadingHeadingMatch) {
        const firstHeading = leadingHeadingMatch[1].trim().toUpperCase();
        if (firstHeading === upper) return content; // already correct
        // First heading is something else — author may have remixed; leave alone.
        return content;
    }
    // No leading heading. Look for the expected heading anywhere in the body.
    const bodyHeadingPattern = new RegExp(`^\\s*#{1,3}\\s+${upper.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "im");
    const m = bodyHeadingPattern.exec(content);
    if (m && typeof m.index === "number" && m.index > 0) {
        // Strip preamble — keep from the heading onwards.
        return content.slice(m.index).trimStart();
    }
    // Heading absent entirely — prepend it. Preserve the model's content
    // beneath as the section body.
    return `## ${upper}\n\n${content.trim()}`;
}

/**
 * Strip "empty markdown emphasis" markers — strings like `****` or `__`
 * or `**  **` that the LLM sometimes emits as a separator line. They
 * render as raw asterisks in the visual because there's no content
 * between them. Real `**bold**` is preserved (something between the
 * markers); only standalone empty markers on their own line — or as
 * isolated tokens at the start/end of a paragraph — are removed.
 */
export function stripEmptyEmphasis(content: string): string {
    if (!content) return content;
    return content
        // ****  / **** / __ on their own line (with optional whitespace)
        .replace(/^[ \t]*(?:\*{2,}|_{2,})[ \t]*$/gm, "")
        // **  ** or __  __ — paired markers with only whitespace between
        .replace(/^[ \t]*(\*{2,}|_{2,})\s*\1[ \t]*$/gm, "")
        // Inline isolated bold/italic markers with no enclosed text: e.g.
        // " **** " mid-line, or " ** ** " — strip the markers, keep the rest.
        .replace(/(\s|^)(\*{2,}|_{2,})(\s|$)/g, "$1$3")
        // Collapse any newline run we introduced
        .replace(/\n{3,}/g, "\n\n");
}

/**
 * Deduplicate repeated `## HEADING` sections. When the LLM emits the same
 * top-level heading twice (e.g. supervisor agent re-asserts a HEADLINE
 * section while answering a later stage), the renderer would otherwise
 * draw two separate cards with the same title — visually confusing and
 * usually contradictory. Strategy: keep the LAST occurrence (which tends
 * to be the more refined / context-aware version) and drop earlier copies.
 *
 * Returns the content with duplicate `## TITLE` blocks pruned. Real
 * different headings (HEADLINE vs TRENDS) are preserved. Case-insensitive
 * comparison, normalized whitespace.
 */
export function dedupeSections(content: string): string {
    if (!content) return content;
    const sectionRegex = /^##\s+(.+)$/gm;
    const titles: { title: string; offset: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = sectionRegex.exec(content)) !== null) {
        titles.push({ title: m[1].trim().toUpperCase().replace(/\s+/g, " "), offset: m.index });
    }
    if (titles.length < 2) return content;
    // Find which section starts to drop (any not the LAST occurrence of
    // its normalized title).
    const lastIdx = new Map<string, number>();
    titles.forEach((t, i) => lastIdx.set(t.title, i));
    const dropOffsets: { from: number; to: number }[] = [];
    titles.forEach((t, i) => {
        if (lastIdx.get(t.title) === i) return; // keep
        const from = t.offset;
        const to = i + 1 < titles.length ? titles[i + 1].offset : content.length;
        dropOffsets.push({ from, to });
    });
    if (dropOffsets.length === 0) return content;
    // Cut from end to start so offsets stay valid.
    let out = content;
    dropOffsets.sort((a, b) => b.from - a.from);
    for (const r of dropOffsets) {
        out = out.slice(0, r.from) + out.slice(r.to);
    }
    return out.replace(/\n{3,}/g, "\n\n").trim();
}

export function cleanInsightsContent(content: string): string {
    if (!content) return content;
    // Run section dedup FIRST so per-section cleanup runs on the survivors.
    const deduped = dedupeSections(content);
    const parts = deduped.split(/^(##\s+.+)$/m);
    if (parts.length <= 1) {
        return stripEmptyEmphasis(stripTrailingProseKeywordsOnly(deduped));
    }
    const out: string[] = [];
    if (parts[0]) out.push(stripEmptyEmphasis(stripTrailingProseKeywordsOnly(parts[0])));
    let i = 1;
    while (i < parts.length) {
        const headingLine = parts[i] ?? "";
        const body = parts[i + 1] ?? "";
        const titleMatch = /^##\s+(.+)$/.exec(headingLine.trim());
        const title = titleMatch?.[1]?.trim();
        const cleaned = stripEmptyEmphasis(stripTrailingProse(body, title));
        out.push(headingLine);
        if (cleaned) out.push(cleaned);
        i += 2;
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Per-stage hard guard — when a stage prompt asked for ONE specific
 * section (e.g. `## HEADLINE`), and the agent over-produced multiple
 * sections, keep only the requested section's content. Falls back to
 * the input when no `## ${expectedTitle}` heading is present (in which
 * case `normalizeStageHeading` will inject one upstream).
 */
export function enforceStageScope(content: string, expectedTitle: string): string {
    if (!content || !expectedTitle) return content;
    const normalizedExpected = expectedTitle.trim().toUpperCase().replace(/\s+/g, " ");
    const sectionRegex = /^##\s+(.+)$/gm;
    const matches: { title: string; offset: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = sectionRegex.exec(content)) !== null) {
        matches.push({ title: m[1].trim().toUpperCase().replace(/\s+/g, " "), offset: m.index });
    }
    if (matches.length <= 1) return content;
    const target = matches.find(x => x.title === normalizedExpected);
    if (!target) return content; // nothing matches — let normalizeStageHeading handle it
    const targetIdx = matches.indexOf(target);
    const from = target.offset;
    const to = targetIdx + 1 < matches.length ? matches[targetIdx + 1].offset : content.length;
    // Preserve any pre-heading prose (uncommon but possible — usually empty)
    const preHead = content.slice(0, from).trim();
    const section = content.slice(from, to).trim();
    return (preHead ? preHead + "\n\n" : "") + section;
}
