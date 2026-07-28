// proxy/lib/lakeviewAggregate.js
//
// Push-down aggregation for Lakeview chart widgets.
//
// A chart widget's encodings are a GROUP BY in disguise:
//
//     x     = source        (categorical)  -> dimension
//     color = agent_group   (categorical)  -> dimension
//     y     = count(*)      (quantitative) -> measure
//
// so instead of fetching the dataset's raw rows and grouping in the browser,
// wrap the author's SQL and let the warehouse aggregate:
//
//     SELECT `source`, `agent_group`, COUNT(*) AS `count(*)`
//     FROM ( <author SQL> ) AS pp_src
//     GROUP BY `source`, `agent_group`
//
// That returns dozens of rows whether the table holds 5 thousand or 5 billion,
// which is what makes this scale-independent: the row cap stops mattering, the
// Statement Execution API's inline-result ceiling stops mattering, and the
// warehouse does the work it is good at.
//
// SAFETY, because this generates SQL:
//  - Field names come from the DASHBOARD SPEC, never from the browser. The
//    caller names a widget; the server reads that widget's encodings out of the
//    spec it fetched itself.
//  - Identifiers are still validated against a strict pattern and backtick-
//    quoted. Anything unexpected returns null.
//  - Returning null is always safe: the caller falls back to running the
//    author's SQL unchanged, which is the behaviour that shipped before this.
//
// Conservative by design. Anything not confidently mappable is declined rather
// than guessed, because a silently mis-aggregated chart is worse than a slower
// correct one.

/** Databricks temporal bucket helpers seen in real specs, mapped to DATE_TRUNC units. */
const TEMPORAL_UNITS = {
    hourly: 'HOUR',
    daily: 'DAY',
    weekly: 'WEEK',
    monthly: 'MONTH',
    quarterly: 'QUARTER',
    yearly: 'YEAR',
};

const AGG_FNS = new Set(['count', 'sum', 'avg', 'min', 'max']);

/** Column names we are willing to quote. Databricks allows spaces; a backtick
 *  would break quoting, so it is rejected outright rather than escaped. */
const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_ .]*$/;

function quoteIdent(name) {
    if (typeof name !== 'string' || !SAFE_IDENT.test(name) || name.includes('`')) return null;
    return '`' + name + '`';
}

/** Alias exactly the encoding's fieldName so the client mapper, which looks
 *  columns up by fieldName, binds without any extra translation. */
function quoteAlias(fieldName) {
    if (typeof fieldName !== 'string' || fieldName.includes('`')) return null;
    return '`' + fieldName + '`';
}

/**
 * Classify an encoding fieldName.
 *   "source"                -> { kind: 'column' }
 *   "monthly(created_time)" -> { kind: 'temporal', unit, column }
 *   "count(*)"              -> { kind: 'agg', fn: 'count', arg: '*' }
 *   "sum(revenue)"          -> { kind: 'agg', fn: 'sum', arg: 'revenue' }
 * Returns null for anything else - nested calls, arithmetic, unknown functions.
 */
function parseField(fieldName) {
    if (typeof fieldName !== 'string') return null;
    const raw = fieldName.trim();
    if (!raw) return null;

    const call = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*(\*|[A-Za-z_][A-Za-z0-9_ .]*)\s*\)$/.exec(raw);
    if (!call) {
        return SAFE_IDENT.test(raw) ? { kind: 'column', column: raw } : null;
    }
    const fn = call[1].toLowerCase();
    const arg = call[2].trim();
    if (TEMPORAL_UNITS[fn]) {
        return arg === '*' ? null : { kind: 'temporal', unit: TEMPORAL_UNITS[fn], column: arg };
    }
    if (AGG_FNS.has(fn)) {
        if (fn !== 'count' && arg === '*') return null; // SUM(*) is not a thing
        return { kind: 'agg', fn, arg };
    }
    return null;
}

