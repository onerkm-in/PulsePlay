#!/usr/bin/env node
// @ts-check
'use strict';

/**
 * scripts/check-prompt-ir.js
 *
 * Local validator for Prompt IR YAML/JSON files. Use as a pre-commit / CI
 * hook to catch IR shape problems before they reach the runtime.
 *
 * Usage:
 *   node scripts/check-prompt-ir.js <pack>/<sub-vertical>
 *   node scripts/check-prompt-ir.js cpg-fmcg/supply-chain
 *
 *   node scripts/check-prompt-ir.js --all
 *     Validates every prompt-ir.{yaml,json} discovered under pulsepacks/.
 *
 *   node scripts/check-prompt-ir.js --show <pack>/<sub-vertical> <backend>
 *     Prints the translated backend payload (for "what does Genie see?"
 *     style debugging). Backend is one of: genie, foundation-model,
 *     supervisor, openai, bedrock-llama.
 *
 * Exits non-zero when ANY IR fails validation. Suitable for CI.
 */

const fs = require('fs');
const path = require('path');

const PACKS_ROOT = path.resolve(__dirname, '..', 'pulsepacks');

function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printHelp();
        process.exit(args.length === 0 ? 1 : 0);
    }

    if (args[0] === '--all') {
        const targets = discoverAll();
        if (targets.length === 0) {
            console.warn('[check-prompt-ir] no prompt-ir.{yaml,json} files found under pulsepacks/');
            process.exit(0);
        }
        let failed = 0;
        for (const t of targets) {
            if (!validateOne(t.pack, t.subVertical)) failed += 1;
        }
        process.exit(failed === 0 ? 0 : 1);
    }

    if (args[0] === '--show') {
        const target = args[1];
        const backend = args[2] || 'genie';
        if (!target) {
            console.error('Usage: node scripts/check-prompt-ir.js --show <pack>/<sub-vertical> <backend>');
            process.exit(1);
        }
        const { pack, subVertical } = parsePackSubV(target);
        showTranslated(pack, subVertical, backend);
        return;
    }

    // Default: validate a single target.
    const { pack, subVertical } = parsePackSubV(args[0]);
    const ok = validateOne(pack, subVertical);
    process.exit(ok ? 0 : 1);
}

function parsePackSubV(input) {
    const parts = String(input || '').split('/').filter(Boolean);
    if (parts.length === 1) return { pack: parts[0], subVertical: '' };
    if (parts.length >= 2) return { pack: parts[0], subVertical: parts.slice(1).join('/') };
    return { pack: '', subVertical: '' };
}

function validateOne(pack, subVertical) {
    if (!pack) {
        console.error('Missing pack name. Usage: node scripts/check-prompt-ir.js <pack>/<sub-vertical>');
        return false;
    }
    // Lazy-require so --help works even when the proxy deps aren't installed.
    const { loadIR, validateIR } = requireFromProxy('./lib/promptIR');
    const tag = subVertical ? `${pack}/${subVertical}` : pack;

    // Detect which file (if any) was the source.
    const dir = subVertical
        ? path.join(PACKS_ROOT, pack, 'sub-verticals', subVertical)
        : path.join(PACKS_ROOT, pack);
    const yamlPath = path.join(dir, 'prompt-ir.yaml');
    const jsonPath = path.join(dir, 'prompt-ir.json');
    const yamlExists = fs.existsSync(yamlPath);
    const jsonExists = fs.existsSync(jsonPath);

    if (!yamlExists && !jsonExists) {
        console.log(`[check-prompt-ir] ${tag}: no prompt-ir.{yaml,json} authored — runtime will use synthetic IR from markdown`);
        return true;
    }

    if (yamlExists && jsonExists) {
        console.warn(`[check-prompt-ir] ${tag}: BOTH prompt-ir.yaml AND prompt-ir.json exist. Loader prefers YAML; consider removing one for clarity.`);
    }

    const ir = loadIR(pack, subVertical, { packsRoot: PACKS_ROOT });
    if (!ir) {
        console.error(`[check-prompt-ir] ${tag}: failed to load IR (parse error or unreadable file)`);
        return false;
    }
    const problems = validateIR(ir);
    if (problems.length === 0) {
        const source = ir.meta?.synthetic ? 'synthetic' : (yamlExists ? 'yaml' : 'json');
        console.log(`[check-prompt-ir] ✓ ${tag} (${source})`);
        return true;
    }
    console.error(`[check-prompt-ir] ✗ ${tag} — ${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
    for (const p of problems) console.error(`  - ${p}`);
    return false;
}

function showTranslated(pack, subVertical, backend) {
    const { loadIR } = requireFromProxy('./lib/promptIR');
    const { getTranslator, listTypes } = requireFromProxy('./lib/promptTranslators');
    const translator = getTranslator(backend);
    if (!translator) {
        console.error(`Unknown backend "${backend}". Known: ${listTypes().join(', ')}`);
        process.exit(1);
    }
    const ir = loadIR(pack, subVertical, { packsRoot: PACKS_ROOT });
    if (!ir) {
        console.error(`No IR loadable for ${pack}/${subVertical}`);
        process.exit(1);
    }
    const payload = translator.translate(ir, {
        userQuestion: '(example user question — would land here at runtime)',
        spaces: ['example-space-a', 'example-space-b'],
        schemaContext: '(example schema context for analytics-mode translators)',
    });
    console.log(JSON.stringify(payload, null, 2));
}

function discoverAll() {
    const out = [];
    let packs;
    try {
        packs = fs.readdirSync(PACKS_ROOT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
    } catch {
        return out;
    }
    for (const pack of packs) {
        // Pack-level
        const packDir = path.join(PACKS_ROOT, pack);
        if (fs.existsSync(path.join(packDir, 'prompt-ir.yaml')) || fs.existsSync(path.join(packDir, 'prompt-ir.json'))) {
            out.push({ pack, subVertical: '' });
        }
        // Sub-verticals
        const svRoot = path.join(packDir, 'sub-verticals');
        if (fs.existsSync(svRoot)) {
            const svs = fs.readdirSync(svRoot, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
            for (const sv of svs) {
                const svDir = path.join(svRoot, sv);
                if (fs.existsSync(path.join(svDir, 'prompt-ir.yaml')) || fs.existsSync(path.join(svDir, 'prompt-ir.json'))) {
                    out.push({ pack, subVertical: sv });
                }
            }
        }
    }
    return out;
}

function requireFromProxy(modulePath) {
    const full = path.resolve(__dirname, '..', 'proxy', modulePath);
    return require(full);
}

function printHelp() {
    console.log(`PulsePlay Prompt IR validator

Usage:
  node scripts/check-prompt-ir.js <pack>/<sub-vertical>
  node scripts/check-prompt-ir.js --all
  node scripts/check-prompt-ir.js --show <pack>/<sub-vertical> <backend>

Examples:
  node scripts/check-prompt-ir.js cpg-fmcg/supply-chain
  node scripts/check-prompt-ir.js --all
  node scripts/check-prompt-ir.js --show cpg-fmcg/supply-chain genie
  node scripts/check-prompt-ir.js --show cpg-fmcg/supply-chain foundation-model
`);
}

if (require.main === module) main();
