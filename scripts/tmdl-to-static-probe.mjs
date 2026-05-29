#!/usr/bin/env node
// Parse a PBIP semantic model's TMDL files → static probe JSON so PulsePlay
// can route Ask Pulse / DAX-template questions against the dataset without
// needing Power BI's executeQueries REST API to enumerate INFO.MEASURES
// (which requires Premium / XMLA-enabled tenants).
//
// Usage:
//   node scripts/tmdl-to-static-probe.mjs \
//     --pbip "D:/Working_Folder/Artifacts/SalesPerformance.SemanticModel" \
//     --out  "proxy/config-static-probe-sales-performance.json"

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

function parseArgs(argv) {
    const out = {};
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--pbip') out.pbip = argv[++i];
        else if (a === '--out') out.out = argv[++i];
    }
    return out;
}

const args = parseArgs(process.argv);
if (!args.pbip || !args.out) {
    console.error('Usage: node scripts/tmdl-to-static-probe.mjs --pbip <SemanticModel folder> --out <output.json>');
    process.exit(1);
}

const root = resolve(args.pbip);
const tablesDir = join(root, 'definition', 'tables');
if (!existsSync(tablesDir)) { console.error(`tables dir not found: ${tablesDir}`); process.exit(1); }

const declaredKpis = [];
const tables = [];

for (const file of readdirSync(tablesDir).filter(f => f.endsWith('.tmdl'))) {
    const text = readFileSync(join(tablesDir, file), 'utf-8');
    // Table name from first line: "table <Name>"
    const tableMatch = text.match(/^\s*table\s+([^\n]+)/m);
    const tableName = tableMatch ? tableMatch[1].trim() : file.replace(/\.tmdl$/, '');

    // Collect measures: lines starting with `measure 'X' = ...` or `measure X = ...`
    const measureRe = /^\s*measure\s+(?:'([^']+)'|([A-Za-z_][\w\s]*?))\s*=/gm;
    let m;
    const tableMeasures = [];
    while ((m = measureRe.exec(text)) !== null) {
        const name = (m[1] || m[2] || '').trim();
        if (!name) continue;
        // Try to grab the displayFolder for this measure (the line after the
        // measure expression typically has displayFolder: <name>)
        const blockStart = m.index;
        const blockEnd = text.indexOf('\n\n', blockStart + 1);
        const block = text.slice(blockStart, blockEnd > 0 ? blockEnd : blockStart + 500);
        const folderMatch = block.match(/displayFolder:\s*([^\n]+)/);
        const folder = folderMatch ? folderMatch[1].trim() : undefined;
        declaredKpis.push({ name, table: tableName, displayFolder: folder });
        tableMeasures.push({ name, displayFolder: folder });
    }

    // Collect columns: lines like `column ColName` followed by `dataType: <type>` and `sourceColumn: <src>`
    const colRe = /^\s*column\s+([^\n]+)/gm;
    const columns = [];
    let c;
    while ((c = colRe.exec(text)) !== null) {
        const colName = c[1].trim().replace(/^['"]|['"]$/g, '');
        const blockStart = c.index;
        const blockEnd = text.indexOf('\n\n', blockStart + 1);
        const block = text.slice(blockStart, blockEnd > 0 ? blockEnd : blockStart + 400);
        const typeMatch = block.match(/dataType:\s*(\w+)/);
        const dataType = typeMatch ? typeMatch[1] : 'string';
        const isHidden = /\bisHidden\b/.test(block);
        columns.push({ name: colName, dataType, isHidden });
    }

    tables.push({
        name: tableName,
        sourceFile: file,
        columns,
        measures: tableMeasures,
    });
}

const probe = {
    metadataAvailability: 'rich',
    declaredKpis,
    schema: { tables },
    derivedFrom: 'tmdl-static-probe',
    derivedAt: new Date().toISOString(),
};

const outPath = resolve(args.out);
writeFileSync(outPath, JSON.stringify(probe, null, 2), 'utf-8');
console.log(`✓ wrote static probe → ${outPath}`);
console.log(`  measures: ${declaredKpis.length}`);
console.log(`  tables:   ${tables.length}`);
console.log(`  columns:  ${tables.reduce((a, t) => a + t.columns.length, 0)}`);
console.log('\nTo wire into a profile, add to proxy/config.json:');
console.log(`  "powerbi-dwd": {`);
console.log(`    ...,`);
console.log(`    "staticProbe": ${JSON.stringify(probe).slice(0, 80)}...`);
console.log(`  }`);
