/**
 * relevanceEngine.js — governed relevance profile + suggestion ranking (v3.2 §14).
 *
 * Verified organizational persona and behaviour-derived relevance are SEPARATE. The
 * relevance profile holds only deliberate, explicit signals (follow / dismiss /
 * suppress / correction) and may re-order already-eligible content WITHIN a governed
 * business tier. It can NEVER change persona, permission, data scope, severity,
 * confidence, business priority, action level, or approval authority.
 *
 * In-memory runtime store on this workspace (the interaction-event Delta table and
 * the privacy/retention manifest are external dependencies). Not a mock: it enforces
 * the ranking invariants, the ≤3 cap, the explanation, and the control semantics
 * (dismiss 7d / suppress 30d / follow until removed / correct / reset) with tests.
 */
'use strict';

const crypto = require('crypto');

// governed business tiers (highest first). Personal relevance NEVER crosses these.
const TIERS = Object.freeze(['critical', 'overdue-approval', 'high', 'medium', 'low']);
const TIER_RANK = Object.freeze(Object.fromEntries(TIERS.map((t, i) => [t, i])));

const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
const SUPPRESS_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SUGGESTIONS = 3;

function nowMs(clock) { return clock ? clock() : Date.now(); }
function hash(obj) { return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16); }

class RelevanceEngine {
    constructor(clock) {
        this._clock = clock;                 // injectable for tests
        this._follows = new Map();           // owner -> Map(key -> {kpi, scope, created_at})
        this._dismiss = new Map();           // owner -> Map(contentHash -> expires_at)
        this._suppress = new Map();          // owner -> Map(ruleScopeKpi -> expires_at)
        this._corrections = new Map();       // owner -> Set(reasonKey marked inapplicable)
    }

    _m(map, owner) { if (!map.has(owner)) map.set(owner, new Map()); return map.get(owner); }

    // ── explicit signals ────────────────────────────────────────────────────────
    follow(owner, kpi, scope) {
        const key = `${kpi}::${scope || ''}`;
        this._m(this._follows, owner).set(key, { kpi, scope: scope || null, created_at: nowMs(this._clock) });
        return { followed: key };
    }
    unfollow(owner, kpi, scope) { this._m(this._follows, owner).delete(`${kpi}::${scope || ''}`); return { unfollowed: true }; }

    dismiss(owner, contentHash) {
        this._m(this._dismiss, owner).set(contentHash, nowMs(this._clock) + DISMISS_MS);
        return { dismissed_until: nowMs(this._clock) + DISMISS_MS };
    }
    suppress(owner, ruleId, entityScope, kpi) {
        const key = `${ruleId}::${entityScope || ''}::${kpi || ''}`;
        this._m(this._suppress, owner).set(key, nowMs(this._clock) + SUPPRESS_MS);
        return { suppressed_until: nowMs(this._clock) + SUPPRESS_MS };
    }
    /** Correction marks a suggestion reason inapplicable; it cannot change authority. */
    correct(owner, reasonKey) {
        if (!this._corrections.has(owner)) this._corrections.set(owner, new Set());
        this._corrections.get(owner).add(reasonKey);
        return { corrected: reasonKey };
    }
    reset(owner) {
        this._follows.delete(owner); this._dismiss.delete(owner);
        this._suppress.delete(owner); this._corrections.delete(owner);
        return { reset: true };
    }

    /** The user-inspectable profile (each explicit preference + source + expiry). */
    profile(owner) {
        const t = nowMs(this._clock);
        const follows = [...this._m(this._follows, owner).values()];
        const dismiss = [...this._m(this._dismiss, owner).entries()].filter(([, exp]) => exp > t).map(([k, exp]) => ({ content_hash: k, expires_at: exp }));
        const suppress = [...this._m(this._suppress, owner).entries()].filter(([, exp]) => exp > t).map(([k, exp]) => ({ scope: k, expires_at: exp }));
        return { follows, dismissed: dismiss, suppressed: suppress, corrections: [...(this._corrections.get(owner) || [])] };
    }

    _isDismissed(owner, contentHash) {
        const exp = this._m(this._dismiss, owner).get(contentHash);
        return exp && exp > nowMs(this._clock);
    }
    _isSuppressed(owner, ruleId, entityScope, kpi) {
        const key = `${ruleId}::${entityScope || ''}::${kpi || ''}`;
        const exp = this._m(this._suppress, owner).get(key);
        return exp && exp > nowMs(this._clock);
    }
    _followsKpi(owner, kpi, scope) {
        const m = this._m(this._follows, owner);
        return m.has(`${kpi}::${scope || ''}`) || m.has(`${kpi}::`);
    }

    /**
     * Rank eligible candidates. Governed tier dominates; personal relevance only
     * re-orders within the same tier. Returns at most 3, each with a deterministic
     * "why". `candidates` are already ACL/scope-filtered by the caller.
     */
    suggest(owner, candidates, { excludeContentHashes = [] } = {}) {
        const excluded = new Set(excludeContentHashes);
        const scored = [];
        for (const c of candidates) {
            if (excluded.has(c.content_hash)) continue;                          // dedupe vs inbox/canvas/prior
            if (this._isDismissed(owner, c.content_hash)) continue;
            if (this._isSuppressed(owner, c.rule_id, c.entity_scope, c.kpi)) continue;
            const tier = TIER_RANK[c.tier] ?? TIER_RANK.low;
            const reason = this._reasonFor(owner, c);
            // personal relevance is a within-tier tiebreak only
            const relevance = (reason.factor === 'followed-kpi' ? 2 : 0) + (reason.factor === 'pending-approval' ? 1 : 0);
            scored.push({ candidate: c, tier, relevance, reason });
        }
        scored.sort((a, b) => a.tier - b.tier                                    // governed tier first
            || b.relevance - a.relevance                                          // then personal relevance
            || String(a.candidate.content_hash).localeCompare(String(b.candidate.content_hash)));
        return scored.slice(0, MAX_SUGGESTIONS).map((s) => ({
            ...s.candidate, suggestion_id: hash({ owner, c: s.candidate.content_hash }), why: s.reason.text, why_factor: s.reason.factor,
        }));
    }

    _reasonFor(owner, c) {
        const corrections = this._corrections.get(owner) || new Set();
        if (c.related_to_pending_approval && !corrections.has('pending-approval')) return { factor: 'pending-approval', text: 'Related to your pending approval' };
        if (this._followsKpi(owner, c.kpi, c.entity_scope) && !corrections.has('followed-kpi')) return { factor: 'followed-kpi', text: `You follow ${c.kpi} for this scope` };
        if (c.bookmark_changed && !corrections.has('bookmark-changed')) return { factor: 'bookmark-changed', text: 'Bookmarked KPI changed' };
        return { factor: 'role-relevant', text: 'Relevant to your verified role' };
    }

    _reset() { this._follows.clear(); this._dismiss.clear(); this._suppress.clear(); this._corrections.clear(); }
}

let _engine = null;
function getRelevanceEngine() { if (!_engine) _engine = new RelevanceEngine(); return _engine; }

module.exports = { RelevanceEngine, getRelevanceEngine, TIERS, MAX_SUGGESTIONS };
