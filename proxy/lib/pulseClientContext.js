'use strict';

const PULSE_CLIENT_CONTRACT_VERSION = 'px1';

const SUPPORTED_PULSE_CLIENTS = Object.freeze([
    'pulseplay',
    'pulse-pbi',
    'pulseplay-desktop',
    // 2026-07-28 — automated callers must be able to say what they are. Until
    // this entry existed the normalizer collapsed any agent self-identification
    // to 'unknown', so audit could not distinguish agent from human at all.
    'pulseplay-agent',
]);

const PULSE_CLIENT_ALIASES = Object.freeze({
    pulseplay: 'pulseplay',
    'pulse-play': 'pulseplay',
    playground: 'pulseplay',
    'pulse-pbi': 'pulse-pbi',
    pulsepbi: 'pulse-pbi',
    pbi: 'pulse-pbi',
    powerbi: 'pulse-pbi',
    'power-bi': 'pulse-pbi',
    'pulseplay-desktop': 'pulseplay-desktop',
    pulseplaydesktop: 'pulseplay-desktop',
    desktop: 'pulseplay-desktop',
    exe: 'pulseplay-desktop',
    'pulseplay-exe': 'pulseplay-desktop',
    'pulseplay-agent': 'pulseplay-agent',
    pulseplayagent: 'pulseplay-agent',
    agent: 'pulseplay-agent',
});

function firstHeaderValue(value) {
    if (Array.isArray(value)) return value[0];
    if (typeof value === 'string') return value;
    return '';
}

function sanitizeHeaderToken(value, maxLen = 80) {
    const raw = firstHeaderValue(value);
    if (!raw) return '';
    return String(raw).replace(/[^A-Za-z0-9._:+\-]/g, '').slice(0, maxLen);
}

function sanitizeRequestId(value) {
    return sanitizeHeaderToken(value, 80).replace(/[^A-Za-z0-9._\-]/g, '').slice(0, 80);
}

function normalizePulseClient(value) {
    const raw = firstHeaderValue(value);
    if (!raw) return 'unknown';
    const normalized = String(raw).trim().toLowerCase().replace(/_/g, '-');
    const safe = normalized.replace(/[^a-z0-9-]/g, '');
    return PULSE_CLIENT_ALIASES[safe] || 'unknown';
}

function resolvePulseClientContext(headers = {}) {
    return {
        clientApp: normalizePulseClient(headers['x-pulse-client']),
        clientVersion: sanitizeHeaderToken(headers['x-pulse-client-version']) || null,
    };
}

/**
 * Actor attribution for audit. Declaring `x-pulse-client: pulseplay-agent` is
 * SELF-DEMOTION ONLY — it marks the caller as automated (and personaGate maps
 * it to the view-only AGENT persona); it never grants anything. An automated
 * caller that omits it is a policy violation made visible by these very audit
 * fields, not something this layer can prevent.
 */
function resolveActorContext(headers = {}) {
    const clientApp = normalizePulseClient(headers['x-pulse-client']);
    return {
        actorType: clientApp === 'pulseplay-agent' ? 'agent' : 'human',
        agentRunId: sanitizeRequestId(headers['x-agent-run-id']) || null,
        parentRequestId: sanitizeRequestId(headers['x-parent-request-id']) || null,
    };
}

function resolvePulseRequestId(headers = {}, fallbackFactory = () => `srv-${Date.now()}`) {
    const candidates = [
        headers['x-request-id'],
        headers['x-pulse-request-id'],
    ];
    for (const candidate of candidates) {
        const raw = firstHeaderValue(candidate);
        if (!raw || raw.length > 80) continue;
        const sanitized = sanitizeRequestId(raw);
        if (sanitized) return sanitized;
    }
    const fallback = fallbackFactory();
    return sanitizeRequestId(fallback) || `srv-${Date.now()}`;
}

function buildPulseClientCompatibility(clientApp) {
    switch (clientApp) {
        case 'pulseplay':
            return {
                host: 'top-level-browser',
                xhrSafe: true,
                fetchAvailable: true,
                powerBiSandbox: false,
                bundledLocalProxy: false,
            };
        case 'pulse-pbi':
            return {
                host: 'power-bi-custom-visual',
                xhrSafe: true,
                fetchAvailable: false,
                powerBiSandbox: true,
                bundledLocalProxy: false,
            };
        case 'pulseplay-desktop':
            return {
                host: 'desktop-portable',
                xhrSafe: true,
                fetchAvailable: true,
                powerBiSandbox: false,
                bundledLocalProxy: true,
            };
        default:
            return {
                host: 'unknown',
                xhrSafe: true,
                fetchAvailable: null,
                powerBiSandbox: null,
                bundledLocalProxy: null,
            };
    }
}

function buildPulseClientCompatibilityResponse(context = {}) {
    const clientApp = context.clientApp || 'unknown';
    return {
        ok: true,
        contractVersion: PULSE_CLIENT_CONTRACT_VERSION,
        client: {
            app: clientApp,
            version: context.clientVersion || null,
            requestId: context.requestId || null,
        },
        supportedClients: SUPPORTED_PULSE_CLIENTS.slice(),
        requestHeaders: [
            'X-Pulse-Client',
            'X-Pulse-Client-Version',
            'X-Pulse-Request-Id',
            'X-Request-Id',
        ],
        responseHeaders: [
            'X-Request-Id',
            'X-Pulse-Request-Id',
            'X-Pulse-Client',
        ],
        compatibility: buildPulseClientCompatibility(clientApp),
        notes: {
            singleProxyContract: true,
            governanceAttestation: 'queued-g3',
            desktopExeBundledProxy: 'planned-dx1',
        },
    };
}

module.exports = {
    PULSE_CLIENT_CONTRACT_VERSION,
    SUPPORTED_PULSE_CLIENTS,
    sanitizeHeaderToken,
    sanitizeRequestId,
    normalizePulseClient,
    resolvePulseClientContext,
    resolveActorContext,
    resolvePulseRequestId,
    buildPulseClientCompatibility,
    buildPulseClientCompatibilityResponse,
};