/** SQL for a dimension channel, or null if it cannot be expressed safely. */
function dimensionSql(parsed) {
    if (parsed.kind === 'column') return quoteIdent(parsed.column);
    if (parsed.kind === 'temporal') {
        const col = quoteIdent(parsed.column);
        return col ? `DATE_TRUNC('${parsed.unit}', ${col})` : null;
    }
    return null;
}

/** SQL for a measure channel, or null. */
function measureSql(parsed) {
    if (parsed.kind !== 'agg') return null;
    const fn = parsed.fn.toUpperCase();
    if (parsed.arg === '*') return `${fn}(*)`;
    const col = quoteIdent(parsed.arg);
    return col ? `${fn}(${col})` : null;
}

/** Strip trailing semicolons/whitespace so the statement nests as a subquery. */
function nestable(sql) {
    return String(sql || '').trim().replace(/;\s*$/, '').trim();
}

// Every channel that can carry a field. Roles are decided by what the field
// PARSES as, not by which slot it sits in: a horizontal bar puts the measure on
// x and the dimension on y, and assuming slot semantics silently declined every
// such widget (observed on the reference dashboard - two bars fell back to a
// 800 KB page because "x" held count(*)).
const FIELD_CHANNELS = ['x', 'y', 'color', 'label', 'angle', 'value', 'size'];

/**
 * Build an aggregating wrapper for a widget, or null when it is not
 * confidently mappable (caller then runs the author's SQL unchanged).
 *
 * `groupLimit` bounds the number of GROUPS returned - a high-cardinality
 * dimension should not become an unbounded payload just because it aggregates.
 */
function buildAggregateSql(datasetSql, widget, { groupLimit = 5000 } = {}) {
    const sql = nestable(datasetSql);
    if (!sql) return null;

    const kind = widget?.spec?.widgetType;
    // Only charts. counters read a single value, tables want rows, and the
    // rest are not ours to reinterpret.
    if (!kind || !['bar', 'line', 'area', 'pie', 'scatter', 'combo'].includes(kind)) return null;

    const encodings = widget?.spec?.encodings;
    if (!encodings || typeof encodings !== 'object') return null;

    const dims = [];
    const measures = [];
    const seen = new Set();

    for (const ch of FIELD_CHANNELS) {
        const enc = encodings[ch];
        if (!enc?.fieldName) continue;
        // The same field can appear on two channels (e.g. colour repeating the
        // x dimension); emit it once so GROUP BY stays valid.
        if (seen.has(enc.fieldName)) continue;
        seen.add(enc.fieldName);

        const parsed = parseField(enc.fieldName);
        if (!parsed) return null;               // unknown shape -> decline
        const alias = quoteAlias(enc.fieldName);
        if (!alias) return null;

        if (parsed.kind === 'agg') {
            const expr = measureSql(parsed);
            if (!expr) return null;
            measures.push({ expr, alias });
        } else {
            const expr = dimensionSql(parsed);
            if (!expr) return null;
            dims.push({ expr, alias });
        }
    }

    // A chart needs something to group BY and something to aggregate. Zero
    // measures means the dataset already carries computed values, and grouping
    // those would need SUM-of-SUM reasoning this will not guess at; zero
    // dimensions is a grand total, not a chart.
    if (measures.length === 0) return null;
    if (dims.length === 0) return null;

    const selectList = [
        ...dims.map(d => `${d.expr} AS ${d.alias}`),
        ...measures.map(m => `${m.expr} AS ${m.alias}`),
    ].join(', ');
    const groupBy = dims.map(d => d.expr).join(', ');

    return `SELECT ${selectList} FROM (${sql}) AS pp_src GROUP BY ${groupBy} LIMIT ${Number(groupLimit) || 5000}`;
}

/** Find a widget by its spec `name` across every page. */
function findWidgetByName(spec, widgetName) {
    if (!spec || !widgetName) return null;
    for (const page of spec.pages || []) {
        for (const item of page?.layout || []) {
            if (item?.widget?.name === widgetName) return item.widget;
        }
    }
    return null;
}

module.exports = {
    buildAggregateSql,
    findWidgetByName,
    parseField,
    TEMPORAL_UNITS,
    AGG_FNS,
};
