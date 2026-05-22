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
 * Slot values are sanitised before interpolation: only allow word chars,
 * spaces, dots, dashes, and underscores. Anything else → throw. Power BI
 * `executeQueries` rejects invalid DAX cleanly, but local sanitisation
 * keeps unintended SQL/DAX injection vectors closed even if the matcher
 * misbehaves.
 */

const SLOT_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_ .-]{0,80}$/;

function sanitiseSlotName(value, slotName) {
    if (typeof value !== 'string') throw new Error(`Slot "${slotName}" must be a string`);
    const trimmed = value.trim();
    if (!SLOT_NAME_RE.test(trimmed)) {
        throw new Error(`Slot "${slotName}" value "${trimmed.slice(0, 40)}" contains characters not allowed in a Power BI identifier`);
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
    return `[${sanitiseSlotName(name, 'measure')}]`;
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
        const header = '| ' + columns.join(' | ') + ' |';
        const sep = '| ' + columns.map(() => '---').join(' | ') + ' |';
        const body = rows.map(r => '| ' + r.map(formatCell).join(' | ') + ' |').join('\n');
        return {
            content: `## Top ${rows.length} ${slots.dimensionColumn} by ${slots.measure}\n\n${header}\n${sep}\n${body}`,
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
        const header = '| ' + columns.join(' | ') + ' |';
        const sep = '| ' + columns.map(() => '---').join(' | ') + ' |';
        const body = rows.map(r => '| ' + r.map(formatCell).join(' | ') + ' |').join('\n');
        return {
            content: `## ${slots.measure} by ${slots.dimensionColumn} (${rows.length} groups)\n\n${header}\n${sep}\n${body}`,
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
        const header = '| ' + columns.join(' | ') + ' |';
        const sep = '| ' + columns.map(() => '---').join(' | ') + ' |';
        const body = rows.map(r => '| ' + r.map(formatCell).join(' | ') + ' |').join('\n');
        return {
            content: `## ${slots.measure} over ${slots.dateColumn}${headline}\n\n${header}\n${sep}\n${body}`,
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
        if (value == null) return { content: `_${slots.measure} returned no value._` };
        return { content: `**${slots.measure}**: ${formatCell(value)}` };
    },
};

/* ───── Cell formatter (Markdown-safe) ────────────────────────────── */

function formatCell(value) {
    if (value == null) return '';
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return String(value);
        // Format with up to 4 decimals but trim trailing zeros, thousands separators.
        const abs = Math.abs(value);
        if (abs >= 1000 && Number.isInteger(value)) return value.toLocaleString('en-US');
        const fixed = value.toFixed(4).replace(/\.?0+$/, '');
        if (abs >= 1000) {
            const [whole, frac] = fixed.split('.');
            return frac ? Number(whole).toLocaleString('en-US') + '.' + frac : Number(whole).toLocaleString('en-US');
        }
        return fixed;
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    // Escape Markdown table pipes in string cells.
    return String(value).replace(/\|/g, '\\|');
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
    __internals: { sanitiseSlotName, clampTopN, formatCell, quoteTable, bracketColumn, bracketMeasure },
};
