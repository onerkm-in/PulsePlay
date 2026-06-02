// @ts-check
'use strict';

/**
 * powerbiDaxTemplates.js — deterministic DAX template library.
 *
 * Each template is a pure function: given filled slots, returns a DAX
 * query string. The companion matcher (`powerbiQuestionMatcher.js`)
 * picks the template and fills the slots from the user question +
 * probed schema. No LLM is involved at any step.
 *
 * Template shape
 * ──────────────
 *   {
 *     id:           unique template id
 *     label:        author-visible name
 *     description:  one-line description (used in "I can answer…" fallback)
 *     slots:        { [name]: { kind, required } } — what the matcher must extract
 *     buildDax:     (slots) => string
 *     buildResult:  ({ columns, rows, slots }) => { content, sqlQuery? }  for Markdown
 *   }
 *
 * Slot kinds
 * ──────────
 *   - "measure":   a measure name from probe.declaredKpis
 *   - "dimension": a table.column from probe.schema (a non-measure attribute)
 *   - "topN":      an integer (default 10)
 *
 * DAX safety
 * ──────────
 * Slot values are sanitised before interpolation: dimensions only allow word
 * chars, spaces, dots, dashes, and underscores; measures also allow `%` because
 * Power BI measure names commonly encode rates as "YoY %". Anything else →
 * throw. Power BI
 * `executeQueries` rejects invalid DAX cleanly, but local sanitisation
 * keeps unintended SQL/DAX injection vectors closed even if the matcher
 * misbehaves.
 */

const SLOT_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_ .-]{0,80}$/;
const MEASURE_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_ .%()-]{0,80}$/;

function sanitiseSlotName(value, slotName) {
    if (typeof value !== 'string') throw new Error(`Slot "${slotName}" must be a string`);
    const trimmed = value.trim();
    if (!SLOT_NAME_RE.test(trimmed)) {
        throw new Error(`Slot "${slotName}" value "${trimmed.slice(0, 40)}" contains characters not allowed in a Power BI identifier`);
    }
    return trimmed;
}

function sanitiseMeasureName(value) {
    if (typeof value !== 'string') throw new Error('Slot "measure" must be a string');
    const trimmed = value.trim();
    if (!MEASURE_NAME_RE.test(trimmed)) {
        throw new Error(`Slot "measure" value "${trimmed.slice(0, 40)}" contains characters not allowed in a Power BI measure identifier`);
    }
    return trimmed;
}

function quoteTable(name) {
    return `'${sanitiseSlotName(name, 'table').replace(/'/g, "''")}'`;
}

function bracketColumn(name) {
    return `[${sanitiseSlotName(name, 'column')}]`;
}

function bracketMeasure(name) {
    return `[${sanitiseMeasureName(name)}]`;
}

function clampTopN(n) {
    const v = typeof n === 'number' ? Math.floor(n) : parseInt(n, 10);
    if (!Number.isFinite(v) || v <= 0) return 10;
    if (v > 100) return 100;
    return v;
}

/* ───── Template: top-n ────────────────────────────────────────────── */

const topN = {
    id: 'top-n',
    label: 'Top-N by measure',
    description: 'Show the top N rows of a dimension ranked by a measure (e.g. top 10 products by revenue).',
    examples: [
        'Top 10 customers by revenue',
        'Top 5 products by profit margin',
        'Top 20 regions by sales',
    ],
    slots: {
        measure: { kind: 'measure', required: true },
        dimensionTable: { kind: 'string', required: true },
        dimensionColumn: { kind: 'string', required: true },
        n: { kind: 'topN', required: false, default: 10 },
    },
    buildDax(slots) {
        const table = quoteTable(slots.dimensionTable);
        const column = bracketColumn(slots.dimensionColumn);
        const measure = bracketMeasure(slots.measure);
        const n = clampTopN(slots.n ?? 10);
        return `EVALUATE TOPN(${n}, SUMMARIZECOLUMNS(${table}${column}, "${slots.measure}", ${measure}), [${slots.measure}], DESC) ORDER BY [${slots.measure}] DESC`;
    },
    buildResult({ columns, rows, slots }) {
        if (rows.length === 0) {
            return { content: `_No rows returned for ${slots.measure} by ${slots.dimensionTable}[${slots.dimensionColumn}]._` };
        }
        const { header, sep, body } = mdTable(columns, rows);
        return {
            content: `## Top ${rows.length} ${slots.dimensionColumn} by ${slots.measure}\n\n${header}\n${sep}\n${body}`,
            // Structured result so the client renders a chart + table (Genie
            // parity) instead of a markdown-only table. Humanized headers,
            // raw numeric rows so the chart can plot + format them.
            queryResult: { columns: columns.map(humanizeDaxColumn), rows },
        };
    },
};

