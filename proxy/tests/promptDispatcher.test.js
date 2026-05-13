'use strict';

/**
 * promptDispatcher.test.js — Phase 11a.
 *
 * The dispatcher is the top-level facade: it picks a translator for the
 * given profile.type and feeds it the IR loaded for the requested
 * (pack, subVertical). These tests assert the routing decision and the
 * irSource diagnostic stamp.
 *
 * The dispatcher is ADDITIVE in Phase 11a — existing routes still call
 * packPromptInjector directly. The migration to dispatch happens in
 * Phase 11b. So these tests don't exercise the live server.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { buildBackendPayload } = require('../lib/promptDispatcher');
const { listTypes } = require('../lib/promptTranslators');
const { __rebuildIRCache } = require('../lib/promptIR');

function makeTmpPacksRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'pulseplay-disp-test-'));
}
function writePackFile(root, relPath, content) {
    const full = path.join(root, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
    return full;
}
function rmrf(p) {
    try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
}

beforeEach(() => __rebuildIRCache());

/* ─── Profile routing ────────────────────────────────────────────── */

describe('buildBackendPayload — translator routing by profile.type', () => {
    test('genie profile → kind=genie payload (authored IR → structured user message)', () => {
        // cpg-fmcg/supply-chain ships with an authored prompt-ir.yaml, so the
        // Genie translator emits a structured user message (not the legacy
        // [Pack Context: ...] header). Both endings carry the user question.
        const result = buildBackendPayload(
            { type: 'genie' },
            { pack: 'cpg-fmcg', subVertical: 'supply-chain', userQuestion: 'Q?' },
        );
        expect(result).not.toBeNull();
        expect(result.translator).toBe('genie');
        expect(result.payload.kind).toBe('genie');
        expect(result.payload.userMessage).toMatch(/\[Persona\]/);
        expect(result.payload.userMessage).toMatch(/\[Vocabulary\]/);
        expect(result.payload.userMessage).toMatch(/Q\?$/);
    });

    test('genie profile → legacy [Pack Context: ...] header when only synthetic IR exists', () => {
        // When this test was written (Phase 11a) we exercised the synthetic-IR
        // path against the real cpg-fmcg/sustainability pack. A later cycle
        // authored a prompt-ir.yaml for every cpg-fmcg sub-vertical, so the
        // synthetic fallback no longer triggers against the real fixtures.
        // Use a tmp packs root with markdown only to keep the legacy-header
        // contract under coverage.
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pulseplay-disp-synth-'));
        try {
            const dir = path.join(tmpRoot, 'mypack/sub-verticals/sv');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'prompt-context.md'), '# pack ctx\nSome curated prose.', 'utf8');
            const result = buildBackendPayload(
                { type: 'genie' },
                { pack: 'mypack', subVertical: 'sv', userQuestion: 'Q?' },
                { packsRoot: tmpRoot },
            );
            expect(result.translator).toBe('genie');
            expect(result.payload.userMessage).toMatch(/\[Pack Context: mypack\/sv\]/);
            expect(result.payload.userMessage).toMatch(/\[User Question\]\n\nQ\?$/);
        } finally {
            try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    });

    test('foundation-model profile → openai-compatible payload', () => {
        const result = buildBackendPayload(
            { type: 'foundation-model' },
            { pack: 'cpg-fmcg', subVertical: 'supply-chain', userQuestion: 'Q?' },
        );
        expect(result).not.toBeNull();
        expect(result.translator).toBe('foundation-model');
        expect(result.payload.kind).toBe('openai-compatible');
        expect(Array.isArray(result.payload.messages)).toBe(true);
    });

    test('supervisor profile → supervisor payload with fanOut + synthesis', () => {
        const result = buildBackendPayload(
            { type: 'supervisor' },
            { pack: 'cpg-fmcg', subVertical: 'supply-chain', userQuestion: 'Q?', spaces: ['a', 'b'] },
        );
        expect(result).not.toBeNull();
        expect(result.translator).toBe('supervisor');
        expect(result.payload.kind).toBe('supervisor');
        expect(result.payload.fanOut).toHaveLength(2);
        expect(result.payload.synthesis.kind).toBe('openai-compatible');
    });

    test('openai/bedrock-llama aliases route to the foundation-model translator', () => {
        const a = buildBackendPayload(
            { type: 'openai' },
            { pack: 'cpg-fmcg', subVertical: 'supply-chain', userQuestion: 'Q' },
        );
        const b = buildBackendPayload(
            { type: 'bedrock-llama' },
            { pack: 'cpg-fmcg', subVertical: 'supply-chain', userQuestion: 'Q' },
        );
        expect(a.translator).toBe('foundation-model');
        expect(b.translator).toBe('foundation-model');
    });

    test('supervisor-local routes to supervisor translator', () => {
        const result = buildBackendPayload(
            { type: 'supervisor-local' },
            { pack: 'cpg-fmcg', subVertical: 'supply-chain', userQuestion: 'Q' },
        );
        expect(result.translator).toBe('supervisor');
        expect(result.payload.kind).toBe('supervisor');
    });

    test('missing profile.type defaults to genie', () => {
        const result = buildBackendPayload(
            {},
            { pack: 'cpg-fmcg', subVertical: 'supply-chain', userQuestion: 'Q' },
        );
        expect(result.translator).toBe('genie');
    });

    test('unknown profile.type returns null so caller can fall back', () => {
        const result = buildBackendPayload(
            { type: 'no-such-backend' },
            { pack: 'cpg-fmcg', subVertical: 'supply-chain', userQuestion: 'Q' },
        );
        expect(result).toBeNull();
    });
});

