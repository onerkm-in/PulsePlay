/**
 * experienceConfig.js — server-governed author-selectable interface mode.
 *
 * PulsePlay permanently supports two presentation modes (v3.2 §10):
 *   - `segregated` — the existing multi-surface shell (default + fail-safe fallback)
 *   - `combined`   — the My Decision Canvas single-workspace experience
 *
 * The AUTHOR chooses which mode is published; end users cannot override it. The
 * published config is server-owned, versioned, audited, and optimistic-concurrency
 * guarded. Resolution never trusts a browser value for the served mode.
 *
 * Persistence on this dev workspace is a best-effort local JSON file plus an
 * in-memory cache (the approved Delta config table is org-scoped and out of
 * reach here). Config-file persistence is intentionally simple; the governance
 * (version, audit, author gate, fail-safe) is the part that must be correct.
 *
 * Fail-safe: any unset / invalid / unavailable config, or the operational kill
 * switch (env PP_EXPERIENCE_KILLSWITCH=segregated), resolves to `segregated`.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const MODES = Object.freeze(['segregated', 'cockpit', 'combined']);

// Two different jobs, deliberately not the same constant:
//
// FALLBACK_MODE is the FAIL-SAFE — what a kill switch drops to, and what an
// unreadable or invalid config resolves to. It stays `segregated` because that
// shell is the simplest, longest-proven path; the escape hatch is worthless if
// it lands somewhere newer than what it is rescuing you from.
//
// DEFAULT_MODE is what a deployment serves before an author has published
// anything. 2026-07-29: raised from `segregated` to `combined` — the cockpit is
// the intended landing experience (one plate: KPIs, severity, decisions), and
// `combined` keeps the top-tab nav so Dashboard / Ask Pulse / AI Insights stay
// reachable. Plain `cockpit` would strand end users with no cross-screen nav,
// since only an author can change modes.
const FALLBACK_MODE = 'segregated';
const DEFAULT_MODE = 'combined';
const STORE_FILE = process.env.PP_EXPERIENCE_STORE
    || path.join(__dirname, '..', '.pp-experience-config.json');

// In-memory authority. Loaded from the file at first access; writes update both.
let _cache = null;

function _defaultConfig() {
    return { mode: DEFAULT_MODE, version: 0, updated_by_actor_id: null, updated_at: null };
}

function _validMode(m) { return MODES.includes(m); }

function _load() {
    if (_cache) return _cache;
    try {
        const raw = fs.readFileSync(STORE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && _validMode(parsed.mode) && Number.isInteger(parsed.version)) {
            _cache = {
                mode: parsed.mode,
                version: parsed.version,
                updated_by_actor_id: parsed.updated_by_actor_id || null,
                updated_at: parsed.updated_at || null,
            };
            return _cache;
        }
    } catch { /* missing or unreadable → fall through to default */ }
    _cache = _defaultConfig();
    return _cache;
}

function _persist(cfg) {
    _cache = cfg;
    try {
        fs.writeFileSync(STORE_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    } catch { /* best-effort; in-memory authority still holds for this process */ }
}

/** The operational kill switch always wins. */
function killSwitchActive() {
    return String(process.env.PP_EXPERIENCE_KILLSWITCH || '').toLowerCase() === 'segregated';
}

/**
 * The mode actually served to end users. Kill switch → segregated; otherwise the
 * published mode; anything invalid → segregated.
 */
function resolvePublishedMode() {
    if (killSwitchActive()) return FALLBACK_MODE;
    const cfg = _load();
    return _validMode(cfg.mode) ? cfg.mode : FALLBACK_MODE;
}

/**
 * Is this request from an author allowed to configure the experience? In a real
 * deployment `can_configure_experience` comes only from a dedicated IdP group.
 * Locally (no IdP) this is dev-permissive but every change is still audited with
 * the resolved actor, so the gate is enforceable the moment roles are wired.
 */
function canConfigureExperience(req) {
    const roles = (req.user && Array.isArray(req.user.roles)) ? req.user.roles : [];
    const hasIdp = roles.length > 0;
    if (hasIdp) {
        return roles.some((r) => /author|experience-admin|can_configure_experience|admin/i.test(String(r)));
    }
    // dev fallback: no IdP present → permissive, audited as such
    return process.env.PP_REQUIRE_AUTHOR_ROLE !== 'true';
}

function actorId(req) {
    return (req.user && (req.user.email || req.user.sub)) || 'anonymous';
}

function register(app, deps) {
    const { auditLog } = deps;

    // Served mode + published config. Public read (end users need to know which
    // shell to mount) but it never accepts a mode from the caller.
    app.get('/experience/config', (req, res) => {
        const cfg = _load();
        res.set('Cache-Control', 'no-store');
        return res.json({
            ok: true,
            served_mode: resolvePublishedMode(),
            published_mode: cfg.mode,
            version: cfg.version,
            updated_at: cfg.updated_at,
            kill_switch: killSwitchActive(),
            supported_modes: MODES,
            fallback_mode: FALLBACK_MODE,
        });
    });

    // Author-only publish. Optimistic concurrency on `version`; audited.
    app.put('/experience/config', (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!canConfigureExperience(req)) {
            auditLog(req, { action: 'experience.publish', status: 403, detail: 'not an author' });
            return res.status(403).json({ ok: false, error: 'Not permitted to configure the interface mode.' });
        }
        const mode = String(req.body?.mode || '');
        if (!_validMode(mode)) {
            return res.status(400).json({ ok: false, error: `mode must be one of ${MODES.join(', ')}` });
        }
        const current = _load();
        const expected = req.body?.expected_version;
        if (expected !== undefined && Number(expected) !== current.version) {
            return res.status(409).json({
                ok: false, error: 'Stale version; reload the current config.',
                current_version: current.version,
            });
        }
        const next = {
            mode,
            version: current.version + 1,
            updated_by_actor_id: actorId(req),
            updated_at: new Date().toISOString(),
        };
        _persist(next);
        auditLog(req, { action: 'experience.publish', status: 200,
            detail: `mode=${mode} version=${next.version} by=${next.updated_by_actor_id}` });
        return res.json({ ok: true, served_mode: resolvePublishedMode(), published_mode: next.mode, version: next.version });
    });
}

module.exports = {
    register,
    resolvePublishedMode,
    MODES, FALLBACK_MODE,
    // test surface
    __test: {
        reset() { _cache = null; try { fs.unlinkSync(STORE_FILE); } catch { /* ignore */ } },
        canConfigureExperience, killSwitchActive, _validMode,
    },
};
