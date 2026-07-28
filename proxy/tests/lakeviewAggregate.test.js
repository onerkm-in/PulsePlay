/**
 * Push-down aggregation.
 *
 * The point is scale-independence: a chart returns dozens of GROUPS whether the
 * underlying table holds 5 thousand rows or 5 billion, so neither our row cap
 * nor the Statement Execution API's inline-result ceiling decides whether a
 * dashboard renders correctly.
 *
 * The rule these pins protect: DECLINE rather than guess. Every null return
 * means the caller runs the dashboard author's SQL unchanged, which is the
 * behaviour that shipped before this existed - so a wrong guess is the only way
 * this feature can do damage, and it never guesses.
 */
const { buildAggregateSql, findWidgetByName, parseField } = require('../lib/lakeviewAggregate');

const DATASET_SQL = 'SELECT * FROM tickets WHERE status IS NOT NULL';

// Encodings copied from the real dbdemos dashboard spec.
const BAR = {
    name: 'w-bar',
    spec: {
        widgetType: 'bar',
        encodings: {
            x: { fieldName: 'source', scale: { type: 'categorical' } },
            y: { fieldName: 'count(*)', scale: { type: 'quantitative' } },
            color: { fieldName: 'agent_group', scale: { type: 'categorical' } },
        },
    },
};
const LINE = {
    name: 'w-line',
    spec: {
        widgetType: 'line',
        encodings: {
            x: { fieldName: 'monthly(created_time)', scale: { type: 'temporal' } },
            y: { fieldName: 'count(ticket_id)', scale: { type: 'quantitative' } },
            color: { fieldName: 'priority', scale: { type: 'categorical' } },
        },
    },
};
const PIE = {
    name: 'w-pie',
    spec: {
        widgetType: 'pie',
        encodings: {
            angle: { fieldName: 'count(ticket_id)', scale: { type: 'quantitative' } },
            color: { fieldName: 'status', scale: { type: 'categorical' } },
        },
    },
};

describe('buildAggregateSql — the happy paths from the real spec', () => {
    test('bar: groups by both categorical channels and counts', () => {
        const sql = buildAggregateSql(DATASET_SQL, BAR);
        expect(sql).toContain('SELECT `source` AS `source`');
        expect(sql).toContain('`agent_group` AS `agent_group`');
        expect(sql).toContain('COUNT(*) AS `count(*)`');
        expect(sql).toContain(`FROM (${DATASET_SQL}) AS pp_src`);
        expect(sql).toContain('GROUP BY `source`, `agent_group`');
        expect(sql).toMatch(/LIMIT \d+$/);
    });

    test('line: a temporal bucket becomes DATE_TRUNC, aliased to the encoding name', () => {
        const sql = buildAggregateSql(DATASET_SQL, LINE);
        // alias must equal the fieldName so the client mapper binds unchanged
        expect(sql).toContain("DATE_TRUNC('MONTH', `created_time`) AS `monthly(created_time)`");
        expect(sql).toContain('COUNT(`ticket_id`) AS `count(ticket_id)`');
        expect(sql).toContain("GROUP BY DATE_TRUNC('MONTH', `created_time`), `priority`");
    });

    test('pie: angle is the measure, color the dimension', () => {
        const sql = buildAggregateSql(DATASET_SQL, PIE);
        expect(sql).toContain('COUNT(`ticket_id`) AS `count(ticket_id)`');
        expect(sql).toContain('GROUP BY `status`');
    });

    test('nests a statement that ends in a semicolon', () => {
        const sql = buildAggregateSql('SELECT * FROM t;  ', BAR);
        expect(sql).toContain('FROM (SELECT * FROM t) AS pp_src');
        expect(sql).not.toContain(';)');
    });
});

