// @ts-check
'use strict';

/**
 * Prompt translator registry. Phase 11a.
 *
 * Maps a profile's `type` field (from `proxy/config.json.profiles.<name>.type`)
 * to the translator that builds the backend-native payload.
 *
 * Profiles without an explicit `type` field default to `genie` — this
 * matches the historical behaviour where un-typed profiles were treated as
 * direct Genie spaces.
 */

const genie = require('./genie');
const foundationModel = require('./foundationModel');
const supervisor = require('./supervisor');

const TRANSLATORS = {
    'genie': genie,
    'supervisor': supervisor,
    'supervisor-local': supervisor,
    'foundation-model': foundationModel,
    // Aliases for OpenAI / Bedrock-Llama which use OpenAI-compatible shapes.
    // Bedrock-Anthropic uses a Claude-shaped translator that lands in Phase 11b.
    'openai': foundationModel,
    'bedrock-llama': foundationModel,
};

/**
 * Default translator key when a profile has no explicit `type`.
 */
const DEFAULT_TYPE = 'genie';

/**
 * Look up a translator by profile type. Returns null when no translator is
 * registered — callers should fall back to a documented behaviour
 * (typically: skip IR-driven prompt construction and pass the raw user
 * question through, matching today's connectors that lack a `type`).
 *
 * @param {string} [profileType]
 */
function getTranslator(profileType) {
    const key = String(profileType || DEFAULT_TYPE).toLowerCase().trim();
    return TRANSLATORS[key] || null;
}

/**
 * List of registered translator type identifiers. Used by the dispatcher
 * health check and the `check-prompt-ir.js` CLI.
 */
function listTypes() {
    return Object.keys(TRANSLATORS);
}

module.exports = {
    getTranslator,
    listTypes,
    DEFAULT_TYPE,
    // Re-export individual translators for tests + direct callers (the
    // existing /assistant/conversations/start route still calls genie
    // directly via the backward-compat shim in promptDispatcher.js).
    genie,
    foundationModel,
    supervisor,
};
