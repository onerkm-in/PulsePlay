// playground/src/pulse/_adapter/exportInsightsAsHtml.ts
//
// PulsePlay-side helper: convert an AI Insights markdown payload into
// a rich-HTML snippet suitable for paste into Outlook / Slack / Notion.
// Prefers grabbing the LIVE rendered DOM (which already has formatted
// tables, KPI tiles, etc.) and wrapping it with inline-style stripped
// styles for portability. Falls back to a hand-rolled markdown → HTML
// pass when the DOM container isn't available (e.g. headless export).
//
// We deliberately stay minimal — no full HTML doc, no <style> block
// referenced via class; everything that needs styling is rendered with
// inline `style="…"` so the paste survives Outlook's CSS pruning.

/**
 * Build a rich-HTML rendering of the briefing for clipboard / email paste.
 *   - `markdown` — the cleaned markdown source (after cleanInsightsContent).
 *   - `liveContainerHtml` — optional innerHTML grabbed from the live
 *     rendered insights container. When supplied we prefer it because
 *     it's already a faithful visual (tables, KPI tiles, status pills).
 *     When absent we fall back to a markdown → HTML conversion.
 */
export function renderInsightsAsEmailHtml(markdown: string, liveContainerHtml?: string): string {
    const body = liveContainerHtml && liveContainerHtml.trim().length > 0
        ? liveContainerHtml
        : markdownToEmailHtml(markdown);
    // Wrap in a minimal email-safe envelope. NO external stylesheet; no
    // <link>; no <script>. The receiving mail client strips most things
    // but typically keeps inline-styled <h2>/<p>/<table>/<ul>/<strong>.
    return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:13px;line-height:1.5;color:#1a1a1a;max-width:760px;">${body}</div>`;
}

/**
 * Tiny markdown → HTML pass that handles the subset Pulse emits:
 *   - `## Heading` → <h2 style="...">…</h2>
 *   - `**bold**` → <strong>…</strong>
 *   - pipe tables → <table>
 *   - bullet lists (`- ` / `* `) → <ul>
 *   - numbered lists (`1. `) → <ol>
 *   - paragraphs (blank-line separated) → <p>
 *
 * Quoting (`> `), nested lists, and links are intentionally out of scope —
 * Pulse's output doesn't use them. Strikes a balance between portability
 * and complexity; if a richer renderer is needed later, swap in `marked`
 * or `markdown-it` via a vite chunk-split.
 */
function markdownToEmailHtml(md: string): string {
    if (!md.trim()) return "";
    const lines = md.replace(/\r\n/g, "\n").split("\n");
    const out: string[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        // Blank line
        if (!line.trim()) { i++; continue; }
        // Heading
        const h2 = /^##\s+(.+)$/.exec(line);
        if (h2) {
            out.push(`<h2 style="font-size:16px;font-weight:600;margin:18px 0 6px;letter-spacing:-0.005em;">${inline(h2[1])}</h2>`);
            i++;
            continue;
        }
        const h1 = /^#\s+(.+)$/.exec(line);
        if (h1) {
            out.push(`<h1 style="font-size:18px;font-weight:700;margin:20px 0 8px;">${inline(h1[1])}</h1>`);
            i++;
            continue;
        }
        // Pipe table — heuristic: a line of `| … | … |` followed by `|---|---|`
        if (/^\s*\|.+\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:-]+\|\s*$/.test(lines[i + 1])) {
            const header = parseTableRow(line);
            i += 2; // skip the alignment row
            const rows: string[][] = [];
            while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
                rows.push(parseTableRow(lines[i]));
                i++;
            }
            out.push(buildTable(header, rows));
            continue;
        }
        // Bullet list
        if (/^[-*]\s+/.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
                items.push(`<li style="margin:3px 0;">${inline(lines[i].replace(/^[-*]\s+/, ""))}</li>`);
                i++;
            }
            out.push(`<ul style="margin:6px 0 10px;padding-left:22px;">${items.join("")}</ul>`);
            continue;
        }
        // Numbered list
        if (/^\d+\.\s+/.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
                items.push(`<li style="margin:3px 0;">${inline(lines[i].replace(/^\d+\.\s+/, ""))}</li>`);
                i++;
            }
            out.push(`<ol style="margin:6px 0 10px;padding-left:22px;">${items.join("")}</ol>`);
            continue;
        }
        // Paragraph (consume contiguous non-blank lines)
        const para: string[] = [line];
        i++;
        while (i < lines.length && lines[i].trim() && !/^(#|##|[-*]|\d+\.|\|)/.test(lines[i])) {
            para.push(lines[i]);
            i++;
        }
        out.push(`<p style="margin:8px 0;">${inline(para.join(" "))}</p>`);
    }
    return out.join("\n");
}

function parseTableRow(line: string): string[] {
    return line.trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map(c => c.trim());
}

function buildTable(header: string[], rows: string[][]): string {
    const th = header.map(c =>
        `<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #cfd6dc;background:#f5f7f9;font-weight:600;">${inline(c)}</th>`
    ).join("");
    const tr = rows.map(r =>
        `<tr>${r.map(c =>
            `<td style="padding:6px 10px;border-bottom:1px solid #e6eaee;vertical-align:top;">${inline(c)}</td>`
        ).join("")}</tr>`
    ).join("");
    return `<table style="border-collapse:collapse;margin:8px 0 14px;font-size:13px;width:100%;"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

function inline(s: string): string {
    // Escape HTML special chars first, then re-add the inline format we own.
    let out = s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    // **bold** → <strong>
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // `code` → <code>
    out = out.replace(/`([^`]+)`/g, "<code style=\"font-family:'Cascadia Code',Consolas,monospace;background:#f3f5f7;padding:1px 4px;border-radius:3px;font-size:12px;\">$1</code>");
    return out;
}