/* ───── Template: aggregate-by ─────────────────────────────────────── */

const aggregateBy = {
    id: 'aggregate-by',
    label: 'Aggregate measure by dimension',
    description: 'Group a measure by a dimension and return all categories (e.g. revenue by region).',
    examples: [
        'Revenue by region',
        'Profit margin by category',
        'Order count by ship mode',
    ],
    slots: {
        measure: { kind: 'measure', required: true },
        dimensionTable: { kind: 'string', required: true },
        dimensionColumn: { kind: 'string', required: true },
    },
    buildDax(slots) {
        const table = quoteTable(slots.dimensionTable);
        const column = bracketColumn(slots.dimensionColumn);
        const measure = bracketMeasure(slots.measure);
        return `EVALUATE SUMMARIZECOLUMNS(${table}${column}, "${slots.measure}", ${measure}) ORDER BY [${slots.measure}] DESC`;
    },
    buildResult({ columns, rows, slots }) {
        if (rows.length === 0) {
            return { content: `_No rows returned for ${slots.measure} by ${slots.dimensionTable}[${slots.dimensionColumn}]._` };
        }
        const { header, sep, body } = mdTable(columns, rows);
        return {
            content: `## ${slots.measure} by ${slots.dimensionColumn} (${rows.length} groups)\n\n${header}\n${sep}\n${body}`,
            queryResult: { columns: columns.map(humanizeDaxColumn), rows },
        };
    },
};

/* ───── Template: trend ────────────────────────────────────────────── */

const trend = {
    id: 'trend',
    label: 'Measure over time',
    description: 'Plot a measure across a date dimension (e.g. revenue by month).',
    examples: [
        'Revenue by month',
        'Order count over time',
        'Profit margin by year',
    ],
    slots: {
        measure: { kind: 'measure', required: true },
        dateTable: { kind: 'string', required: true },
        dateColumn: { kind: 'string', required: true },
    },
    buildDax(slots) {
        const table = quoteTable(slots.dateTable);
        const column = bracketColumn(slots.dateColumn);
        const measure = bracketMeasure(slots.measure);
        return `EVALUATE SUMMARIZECOLUMNS(${table}${column}, "${slots.measure}", ${measure}) ORDER BY ${table}${column} ASC`;
    },
    buildResult({ columns, rows, slots }) {
        if (rows.length === 0) {
            return { content: `_No rows returned for ${slots.measure} over ${slots.dateTable}[${slots.dateColumn}]._` };
        }
        // Compute a tiny min/max headline.
        const measureColIdx = columns.length - 1;
        const values = rows.map(r => Number(r[measureColIdx])).filter(Number.isFinite);
        const min = values.length ? Math.min(...values) : null;
        const max = values.length ? Math.max(...values) : null;
        const first = rows[0][measureColIdx];
        const last = rows[rows.length - 1][measureColIdx];
        const direction = typeof first === 'number' && typeof last === 'number'
            ? (last > first ? '↑ rising' : last < first ? '↓ falling' : '→ flat')
            : '';
        const headline = (min != null && max != null)
            ? `\n\n_${rows.length} points. Min ${formatCell(min)} · Max ${formatCell(max)}${direction ? ' · ' + direction : ''}._`
            : '';
        const { header, sep, body } = mdTable(columns, rows);
        return {
            content: `## ${slots.measure} over ${slots.dateColumn}${headline}\n\n${header}\n${sep}\n${body}`,
            queryResult: { columns: columns.map(humanizeDaxColumn), rows },
        };
    },
};

/* ───── Template: total ────────────────────────────────────────────── */

