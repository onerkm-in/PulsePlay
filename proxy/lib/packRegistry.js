// @ts-check
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_PACKS_ROOT = path.resolve(__dirname, '..', '..', 'pulsepacks');

function titleCase(value) {
    return String(value || '')
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map(part => part[0].toUpperCase() + part.slice(1))
        .join(' ');
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function toSubVerticalInfo(item) {
    if (!item || !item.name) return null;
    const name = String(item.name).trim();
    if (!name) return null;
    return {
        name,
        displayName: item.displayName || titleCase(name),
        description: item.description || undefined,
        path: item.path || `sub-verticals/${name}`,
    };
}

function toPackInfo(manifest) {
    if (!manifest || !manifest.name) return null;
    const subVerticals = Array.isArray(manifest.subVerticals)
        ? manifest.subVerticals.map(toSubVerticalInfo).filter(Boolean)
        : [];
    return {
        name: String(manifest.name),
        displayName: manifest.displayName || titleCase(manifest.name),
        version: manifest.version || undefined,
        description: manifest.description || undefined,
        industries: Array.isArray(manifest.industries) ? manifest.industries : [],
        subVerticals,
        crossCutting: Array.isArray(manifest.crossCutting) ? manifest.crossCutting : [],
        aiCompatibility: Array.isArray(manifest.aiCompatibility) ? manifest.aiCompatibility : [],
        biCompatibility: Array.isArray(manifest.biCompatibility) ? manifest.biCompatibility : [],
        knowledgeBase: manifest.knowledgeBase || undefined,
        lastUpdated: manifest.lastUpdated || undefined,
    };
}

function listInstalledPacks(opts = {}) {
    const packsRoot = opts.packsRoot || DEFAULT_PACKS_ROOT;
    const allowed = Array.isArray(opts.allowedPacks) ? new Set(opts.allowedPacks) : null;
    let dirs;
    try {
        dirs = fs.readdirSync(packsRoot, { withFileTypes: true }).filter(d => d.isDirectory());
    } catch {
        return [];
    }

    const packs = [];
    for (const dir of dirs) {
        const manifest = readJson(path.join(packsRoot, dir.name, 'pack.json'));
        const info = toPackInfo(manifest);
        if (!info) continue;
        if (allowed && !allowed.has(info.name)) continue;
        packs.push(info);
    }
    packs.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return packs;
}

// Phase 8 (KB UI) — content readers. Each function returns a string
// (markdown content) or null when the file is absent. The Knowledge Base
// page renders these as plain markdown without executing any scripts.
// Paths are constructed defensively: every input passes through
// `isSafePackSegment` which mirrors `isValidPackIdentifier` in
// packPromptLoader.js (L15 defense in depth).

const KB_MAX_CONTENT_CHARS = 256 * 1024; // 256 KB per file — generous but bounded.

function isSafePackSegment(value) {
    if (typeof value !== 'string') return false;
    return /^[a-z0-9][a-z0-9-]{0,62}$/.test(value);
}

function safeReadMarkdown(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) return null;
        const raw = fs.readFileSync(filePath, 'utf8');
        if (typeof raw !== 'string') return null;
        if (raw.length > KB_MAX_CONTENT_CHARS) {
            return raw.slice(0, KB_MAX_CONTENT_CHARS) + '\n\n[…truncated]';
        }
        return raw;
    } catch {
        return null;
    }
}

function listSubVerticalDirs(packsRoot, pack) {
    try {
        const subRoot = path.join(packsRoot, pack, 'sub-verticals');
        return fs.readdirSync(subRoot, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name)
            .filter(isSafePackSegment)
            .sort((a, b) => a.localeCompare(b));
    } catch {
        return [];
    }
}

function listDemoConfigNames(packsRoot, pack) {
    try {
        const demoRoot = path.join(packsRoot, pack, 'demo-configs');
        return fs.readdirSync(demoRoot, { withFileTypes: true })
            .filter(d => d.isFile() && d.name.toLowerCase().endsWith('.json'))
            .map(d => d.name)
            .sort((a, b) => a.localeCompare(b));
    } catch {
        return [];
    }
}

/**
 * Load all the pack-level content (manifest + knowledge-base/* files +
 * sub-vertical index + demo config list) for the Knowledge Base page.
 * Returns null when the pack is missing or its identifier fails the
 * safety check.
 *
 * @param {string} pack
 * @param {{ packsRoot?: string }} [opts]
 */
function loadPackDetail(pack, opts = {}) {
    if (!isSafePackSegment(pack)) return null;
    const packsRoot = opts.packsRoot || DEFAULT_PACKS_ROOT;
    const packDir = path.join(packsRoot, pack);
    const manifest = readJson(path.join(packDir, 'pack.json'));
    const info = toPackInfo(manifest);
    if (!info) return null;
    return {
        ...info,
        readme: safeReadMarkdown(path.join(packDir, 'README.md')),
        migrationNotes: safeReadMarkdown(path.join(packDir, 'MIGRATION_NOTES.md')),
        knowledgeBase: {
            glossary: safeReadMarkdown(path.join(packDir, 'knowledge-base', 'glossary.md')),
            ontology: safeReadMarkdown(path.join(packDir, 'knowledge-base', 'ontology.md')),
            references: safeReadMarkdown(path.join(packDir, 'knowledge-base', 'references.md')),
        },
        installedSubVerticals: listSubVerticalDirs(packsRoot, pack),
        demoConfigs: listDemoConfigNames(packsRoot, pack),
    };
}

/**
 * Load the per-sub-vertical content (KPIs / sample-questions / prompt-context /
 * bi-ai-fit / readme). Both segments pass through `isSafePackSegment`.
 *
 * @param {string} pack
 * @param {string} subVertical
 * @param {{ packsRoot?: string }} [opts]
 */
function loadSubVerticalDetail(pack, subVertical, opts = {}) {
    if (!isSafePackSegment(pack)) return null;
    if (!isSafePackSegment(subVertical)) return null;
    const packsRoot = opts.packsRoot || DEFAULT_PACKS_ROOT;
    const svDir = path.join(packsRoot, pack, 'sub-verticals', subVertical);
    if (!fs.existsSync(svDir) || !fs.statSync(svDir).isDirectory()) return null;
    return {
        pack,
        subVertical,
        readme: safeReadMarkdown(path.join(svDir, 'README.md')),
        kpis: safeReadMarkdown(path.join(svDir, 'kpis.md')),
        sampleQuestions: safeReadMarkdown(path.join(svDir, 'sample-questions.md')),
        promptContext: safeReadMarkdown(path.join(svDir, 'prompt-context.md')),
        biAiFit: safeReadMarkdown(path.join(svDir, 'bi-ai-fit.md')),
    };
}

module.exports = {
    DEFAULT_PACKS_ROOT,
    listInstalledPacks,
    loadPackDetail,
    loadSubVerticalDetail,
    isSafePackSegment,
};
