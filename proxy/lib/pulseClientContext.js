'use strict';

const PULSE_CLIENT_CONTRACT_VERSION = 'px1';

const SUPPORTED_PULSE_CLIENTS = Object.freeze([
    'pulseplay',
    'pulse-pbi',
    'pulseplay-desktop',
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
    resolvePulseRequestId,
    buildPulseClientCompatibility,
    buildPulseClientCompatibilityResponse,
};