const total = {
    id: 'total',
    label: 'Single measure total',
    description: 'Return the grand total of one measure (e.g. total revenue).',
    examples: [
        'Total revenue',
        'Total orders',
        'Average margin',
    ],
    slots: {
        measure: { kind: 'measure', required: true },
    },
    buildDax(slots) {
        const measure = bracketMeasure(slots.measure);
        return `EVALUATE { (${measure}) }`;
    },
    buildResult({ rows, slots }) {
        const value = rows?.[0]?.[0];
        if (value == null) {
            return {
                content: `## ${slots.measure}\n\n| Metric | Value |\n| --- | --- |\n| ${formatCell(slots.measure)} | (no value) |`,
            };
        }
        return {
            content: `## ${slots.measure}\n\n| Metric | Value |\n| --- | --- |\n| ${formatCell(slots.measure)} | ${formatCell(value)} |`,
        };
    },
};

/* ───── Cell formatter (Markdown-safe) ────────────────────────────── */

function formatCell(value) {
    if (value == null) return '';
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return String(value);
        const abs = Math.abs(value);
        // Large magnitudes (currency/counts) read as whole grouped numbers —
        // the raw DAX precision (e.g. 1161401.345) is noise at this scale.
        if (abs >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
        // Sub-1000: keep up to 4 decimals, trim trailing zeros (margins, rates).
        return value.toFixed(4).replace(/\.?0+$/, '');
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    // Escape Markdown table pipes in string cells.
    return String(value).replace(/\|/g, '\\|');
}

/* ───── DAX column-name humanization ──────────────────────────────────
 * executeQueries returns columns in raw DAX form: `DIMCUSTOMER[SEGMENT]`,
 * `'Dim Date'[Year]`, `[Total Sales]`. Strip the table qualifier + brackets
 * and Title-Case the result so the briefing shows "Segment" / "Year" /
 * "Total Sales" instead of the model-internal names. KB-grounded display:
 * the deterministic path gets the same human labels the Genie path emits. */
function humanizeDaxColumn(raw) {
    let s = String(raw == null ? '' : raw).trim();
    const bracket = s.match(/\[([^\]]+)\]\s*$/);
    if (bracket) s = bracket[1];          // last bracketed segment wins
    s = s.replace(/^'+|'+$/g, '').trim();  // strip 'Table' quotes
    if (!s) return String(raw || '');
    const words = s.includes(' ')
        ? s.split(/\s+/)
        : s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[_-]+/);
    return words.filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ') || String(raw || '');
}

/** Column-aware cell formatter: years stay un-grouped (2014, not 2,014);
 *  everything else defers to formatCell. */
function formatCellCol(value, columnLabel) {
    if (typeof value === 'number' && Number.isFinite(value)
        && /\byear\b/i.test(columnLabel || '')
        && Number.isInteger(value) && value >= 1000 && value <= 9999) {
        return String(value);
    }
    return formatCell(value);
}

/** Build a Markdown table with humanized headers + column-aware cells. */
function mdTable(columns, rows) {
    const labels = (columns || []).map(humanizeDaxColumn);
    const header = '| ' + labels.join(' | ') + ' |';
    const sep = '| ' + labels.map(() => '---').join(' | ') + ' |';
    const body = (rows || [])
        .map(r => '| ' + r.map((cell, ci) => formatCellCol(cell, labels[ci])).join(' | ') + ' |')
        .join('\n');
    return { header, sep, body };
}

/* ───── Registry ───────────────────────────────────────────────────── */

const TEMPLATES = Object.freeze({
    'top-n': topN,
    'aggregate-by': aggregateBy,
    'trend': trend,
    'total': total,
});

function getTemplate(id) {
    return TEMPLATES[id] || null;
}

function listTemplates() {
    return Object.values(TEMPLATES).map(t => ({
        id: t.id,
        label: t.label,
        description: t.description,
        examples: t.examples,
    }));
}

module.exports = {
    TEMPLATES,
    getTemplate,
    listTemplates,
    // Internal helpers exposed for tests.
    __internals: { sanitiseSlotName, sanitiseMeasureName, clampTopN, formatCell, quoteTable, bracketColumn, bracketMeasure },
};
