// playground/src/lib/renderMarkdown.tsx
//
// Minimal safe Markdown renderer for AI assistant narrative.
//
// Audit 2026-05-19 P2-2: the AISidebar used to render `entry.answer` with
// `whiteSpace: pre-wrap` — every Markdown emitter (Genie / Foundation Model
// / Supervisor / Bedrock) was therefore showing raw "**bold**", "`code`",
// "## headings", "| a | b |" pipes in the chat. This module renders the
// subset of CommonMark that those backends actually emit, and ONLY that
// subset — anything unknown is left as plain text so a future markdown
// emitter quirk degrades gracefully instead of crashing the chat.
//
// Why not react-markdown? It is ~30 KB gzip plus rehype-sanitize, and we
// only need: paragraphs, headings (`#..#####`), unordered + ordered lists,
// fenced + inline code, bold, italic, blockquotes, links, and pipe tables
// (Thread D — for KPI tone coloring). The full CommonMark surface
// (footnotes, HTML passthrough, autolinks, image refs, definitions) is
// out of scope — and out of scope for a chat answer surface where we
// DON'T want the model to inject HTML.
//
// Security posture:
//   - Inline HTML in input is NOT honored. `<script>` / `<img onerror=…>`
//     etc. render as literal `&lt;script&gt;` text via React's default
//     escaping (we return JSX, not innerHTML).
//   - Links: `target="_blank" rel="noopener noreferrer"` always. URL is
//     vetted with `safeUrl()` — only http/https/mailto pass through;
//     anything else (javascript:, data:, vbscript:, file:) renders as
//     plain text.
//   - No `dangerouslySetInnerHTML` anywhere in this module.

import { Fragment, type ReactNode } from "react";
import {
    parsePercentValue,
    resolveMetricDirection,
    thresholdTone,
    type MetricDirectionRule,
} from "../pulse/rendering/metricDirections";
import type { Tone } from "../pulse/rendering/insightsTone";

const SAFE_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function safeUrl(raw: string): string | null {
    try {
        const u = new URL(raw, "http://placeholder.invalid");
        // Allow protocol-relative + relative URLs that resolved against
        // placeholder.invalid (they become http://placeholder.invalid/…),
        // BUT reject anything whose protocol isn't in the allowlist.
        if (raw.startsWith("//") || raw.startsWith("/") || !raw.includes(":")) {
            // Relative reference — just preserve the raw form, browser
            // will resolve against the document base.
            return raw;
        }
        return SAFE_URL_PROTOCOLS.has(u.protocol) ? raw : null;
    } catch {
        return null;
    }
}

/**
 * Render inline tokens — bold (`**…**`), italic (`*…*` or `_…_`), inline
 * code (`` `…` ``), and links (`[label](url)`). Order matters: tokenize
 * by scanning left-to-right with a regex that captures whichever inline
 * pattern fires first, so `**a `b` c**` correctly nests code inside bold.
 */
export function renderInline(text: string, keyPrefix = "inline"): ReactNode[] {
    const out: ReactNode[] = [];
    // Anchored to the start of the remaining string; we slice as we consume.
    // ORDER: code (greediest delimiter), bold (**), italic (* or _), link.
    const TOKEN_RE = /(`+)([^`]+?)\1|\*\*([^*]+?)\*\*|__([^_]+?)__|\*([^*]+?)\*|_([^_]+?)_|\[([^\]]+)\]\(([^)\s]+)\)/;
    let rest = text;
    let i = 0;
    while (rest.length > 0) {
        const m = TOKEN_RE.exec(rest);
        if (!m) {
            out.push(rest);
            break;
        }
        if (m.index > 0) out.push(rest.slice(0, m.index));
        const k = `${keyPrefix}-${i++}`;
        if (m[2]) {
            // inline code
            out.push(<code key={k} className="pp-md-code-inline">{m[2]}</code>);
        } else if (m[3] || m[4]) {
            // bold (** or __)
            out.push(<strong key={k}>{renderInline(m[3] || m[4], k)}</strong>);
        } else if (m[5] || m[6]) {
            // italic (* or _)
            out.push(<em key={k}>{renderInline(m[5] || m[6], k)}</em>);
        } else if (m[7] && m[8]) {
            const href = safeUrl(m[8]);
            if (href) {
                out.push(
                    <a key={k} href={href} target="_blank" rel="noopener noreferrer">
                        {renderInline(m[7], k)}
                    </a>,
                );
            } else {
                // Unsafe protocol — fall back to plain label, preserving
                // the original Markdown so the user can see something is
                // wrong instead of silently dropping the link.
                out.push(`[${m[7]}](${m[8]})`);
            }
        }
        rest = rest.slice(m.index + m[0].length);
    }
    return out;
}

interface Block {
    kind: "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "ul" | "ol" | "code" | "quote" | "table";
    /** Plain-text content; lists collapse their items into `items` instead. */
    text?: string;
    items?: string[];
    /** Language hint for fenced code blocks. */
    lang?: string;
    /** Thread D — pipe table data. headers + rows are split-by-pipe and trimmed. */
    headers?: string[];
    rows?: string[][];
}