describe('buildAggregateSql — declines rather than guessing', () => {
    const decline = (widget, why) => test(why, () => expect(buildAggregateSql(DATASET_SQL, widget)).toBeNull());

    decline({ spec: { widgetType: 'counter', encodings: { value: { fieldName: 'count(*)' } } } },
        'counters are not charts');
    decline({ spec: { widgetType: 'table', encodings: { columns: [{ fieldName: 'a' }] } } },
        'tables want rows, not groups');
    decline({ spec: { widgetType: 'pivot', encodings: {} } },
        'unsupported widget kinds');
    decline({ spec: { widgetType: 'bar', encodings: { x: { fieldName: 'a' } } } },
        'no measure means nothing to aggregate');
    decline({ spec: { widgetType: 'bar', encodings: { y: { fieldName: 'count(*)' } } } },
        'no dimension means a grand total, not a chart');
    decline({ spec: { widgetType: 'bar', encodings: { x: { fieldName: 'a' }, y: { fieldName: 'revenue' } } } },
        'no aggregate anywhere - the dataset already carries computed values');
    decline({ spec: { widgetType: 'bar', encodings: { x: { fieldName: 'count(*)' }, y: { fieldName: 'sum(v)' } } } },
        'all measures and no dimension is a grand total, not a chart');
    decline({ spec: { widgetType: 'bar', encodings: { x: { fieldName: 'a + b' }, y: { fieldName: 'count(*)' } } } },
        'arithmetic in a field name');
    decline({ spec: { widgetType: 'bar', encodings: { x: { fieldName: 'sum(count(x))' }, y: { fieldName: 'count(*)' } } } },
        'nested calls');
    decline({ spec: { widgetType: 'bar', encodings: { x: { fieldName: 'weird(col)' }, y: { fieldName: 'count(*)' } } } },
        'unknown functions');
    decline({ spec: { widgetType: 'bar', encodings: { x: { fieldName: 'a' }, y: { fieldName: 'sum(*)' } } } },
        'SUM(*) is not a thing');

    test('no SQL and no widget', () => {
        expect(buildAggregateSql('', BAR)).toBeNull();
        expect(buildAggregateSql(DATASET_SQL, null)).toBeNull();
        expect(buildAggregateSql(DATASET_SQL, {})).toBeNull();
    });
});

describe('buildAggregateSql — identifiers cannot break out', () => {
    const hostile = (fieldName) => ({
        spec: { widgetType: 'bar', encodings: { x: { fieldName }, y: { fieldName: 'count(*)' } } },
    });

    test.each([
        ['a` FROM x; DROP TABLE t; --', 'backtick escape'],
        ['a; DROP TABLE t', 'statement break'],
        ["a' OR 1=1", 'quote injection'],
        ['a)--', 'comment out'],
        ['*', 'wildcard as a dimension'],
        ['1', 'leading digit'],
    ])('declines %s (%s)', (fieldName) => {
        expect(buildAggregateSql(DATASET_SQL, hostile(fieldName))).toBeNull();
    });

    test('a legitimate column with spaces is quoted, not rejected', () => {
        const sql = buildAggregateSql(DATASET_SQL, hostile('Agent Group'));
        expect(sql).toContain('`Agent Group`');
    });
});

describe('parseField', () => {
    test('classifies the shapes real specs use', () => {
        expect(parseField('source')).toEqual({ kind: 'column', column: 'source' });
        expect(parseField('count(*)')).toEqual({ kind: 'agg', fn: 'count', arg: '*' });
        expect(parseField('sum(revenue)')).toEqual({ kind: 'agg', fn: 'sum', arg: 'revenue' });
        expect(parseField('monthly(created_time)')).toEqual({ kind: 'temporal', unit: 'MONTH', column: 'created_time' });
        expect(parseField('yearly(d)').unit).toBe('YEAR');
    });
    test('rejects what it cannot classify', () => {
        expect(parseField('')).toBeNull();
        expect(parseField(null)).toBeNull();
        expect(parseField('a + b')).toBeNull();
        expect(parseField('monthly(*)')).toBeNull();
    });
});

describe('findWidgetByName', () => {
    const spec = { pages: [{ layout: [{ widget: BAR }] }, { layout: [{ widget: PIE }] }] };
    test('finds across pages, returns null for unknown', () => {
        expect(findWidgetByName(spec, 'w-pie')).toBe(PIE);
        expect(findWidgetByName(spec, 'nope')).toBeNull();
        expect(findWidgetByName(null, 'w-bar')).toBeNull();
    });
});

describe('buildAggregateSql — channel roles come from the field, not the slot', () => {
    // Observed on the reference dashboard: two horizontal bars put the MEASURE
    // on x and the DIMENSION on y. Assuming slot semantics declined both, and
    // each fell back to an 800 KB page.
    const HORIZONTAL_BAR = {
        name: 'w-hbar',
        spec: {
            widgetType: 'bar',
            encodings: {
                x: { fieldName: 'count(*)' },
                y: { fieldName: 'survey_results' },
                color: { fieldName: 'agent_group' },
            },
        },
    };

    test('a horizontal bar aggregates instead of declining', () => {
        const sql = buildAggregateSql(DATASET_SQL, HORIZONTAL_BAR);
        expect(sql).not.toBeNull();
        expect(sql).toContain('COUNT(*) AS `count(*)`');
        expect(sql).toContain('GROUP BY `survey_results`, `agent_group`');
    });

    test('a field repeated across channels is emitted once', () => {
        const sql = buildAggregateSql(DATASET_SQL, {
            spec: {
                widgetType: 'bar',
                encodings: {
                    x: { fieldName: 'source' },
                    color: { fieldName: 'source' },
                    y: { fieldName: 'count(*)' },
                },
            },
        });
        expect(sql).toContain('GROUP BY `source`');
        expect(sql).not.toContain('GROUP BY `source`, `source`');
    });
});
