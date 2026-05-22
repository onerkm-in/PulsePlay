'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { listInstalledPacks } = require('../lib/packRegistry');

describe('pack registry', () => {
    test('reads pack manifests and filters by allowlist', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsepacks-'));
        const packDir = path.join(root, 'cpg-fmcg');
        fs.mkdirSync(packDir, { recursive: true });
        fs.writeFileSync(path.join(packDir, 'pack.json'), JSON.stringify({
            name: 'cpg-fmcg',
            displayName: 'CPG / FMCG',
            version: '0.1.0',
            description: 'Pack description',
            subVerticals: [
                { name: 'supply-chain', description: 'Supply chain work' },
            ],
        }), 'utf8');

        const all = listInstalledPacks({ packsRoot: root });
        expect(all).toHaveLength(1);
        expect(all[0].name).toBe('cpg-fmcg');
        expect(all[0].subVerticals[0]).toMatchObject({
            name: 'supply-chain',
            displayName: 'Supply Chain',
        });

        expect(listInstalledPacks({ packsRoot: root, allowedPacks: ['other-pack'] })).toEqual([]);
    });
});