/* ─── irSource detection ────────────────────────────────────────── */

describe('buildBackendPayload — irSource diagnostic stamp', () => {
    let tmpRoot;

    beforeEach(() => { tmpRoot = makeTmpPacksRoot(); });
    afterEach(() => rmrf(tmpRoot));

    test('yaml when authored YAML is present', () => {
        writePackFile(tmpRoot, 'p/sub-verticals/sv/prompt-ir.yaml', 'schemaVersion: 1\nid: p/sv\n');
        const result = buildBackendPayload(
            { type: 'genie' },
            { pack: 'p', subVertical: 'sv', userQuestion: 'Q' },
            { packsRoot: tmpRoot },
        );
        expect(result.irSource).toBe('yaml');
    });

    test('json when only JSON is present', () => {
        writePackFile(tmpRoot, 'p/sub-verticals/sv/prompt-ir.json', JSON.stringify({ schemaVersion: 1, id: 'p/sv' }));
        const result = buildBackendPayload(
            { type: 'genie' },
            { pack: 'p', subVertical: 'sv', userQuestion: 'Q' },
            { packsRoot: tmpRoot },
        );
        expect(result.irSource).toBe('json');
    });

    test('synthetic when only markdown is present', () => {
        writePackFile(tmpRoot, 'p/sub-verticals/sv/prompt-context.md', '# context');
        const result = buildBackendPayload(
            { type: 'genie' },
            { pack: 'p', subVertical: 'sv', userQuestion: 'Q' },
            { packsRoot: tmpRoot },
        );
        expect(result.irSource).toBe('synthetic');
    });

    test('none when no pack was requested', () => {
        const result = buildBackendPayload(
            { type: 'genie' },
            { userQuestion: 'standalone question' },
        );
        expect(result.irSource).toBe('none');
        // Empty-IR fallback path still emits a usable genie payload.
        expect(result.payload.kind).toBe('genie');
        expect(result.payload.userMessage).toBe('standalone question');
    });

    test('none when pack is missing on disk', () => {
        const result = buildBackendPayload(
            { type: 'genie' },
            { pack: 'no-such-pack', subVertical: 'no-such-sv', userQuestion: 'Q' },
            { packsRoot: tmpRoot },
        );
        // No IR loadable → empty IR fallback, irSource is 'none'.
        expect(result.irSource).toBe('none');
        expect(result.payload.kind).toBe('genie');
        expect(result.payload.userMessage).toBe('Q');
    });
});

/* ─── Translator registry sanity ──────────────────────────────────── */

describe('translator registry — listTypes', () => {
    test('reports all expected types', () => {
        const types = listTypes();
        expect(types).toEqual(expect.arrayContaining([
            'genie',
            'supervisor',
            'supervisor-local',
            'foundation-model',
            'openai',
            'bedrock-llama',
        ]));
    });
});
