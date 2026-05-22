// @ts-check
'use strict';

/**
 * Lightweight schema validator for proxy/config.json. Closes loophole
 * L17 (SETTINGS_SPEC § 15.4). Catches obviously-malformed config blocks
 * at startup so the proxy doesn't get to a confusing failure mode at
 * request time.
 *
 * No external JSON-schema dependency — proxy package.json stays lean.
 * Validation is permissive on optional fields (unknown keys allowed) and
 * strict on top-level shape + a handful of fields whose wrong types
 * would cause runtime crashes (port must be number, profiles must be an
 * object map, allowlist arrays must be arrays).
 */

const ENFORCEMENT_VALUES = new Set(['strict', 'warn']);
const RESERVED_PROFILE_PREFIX = '_';

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validatePort(value, problems) {
    if (value === undefined) return;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) {
        problems.push(`config.port must be an integer in 1..65535 (got: ${JSON.stringify(value)})`);
    }
}

function validateFeedbackLog(value, problems) {
    if (value === undefined) return;
    if (typeof value !== 'string' || !value.trim()) {
        problems.push(`config.feedbackLog must be a non-empty string when present`);
    }
}

function validateAllowlistEnforcement(value, problems) {
    if (value === undefined) return;
    if (typeof value !== 'string' || !ENFORCEMENT_VALUES.has(value.toLowerCase())) {
        problems.push(`config.allowlistEnforcement must be "strict" or "warn" (got: ${JSON.stringify(value)})`);
    }
}

function validateAllowlist(value, problems) {
    if (value === undefined) return;
    if (!isPlainObject(value)) {
        problems.push(`config.allowlist must be an object when present`);
        return;
    }
    const arrayFields = [
        'biProviders',
        'powerbiWorkspaces',
        'powerbiReports',
        'aadTenants',
        'genieSpaces',
        'supervisorProfiles',
        'packs',
        'knowledgeSources',
    ];
    for (const key of arrayFields) {
        if (value[key] === undefined) continue;
        if (!Array.isArray(value[key])) {
            problems.push(`config.allowlist.${key} must be an array (got: ${typeof value[key]})`);
        }
    }
    if (value.embedOrigins !== undefined && !isPlainObject(value.embedOrigins)) {
        problems.push(`config.allowlist.embedOrigins must be an object (vendor → string[])`);
    } else if (isPlainObject(value.embedOrigins)) {
        for (const [vendor, list] of Object.entries(value.embedOrigins)) {
            if (!Array.isArray(list)) {
                problems.push(`config.allowlist.embedOrigins["${vendor}"] must be an array`);
            }
        }
    }
    if (value.aiProfiles !== undefined) {
        const ap = value.aiProfiles;
        if (Array.isArray(ap) || typeof ap === 'string') {
            // legacy shape — accepted by normalizer
        } else if (!isPlainObject(ap)) {
            problems.push(`config.allowlist.aiProfiles must be an array, string, or { default, byGroup } object`);
        } else {
            if (ap.default !== undefined && !Array.isArray(ap.default) && typeof ap.default !== 'string') {
                problems.push(`config.allowlist.aiProfiles.default must be an array or string`);
            }
            if (ap.byGroup !== undefined && !isPlainObject(ap.byGroup)) {
                problems.push(`config.allowlist.aiProfiles.byGroup must be an object`);
            } else if (isPlainObject(ap.byGroup)) {
                for (const [group, list] of Object.entries(ap.byGroup)) {
                    if (!Array.isArray(list)) {
                        problems.push(`config.allowlist.aiProfiles.byGroup["${group}"] must be an array`);
                    }
                }
            }
        }
    }
    if (value.license !== undefined && !isPlainObject(value.license)) {
        problems.push(`config.allowlist.license must be an object (vendor → license posture)`);
    }
    if (value.display !== undefined) {
        if (!isPlainObject(value.display)) {
            problems.push(`config.allowlist.display must be an object when present`);
        } else if (
            value.display.biTileMode !== undefined
            && !['1', '2', '4'].includes(String(value.display.biTileMode))
        ) {
            problems.push(`config.allowlist.display.biTileMode must be one of "1", "2", or "4"`);
        }
    }
}

function validateProfiles(value, problems) {
    if (value === undefined) return;
    if (!isPlainObject(value)) {
        problems.push(`config.profiles must be an object map of profileName → profile`);
        return;
    }
    for (const [name, profile] of Object.entries(value)) {
        if (name.startsWith(RESERVED_PROFILE_PREFIX)) continue; // doc keys
        if (!isPlainObject(profile)) {
            problems.push(`config.profiles["${name}"] must be an object`);
            continue;
        }
        // Spot-check string fields that the proxy reads via direct property
        // access — wrong types here cause confusing runtime errors.
        for (const field of ['host', 'token', 'spaceId', 'warehouseId', 'displayName', 'dataDomain', 'authMode', 'clientId', 'clientSecret']) {
            if (profile[field] !== undefined && typeof profile[field] !== 'string') {
                problems.push(`config.profiles["${name}"].${field} must be a string when present (got: ${typeof profile[field]})`);
            }
        }
        if (profile.spaces !== undefined && !Array.isArray(profile.spaces)) {
            problems.push(`config.profiles["${name}"].spaces must be an array when present`);
        }
        if (profile.suggestedQuestions !== undefined && !Array.isArray(profile.suggestedQuestions)) {
            problems.push(`config.profiles["${name}"].suggestedQuestions must be an array when present`);
        }
    }
}

/**
 * @param {object} config Merged config (cfg() output).
 * @returns {string[]} Empty array if valid; one or more human-readable problem
 *   strings otherwise.
 */
function validateConfigShape(config) {
    const problems = [];
    if (!isPlainObject(config)) {
        problems.push('config must be an object');
        return problems;
    }
    validatePort(config.port, problems);
    validateFeedbackLog(config.feedbackLog, problems);
    validateAllowlistEnforcement(config.allowlistEnforcement, problems);
    validateAllowlist(config.allowlist, problems);
    validateProfiles(config.profiles, problems);
    return problems;
}

module.exports = {
    validateConfigShape,
    isPlainObject,
};
