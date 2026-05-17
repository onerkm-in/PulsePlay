// @ts-check
'use strict';

/**
 * sqlSectionExtractor.js — Phase B of Discovery + Staged Rendering.
 *
 * Parses a SQL string that contains `/* Section: <ID> *​/` comment markers
 * (emitted by the Genie + Foundation Model translators when an IR has
 * structured-sections output) into per-section SQL fragments. The UI uses
 * these fragments to show "which SQL backed each section of the answer."
 *
 * Recognised marker forms (case-insensitive on "section"):
 *   /​* Section: HEADLINE *​/
 *   /​* section: TRENDS *​/
 *   /​* SECTION: RISKS *​/
 *   -- Section: ACTIONS
 *   -- section: NEXT
 *
 * Section IDs must match /^[A-Z0-9_-]{1,64}$/ — the same shape the IR
 * schema validator enforces for output.sections[].id. IDs failing the
 * regex are silently ignored so a malformed comment in the source SQL
 * doesn't corrupt the extraction.
 *
 * Returns an array preserving the order of CTEs in the source. Each entry
 * carries:
 *   - sectionId      The label from the comment marker
 *   - cteName        The SQL identifier of the CTE (when one follows the
 *                    marker; null when the marker labels free-standing SQL)
 *   - sqlFragment    The substring of the source SQL from the marker up to
 *                    (but not including) the next marker, with leading +
 *                    trailing whitespace trimmed
 *   - startOffset    Character offset of the marker in the source SQL
 *
 * No SQL parsing engine involved — this is a string-level extractor by
 * design. The translators emit a deterministic comment shape; the
 * extractor reads them back. SQL syntax differences across warehouses
 * (Databricks, Snowflake, Postgres, …) don't affect this layer.
 */

const MARKER_RE = /(?:\/\*\s*section\s*:\s*([A-Z0-9_-]{1,64})\s*\*\/|--\s*section\s*:\s*([A-Z0-9_-]{1,64})\s*$)/gim;
const CTE_NAME_RE = /\b([A-Za-z_][A-Za-z0-9_]{0,127})\s+AS\s*\(/i;

/**
 * @typedef {Object} SqlSection
 * @property {string} sectionId
 * @property {string | null} cteName
 * @property {string} sqlFragment
 * @property {number} startOffset
 */

/**
 * @param {string} sql
 * @returns {SqlSection[]}
 */
function extractSqlSections(sql) {
    if (typeof sql !== 'string' || sql.length === 0) return [];

    /** @type {Array<{ sectionId: string, markerStart: number, markerEnd: number }>} */
    const markers = [];
    MARKER_RE.lastIndex = 0;
    let match;
    while ((match = MARKER_RE.exec(sql)) !== null) {
        const sectionId = (match[1] || match[2] || '').trim().toUpperCase();
        if (!sectionId) continue;
        markers.push({
            sectionId,
            markerStart: match.index,
            markerEnd: match.index + match[0].length,
        });
    }
    if (markers.length === 0) return [];

    /** @type {SqlSection[]} */
    const out = [];
    for (let i = 0; i < markers.length; i++) {
        const cur = markers[i];
        const nextStart = i + 1 < markers.length ? markers[i + 1].markerStart : sql.length;
        const fragmentRaw = sql.slice(cur.markerStart, nextStart);
        const fragment = fragmentRaw.replace(/^[\s​]+/, '').replace(/[\s​]+$/, '');
        // Look for the CTE name in the body AFTER the marker.
        const body = sql.slice(cur.markerEnd, nextStart);
        const cteMatch = body.match(CTE_NAME_RE);
        out.push({
            sectionId: cur.sectionId,
            cteName: cteMatch ? cteMatch[1] : null,
            sqlFragment: fragment,
            startOffset: cur.markerStart,
        });
    }
    return out;
}

/**
 * Annotate a SqlSection[] by the IR's section definitions so the UI can
 * render section labels + the section's natural-language hint alongside
 * the SQL fragment. Sections in the IR but missing from the SQL are
 * reported as `coverage.missing[]`; SQL sections that don't match any IR
 * section land in `coverage.unexpected[]`.
 *
 * @param {SqlSection[]} sections
 * @param {{ sections?: Array<{ id: string, required?: boolean, hint?: string }> }} [outputSpec]
 * @returns {{ annotated: Array<SqlSection & { matchedSpec: object | null }>, coverage: { missing: string[], unexpected: string[] } }}
 */
function annotateAgainstIR(sections, outputSpec) {
    const specSections = Array.isArray(outputSpec?.sections) ? outputSpec.sections : [];
    const specById = new Map(specSections.map(s => [String(s.id).toUpperCase(), s]));
    const seenSectionIds = new Set();

    const annotated = sections.map(sec => {
        const spec = specById.get(sec.sectionId) || null;
        seenSectionIds.add(sec.sectionId);
        return { ...sec, matchedSpec: spec };
    });

    const missing = specSections
        .map(s => String(s.id).toUpperCase())
        .filter(id => !seenSectionIds.has(id));
    const unexpected = [...seenSectionIds].filter(id => !specById.has(id));

    return {
        annotated,
        coverage: { missing, unexpected },
    };
}

const SQL_FENCE_RE = /```(?:sql|SQL)\s*\r?\n([\s\S]*?)```/g;

/**
 * extractSqlSectionsFromMarkdown — Phase 11b FM symmetry helper.
 *
 * Foundation Model responses (and any other backend that returns markdown
 * rather than Genie-style `attachments[].query.query`) embed SQL inside
 * ```sql fences. The FM prompt translator already injects the same
 * `/* Section: X *​/` directive that the Genie translator uses, so the
 * markers can appear anywhere inside an FM-emitted SQL fence.
 *
 * This helper finds every ```sql / ```SQL fence in the markdown, runs
 * extractSqlSections() on each fence body, and returns the union of all
 * sections in document order. Empty when no fences contain markers.
 *
 * Why not just run extractSqlSections() on the full markdown:
 *   - The fragment substring would include markdown prose around the SQL
 *   - The CTE-name detection would fire on natural-language words like
 *     "AS" inside narrative text
 * Fence-scoping keeps the extractor's contract clean.
 *
 * @param {string} markdown
 * @returns {SqlSection[]}
 */
function extractSqlSectionsFromMarkdown(markdown) {
    if (typeof markdown !== 'string' || markdown.length === 0) return [];
    /** @type {SqlSection[]} */
    const out = [];
    SQL_FENCE_RE.lastIndex = 0;
    let match;
    while ((match = SQL_FENCE_RE.exec(markdown)) !== null) {
        const fenceBody = match[1];
        if (typeof fenceBody !== 'string' || fenceBody.length === 0) continue;
        const sections = extractSqlSections(fenceBody);
        if (sections.length === 0) continue;
        // Offset each section's startOffset into the original markdown so
        // consumers can resolve back to the source if they want to (e.g.,
        // for "jump to source" navigation in a diagnostic view).
        const fenceContentStart = match.index + match[0].indexOf(fenceBody);
        for (const sec of sections) {
            out.push({
                ...sec,
                startOffset: fenceContentStart + sec.startOffset,
            });
        }
    }
    return out;
}

module.exports = {
    extractSqlSections,
    extractSqlSectionsFromMarkdown,
    annotateAgainstIR,
};