/** Thread D — split a pipe-table row into cells, stripping leading/trailing
 *  empties from the outer `|...|` and trimming each cell. Preserves
 *  interior empty cells. */
function splitTableRow(line: string): string[] {
    const cells = line.split("|").map(c => c.trim());
    // Drop the leading/trailing empties created by the outer pipes.
    if (cells.length > 0 && cells[0] === "") cells.shift();
    if (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    return cells;
}

/** Thread D — detect a markdown-table separator row (must be the line
 *  immediately after the header). Cells contain only `-`, `:`, and
 *  whitespace. Requires at least one `-` so a stray `| | |` row doesn't
 *  trigger table mode. */
function isTableSeparator(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return false;
    const cells = splitTableRow(trimmed);
    if (cells.length === 0) return false;
    return cells.every(c => /^:?-+:?$/.test(c));
}

/** Thread D — detect a pipe-table data row (header or body). Loose match:
 *  starts and ends with `|`, has at least one interior pipe. */
function isTableLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith("|")
        && trimmed.endsWith("|")
        && (trimmed.match(/\|/g) || []).length >= 2;
}

/**
 * Parse a Markdown-ish string into a sequence of block descriptors. The
 * grammar is small on purpose — see module header for the full list.
 */
export function parseBlocks(src: string): Block[] {
    const lines = src.replace(/\r\n/g, "\n").split("\n");
    const blocks: Block[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        // Fenced code block: ```lang … ```
        const fence = line.match(/^```(\w*)\s*$/);
        if (fence) {
            const lang = fence[1] || undefined;
            const body: string[] = [];
            i++;
            while (i < lines.length && !lines[i].match(/^```\s*$/)) {
                body.push(lines[i]);
                i++;
            }
            // Consume closing fence if present.
            if (i < lines.length) i++;
            blocks.push({ kind: "code", text: body.join("\n"), lang });
            continue;
        }
        // ATX heading: `# …` through `###### …`
        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
            const level = heading[1].length;
            const kind = (`h${level}` as Block["kind"]);
            blocks.push({ kind, text: heading[2].trim() });
            i++;
            continue;
        }
        // Pipe table — must have a header row AND a separator row to
        // qualify. Without the separator, the line is just paragraph
        // text that happens to contain pipes.
        if (isTableLine(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
            const headers = splitTableRow(line);
            i += 2; // Skip header + separator.
            const rows: string[][] = [];
            while (i < lines.length && isTableLine(lines[i])) {
                rows.push(splitTableRow(lines[i]));
                i++;
            }
            blocks.push({ kind: "table", headers, rows });
            continue;
        }
        // Blockquote: `> …` (consecutive lines fold together).
        if (line.startsWith("> ") || line === ">") {
            const body: string[] = [];
            while (i < lines.length && (lines[i].startsWith("> ") || lines[i] === ">")) {
                body.push(lines[i].replace(/^>\s?/, ""));
                i++;
            }
            blocks.push({ kind: "quote", text: body.join("\n") });
            continue;
        }
        // Unordered list: lines starting with `- ` / `* ` / `+ `.
        if (line.match(/^[-*+]\s+/)) {
            const items: string[] = [];
            while (i < lines.length && lines[i].match(/^[-*+]\s+/)) {
                items.push(lines[i].replace(/^[-*+]\s+/, ""));
                i++;
            }
            blocks.push({ kind: "ul", items });
            continue;
        }
        // Ordered list: lines starting with `1. ` / `2. ` / etc.
        if (line.match(/^\d+\.\s+/)) {
            const items: string[] = [];
            while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
                items.push(lines[i].replace(/^\d+\.\s+/, ""));
                i++;
            }
            blocks.push({ kind: "ol", items });
            continue;
        }
        // Blank line — separator, advance.
        if (line.trim() === "") { i++; continue; }
        // Paragraph: accumulate consecutive non-empty, non-special lines.
        const body: string[] = [];
        while (i < lines.length
            && lines[i].trim() !== ""
            && !lines[i].match(/^#{1,6}\s+/)
            && !lines[i].match(/^[-*+]\s+/)
            && !lines[i].match(/^\d+\.\s+/)
            && !lines[i].match(/^```/)
            && !lines[i].startsWith(">")
            && !isTableLine(lines[i])) {
            body.push(lines[i]);
            i++;
        }
        blocks.push({ kind: "p", text: body.join("\n") });
    }
    return blocks;
}

// ─── Thread D — KPI tone coloring for markdown tables ───────────────────

export interface RenderMarkdownOptions {
    /** Thread D — metric direction rules sourced from settings. When
     *  present, tables get per-cell tone backgrounds where the header
     *  matches a rule. When absent, tables render plain. */
    metricRules?: {
        structured?: string;  // JSON form (insightsMetricDirections)
        legacy?: string;      // prose form (metricDirectionRules)
    };
}

/** Resolve the tone for a single cell against a header→rule lookup.
 *  Returns undefined when the rule has no thresholds or the cell value
 *  doesn't parse to a number. */
function resolveCellTone(cellValue: string, rule: MetricDirectionRule | undefined): Tone | undefined {
    if (!rule) return undefined;
    const value = parsePercentValue(cellValue);
    if (value === null) return undefined;
    const tone = thresholdTone(value, rule);
    return tone === null ? undefined : tone;
}

/** Map a tone to the inline background style. 12% opacity matches the
 *  KPI-tile aesthetic in AI Insights so the same metric reads the same
 *  way across surfaces. Color is not the sole signal — every toned cell
 *  carries an aria-label describing the tone. */
function backgroundForTone(tone: Tone): string | undefined {
    switch (tone) {
        case "good": return "rgba(21, 128, 61, 0.14)";   // green tint
        case "warn": return "rgba(180, 83, 9, 0.14)";    // amber tint
        case "bad":  return "rgba(201, 42, 42, 0.14)";   // red   tint
        default:     return undefined;                    // neutral — no tint
    }
}

/** Pre-compute which columns map to a rule. Memoization is on the caller
 *  side via React useMemo if needed; this function is O(headers × rules)
 *  and called once per table render. */
function buildHeaderRuleMap(
    headers: string[],
    metricRules?: RenderMarkdownOptions["metricRules"],
): Map<number, MetricDirectionRule> {
    const map = new Map<number, MetricDirectionRule>();
    if (!metricRules) return map;
    for (let i = 0; i < headers.length; i++) {
        const rule = resolveMetricDirection(headers[i], metricRules.structured, metricRules.legacy);
        if (rule) map.set(i, rule);
    }
    return map;
}

/**
 * Render a Markdown-ish string as React nodes. Safe by construction —
 * never produces innerHTML, never honors raw HTML in input.
 *
 * When `opts.metricRules` is provided, pipe-table cells whose column
 * header matches a metric rule are tinted by tone — green for good,
 * amber for warn, red for bad — using the same threshold logic AI
 * Insights uses for KPI cards.
 */
export function renderMarkdown(
    src: string | null | undefined,
    opts?: RenderMarkdownOptions,
): ReactNode {
    if (!src || typeof src !== "string") return null;
    const blocks = parseBlocks(src);
    return (
        <Fragment>
            {blocks.map((b, idx) => {
                const key = `b-${idx}`;
                switch (b.kind) {
                    case "h1": return <h1 key={key} className="pp-md-h1">{renderInline(b.text || "", key)}</h1>;
                    case "h2": return <h2 key={key} className="pp-md-h2">{renderInline(b.text || "", key)}</h2>;
                    case "h3": return <h3 key={key} className="pp-md-h3">{renderInline(b.text || "", key)}</h3>;
                    case "h4": return <h4 key={key} className="pp-md-h4">{renderInline(b.text || "", key)}</h4>;
                    case "h5": return <h5 key={key} className="pp-md-h5">{renderInline(b.text || "", key)}</h5>;
                    case "h6": return <h6 key={key} className="pp-md-h6">{renderInline(b.text || "", key)}</h6>;
                    case "ul": return (
                        <ul key={key} className="pp-md-ul">
                            {b.items?.map((item, ii) => (
                                <li key={`${key}-${ii}`}>{renderInline(item, `${key}-${ii}`)}</li>
                            ))}
                        </ul>
                    );
                    case "ol": return (
                        <ol key={key} className="pp-md-ol">
                            {b.items?.map((item, ii) => (
                                <li key={`${key}-${ii}`}>{renderInline(item, `${key}-${ii}`)}</li>
                            ))}
                        </ol>
                    );
                    case "code": return (
                        <pre key={key} className="pp-md-pre" data-lang={b.lang || ""}>
                            <code>{b.text}</code>
                        </pre>
                    );
                    case "quote": return (
                        <blockquote key={key} className="pp-md-quote">
                            {renderInline(b.text || "", key)}
                        </blockquote>
                    );
                    case "table": {
                        const headers = b.headers || [];
                        const rows = b.rows || [];
                        const ruleMap = buildHeaderRuleMap(headers, opts?.metricRules);
                        return (
                            <table key={key} className="pp-md-table" data-testid={`md-table-${idx}`}>
                                <thead>
                                    <tr>
                                        {headers.map((h, hi) => (
                                            <th key={`${key}-h-${hi}`} scope="col">
                                                {renderInline(h, `${key}-h-${hi}`)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, ri) => (
                                        <tr key={`${key}-r-${ri}`}>
                                            {row.map((cell, ci) => {
                                                const rule = ruleMap.get(ci);
                                                const tone = resolveCellTone(cell, rule);
                                                const bg = tone ? backgroundForTone(tone) : undefined;
                                                return (
                                                    <td
                                                        key={`${key}-c-${ri}-${ci}`}
                                                        {...(bg ? { style: { background: bg } } : {})}
                                                        {...(tone ? { "data-tone": tone, "aria-label": `${cell} (${tone})` } : {})}
                                                    >
                                                        {renderInline(cell, `${key}-c-${ri}-${ci}`)}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        );
                    }
                    case "p":
                    default: return (
                        <p key={key} className="pp-md-p">
                            {renderInline(b.text || "", key)}
                        </p>
                    );
                }
            })}
        </Fragment>
    );
}
