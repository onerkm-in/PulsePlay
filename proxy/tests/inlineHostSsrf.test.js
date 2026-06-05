'use strict';

// SSRF guard for inline (header-sourced) Databricks hosts (2026-06-05).
// The inline-credentials feature lets a caller supply X-Databricks-Host; in the
// "override" mode (anonymous local-dev default) that host is attacker-supplied.
// isBlockedInlineHost must refuse loopback + link-local / cloud-metadata targets
// so a crafted header can't turn the proxy into a metadata-exfil gadget.

process.env.NODE_ENV = 'test';

const { isBlockedInlineHost, extractInlineCredentials } = require('../server');

describe('isBlockedInlineHost — SSRF targets are refused', () => {
    it.each([
        'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
        'https://169.254.169.254',
        '169.254.169.254',
        'http://127.0.0.1:8787',
        'https://localhost',
        'localhost',
        '0.0.0.0',
        'http://[::1]:443',
        '::1',
        'metadata.google.internal',
        'https://metadata.google.internal/computeMetadata/v1/',
        'http://127.0.0.1.nip.io'.replace('.nip.io', ''), // 127.0.0.1
    ])('blocks %s', (host) => {
        expect(isBlockedInlineHost(host)).toBe(true);
    });

    it.each([
        'https://my-workspace.cloud.databricks.com',
        'https://adb-1234567890.10.azuredatabricks.net',
        'https://dbc-f88d29ce-4aa2.cloud.databricks.com',
        // RFC1918 private ranges are intentionally allowed (on-prem workspaces).
        'https://10.0.0.5',
        'https://192.168.1.10',
    ])('allows legitimate host %s', (host) => {
        expect(isBlockedInlineHost(host)).toBe(false);
    });

    it('treats empty / nullish as not-blocked (handled elsewhere)', () => {
        expect(isBlockedInlineHost('')).toBe(false);
        expect(isBlockedInlineHost(null)).toBe(false);
        expect(isBlockedInlineHost(undefined)).toBe(false);
    });
});

describe('extractInlineCredentials — rejects an SSRF host even with full creds', () => {
    it('returns null when the inline host is a metadata target', () => {
        const out = extractInlineCredentials({
            'x-databricks-host': 'http://169.254.169.254',
            'x-databricks-token': 'dapi-abc',
            'x-genie-space-id': 'space-1',
        });
        expect(out).toBeNull();
    });

    it('accepts a legitimate workspace host with full creds', () => {
        const out = extractInlineCredentials({
            'x-databricks-host': 'https://my-workspace.cloud.databricks.com',
            'x-databricks-token': 'dapi-abc',
            'x-genie-space-id': 'space-1',
        });
        expect(out).not.toBeNull();
        expect(out.profile.host).toBe('https://my-workspace.cloud.databricks.com');
    });
});
