'use strict';

/**
 * bedrock.js — the AWS Bedrock drop-in connector (Phase B pilot migration).
 *
 * Mounts the /bedrock/* routes that used to live inline in server.js:
 *   GET  /bedrock/health
 *   POST /bedrock/conversations/start
 *   POST /bedrock/conversations/:conversationId/messages
 *
 * Two engines behind one surface:
 *   bedrock-rag    — RetrieveAndGenerate over a Knowledge Base (KB-coupled)
 *   bedrock-direct — raw InvokeModel (chat-only, or analytics via the shared
 *                    orchestrator when the profile is mode=analytics)
 *
 * Profile fields (add to config.json profiles):
 *   bedrockRegion          — AWS region, e.g. us-east-1
 *   bedrockKnowledgeBaseId — Knowledge Base ID from AWS console
 *   bedrockModelArn        — Model ARN, e.g. anthropic.claude-3-5-sonnet-20241022-v2:0
 *   bedrockAccessKeyId     — AWS access key ID
 *   bedrockSecretAccessKey — AWS secret access key
 *
 * For production, prefer IAM role via Lambda/API Gateway rather than static keys.
 *
 * Shared services come from `host` (built by connectorHost.js); the SigV4
 * transport, prompt-context injectors, and probe adapters come from the
 * reusable libs — same split as decision-assist.js.
 */

const { bedrockRetrieveAndGenerate, bedrockInvokeModel } = require('../lib/bedrock');
const { UNEXPECTED_INTERNAL_SENTINEL } = require('../lib/problemDetails');
const {
    resolvePackContext,
    buildAuditDetail: buildPackAuditDetail,
} = require('../lib/packPromptInjector');
const {
    formatDiscoveryContext,
    buildAuditDetail: buildDiscoveryAuditDetail,
    composeUserMessageWithContext,
    composeSystemPromptWithContext,
} = require('../lib/discoveryPromptInjector');
const { buildFrameAuditDetail } = require('../lib/frameContext');
const { __internals: { probeBedrockRag, probeBedrockDirect } } = require('../lib/connectorProbe');

// conversationId → { sessionId, storedAt }. RAG follow-ups reuse the KB
// session so Bedrock keeps conversational context server-side.
const bedrockSessionMap = new Map();
let pruneTimer = null;

function pruneSessions(ttlMs) {
    const cutoff = Date.now() - ttlMs;
    for (const [id, entry] of bedrockSessionMap.entries()) {
        if (!entry?.storedAt || entry.storedAt < cutoff) {
            bedrockSessionMap.delete(id);
        }
    }
}

function resolveBedrockProfile(host, body, headers, req) {
    const profileName = headers['x-assistant-profile'] || body?.assistantProfile || 'default';
    const resolved = host.profileByName(profileName, req) || host.profileByName('default', req);
    const profile = resolved?.profile;
    // IDEA-040 Phase 2 — accept either KB-coupled (RAG) profiles or
    // bedrock-direct profiles (only requires AWS creds + region; KB id
    // not needed).
    if (!profile) return null;
    const engine = host.resolveEngine(profile);
    if (engine === 'bedrock-rag' || engine === 'bedrock-direct') {
        return { profile, name: resolved.name };
    }
    if (profile.bedrockKnowledgeBaseId) return { profile, name: resolved.name };
    return null;
}

function buildHandlers(host) {
    async function startConversation(req, res) {
        const resolved = resolveBedrockProfile(host, req.body, req.headers, req);
        if (!resolved) return host.sendNoMatchingProfile(req, res, 400, 'No AWS Bedrock profile configured.');

        const { pack, subVertical } = req.body;
        // Phase 11b prep — bridge body.frame into content (idempotent, no-op
        // for free-text). See proxy/lib/frameContext.js + Genie route at
        // app.post('/assistant/conversations/start') for the byte-identity contract.
        const frame = host.validateFrame(req.body && req.body.frame);
        const content = host.prependFrameContext(req.body.content, frame);
        const convId = `bedrock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const engine = host.resolveEngine(resolved.profile) || 'bedrock-rag';

        // Cycle C — pack-context resolution. Same audit shape as the Genie + OpenAI
        // routes so a single grep correlates every injection site.
        const packResolved = resolvePackContext({ pack, subVertical });
        if (packResolved.requested) {
            host.auditLog(req, {
                profileName: resolved.name,
                action: 'pack-context-inject',
                status: packResolved.resolved ? 'OK' : 'WARN',
                detail: JSON.stringify({ ...buildPackAuditDetail(packResolved), backend: 'bedrock', engine }),
                spIdentityHash: host.spHashForProfile(resolved.profile),
            });
        }
        if (frame) {
            host.auditLog(req, {
                profileName: resolved.name,
                action: 'frame-context-inject',
                status: 'OK',
                detail: JSON.stringify({ ...buildFrameAuditDetail(frame), backend: 'bedrock', engine }),
                spIdentityHash: host.spHashForProfile(resolved.profile),
            });
        }

        // Phase 2 — bedrock-direct + analytics mode → orchestrator path.
        const hasAnalyticsContext =
            resolved.profile.schemaContext ||
            (resolved.profile.warehouseId && (resolved.profile.catalog || resolved.profile.databricksCatalog));
        if (engine === 'bedrock-direct' && resolved.profile.mode === 'analytics' && hasAnalyticsContext) {
            try {
                const msgId = `bedrock-msg-${Date.now()}`;
                const callLlm = async (messages) => {
                    let capturedUsage = null;
                    const content = await bedrockInvokeModel(resolved.profile, messages, {
                        onUsage: u => { capturedUsage = u; },
                    });
                    return { content, usage: capturedUsage };
                };
                // Cycle 17 — symmetric per-request validation-retry override.
                const parsedClientRetries = host.parseClientMaxRetries(req);
                const { result, retried, attempts } = await host.runAnalyticsOrchestrator({
                    profile: resolved.profile, content, callLlm, convId, msgId,
                    packContext: packResolved.resolved ? packResolved.content : null,
                    clientMaxRetries: parsedClientRetries,
                });
                const responsePayload = {
                    conversation_id: convId,
                    message_id: JSON.stringify(result),
                    status: result.status,
                    content: result.content,
                    sqlQuery: result.sqlQuery,
                    ...(result.usage ? { usage: result.usage } : {}),
                };
                console.log(`[bedrock/analytics] profile=${resolved.name} conv=${convId} status=${result.status} attempts=${attempts} retried=${retried}`);
                return res.json(host.withGovernance(req, resolved.profile, 'bedrock-direct', responsePayload));
            } catch (err) {
                console.error('[bedrock/analytics]', err.message);
                return host.sendProblem(res, host.createProblem({
                    status: 500,
                    code: 'BEDROCK_ANALYTICS_FAILED',
                    title: 'Bedrock analytics request failed',
                    detail: UNEXPECTED_INTERNAL_SENTINEL,
                    category: 'unexpected_internal',
                    requestId: req.requestId,
                    retryable: false,
                }));
            }
        }

        // Phase 2 — bedrock-direct chat-only (no analytics): plain InvokeModel.
        // Cycle C — when pack-context is resolved, prepend it as a system message
        // so the model adopts sub-vertical vocabulary. The Anthropic Messages
        // payload wrapper (see lib/bedrock.js) accepts a leading system message.
        //
        // Probe-once cross-backend reuse — folds the discovery summary into the
        // same system message alongside pack context.
        const bedrockDiscoveryBlock = formatDiscoveryContext(req.body && req.body.discoveryContext);
        const bedrockPackTag = packResolved.subVertical
            ? `${packResolved.pack}/${packResolved.subVertical}`
            : (packResolved.pack || 'pack');
        if (bedrockDiscoveryBlock) {
            host.auditLog(req, {
                profileName: resolved.name,
                action: 'discovery-context-inject',
                status: 'OK',
                detail: JSON.stringify({ ...buildDiscoveryAuditDetail(bedrockDiscoveryBlock), backend: 'bedrock', engine }),
                spIdentityHash: host.spHashForProfile(resolved.profile),
            });
        }
        if (engine === 'bedrock-direct') {
            try {
                const bedrockDirectSystemContent = composeSystemPromptWithContext({
                    systemPrompt: null,
                    discoveryBlock: bedrockDiscoveryBlock,
                    packBlock: (packResolved.resolved && packResolved.content) ? packResolved.content : null,
                    packTag: bedrockPackTag,
                });
                const messages = bedrockDirectSystemContent
                    ? [{ role: 'system', content: bedrockDirectSystemContent }, { role: 'user', content }]
                    : [{ role: 'user', content }];
                let capturedUsage = null;
                const answer = await bedrockInvokeModel(resolved.profile, messages, {
                    onUsage: u => { capturedUsage = u; },
                });
                const usage = host.sanitizeUsageBlock(capturedUsage);
                const msgId = JSON.stringify({ id: convId, status: 'COMPLETED', content: answer, ...(usage ? { usage } : {}) });
                console.log(`[bedrock/direct/start] profile=${resolved.name} conv=${convId}`);
                return res.json(host.withGovernance(req, resolved.profile, 'bedrock-direct', {
                    conversation_id: convId,
                    message_id: msgId,
                    status: 'COMPLETED',
                    content: answer,
                    ...(usage ? { usage } : {}),
                }));
            } catch (err) {
                console.error('[bedrock/direct/start]', err.message);
                return host.sendProblem(res, host.createProblem({
                    status: 500,
                    code: 'BEDROCK_DIRECT_START_FAILED',
                    title: 'Bedrock direct chat start failed',
                    detail: UNEXPECTED_INTERNAL_SENTINEL,
                    category: 'unexpected_internal',
                    requestId: req.requestId,
                    retryable: false,
                }));
            }
        }

        // Existing RAG path. Cycle C — pack-context is prepended to the user's
        // input text as a header (Bedrock RetrieveAndGenerate has no system-prompt
        // slot in the v1 KB-coupled API), mirroring the Genie shape.
        // Probe-once cross-backend reuse — discovery rides the same user-message
        // header path (no system slot available on KB-coupled invocations).
        const ragInput = composeUserMessageWithContext({
            discoveryBlock: bedrockDiscoveryBlock,
            packBlock: (packResolved.resolved && packResolved.content) ? packResolved.content : null,
            packTag: bedrockPackTag,
            userQuestion: content,
        });
        try {
            const data = await bedrockRetrieveAndGenerate(resolved.profile, ragInput, null);
            const answer = data.output?.text ?? '';
            const sessionId = data.sessionId;
            if (sessionId) bedrockSessionMap.set(convId, { sessionId, storedAt: Date.now() });

            const msgId = JSON.stringify({ id: convId, status: 'COMPLETED', content: answer, citations: data.citations ?? [] });
            console.log(`[bedrock/start] profile=${resolved.name} conv=${convId} session=${sessionId}`);
            res.json(host.withGovernance(req, resolved.profile, 'bedrock-rag', {
                conversation_id: convId,
                message_id: msgId,
                status: 'COMPLETED',
                content: answer,
            }));
        } catch (err) {
            console.error('[bedrock/start]', err.message);
            host.sendProblem(res, host.createProblem({
                status: 500,
                code: 'BEDROCK_RAG_START_FAILED',
                title: 'Bedrock RAG conversation start failed',
                detail: UNEXPECTED_INTERNAL_SENTINEL,
                category: 'unexpected_internal',
                requestId: req.requestId,
                retryable: false,
            }));
        }
    }

    async function sendMessage(req, res) {
        const { conversationId } = req.params;
        const resolved = resolveBedrockProfile(host, req.body, req.headers, req);
        if (!resolved) return host.sendNoMatchingProfile(req, res, 400, 'No AWS Bedrock profile configured.');

        const { content } = req.body;
        const sessionEntry = bedrockSessionMap.get(conversationId);
        const sessionId = sessionEntry?.sessionId || null;
        const engine = host.resolveEngine(resolved.profile) || 'bedrock-rag';

        // Phase 2 — bedrock-direct chat follow-up (no session map; one-shot).
        if (engine === 'bedrock-direct') {
            try {
                const messages = [{ role: 'user', content }];
                const answer = await bedrockInvokeModel(resolved.profile, messages);
                const msgId = JSON.stringify({ id: `${conversationId}-${Date.now()}`, status: 'COMPLETED', content: answer });
                console.log(`[bedrock/direct/send] profile=${resolved.name} conv=${conversationId}`);
                return res.json(host.withGovernance(req, resolved.profile, 'bedrock-direct', {
                    conversation_id: conversationId,
                    message_id: msgId,
                    status: 'COMPLETED',
                    content: answer,
                }));
            } catch (err) {
                console.error('[bedrock/direct/send]', err.message);
                return host.sendProblem(res, host.createProblem({
                    status: 500,
                    code: 'BEDROCK_DIRECT_SEND_FAILED',
                    title: 'Bedrock direct chat follow-up failed',
                    detail: UNEXPECTED_INTERNAL_SENTINEL,
                    category: 'unexpected_internal',
                    requestId: req.requestId,
                    retryable: false,
                }));
            }
        }

        try {
            const data = await bedrockRetrieveAndGenerate(resolved.profile, content, sessionId);
            const answer = data.output?.text ?? '';
            const newSessionId = data.sessionId;
            if (newSessionId) bedrockSessionMap.set(conversationId, { sessionId: newSessionId, storedAt: Date.now() });

            const msgId = JSON.stringify({ id: `${conversationId}-${Date.now()}`, status: 'COMPLETED', content: answer, citations: data.citations ?? [] });
            console.log(`[bedrock/send] profile=${resolved.name} conv=${conversationId}`);
            res.json(host.withGovernance(req, resolved.profile, 'bedrock-rag', {
                conversation_id: conversationId,
                message_id: msgId,
                status: 'COMPLETED',
                content: answer,
            }));
        } catch (err) {
            console.error('[bedrock/send]', err.message);
            host.sendProblem(res, host.createProblem({
                status: 500,
                code: 'BEDROCK_RAG_SEND_FAILED',
                title: 'Bedrock RAG follow-up message failed',
                detail: UNEXPECTED_INTERNAL_SENTINEL,
                category: 'unexpected_internal',
                requestId: req.requestId,
                retryable: false,
            }));
        }
    }

    return { startConversation, sendMessage };
}

module.exports = {
    id: 'bedrock',
    displayName: 'AWS Bedrock',

    matchProfile(profile) {
        if (!profile) return false;
        if (profile.engine === 'bedrock-rag' || profile.engine === 'bedrock-direct') return true;
        return !!(profile.bedrockKnowledgeBaseId || profile.bedrockAccessKeyId);
    },

    // Probe dispatch still lives in lib/connectorProbe.js; delegate to the
    // same adapters so Setup → AI sees identical results either way. KB id
    // wins over raw creds, mirroring pickAdapter()'s ordering.
    async probe(profile, profileName, helpers) {
        return profile?.bedrockKnowledgeBaseId
            ? probeBedrockRag(profile, profileName, helpers)
            : probeBedrockDirect(profile, profileName, helpers);
    },

    register(host) {
        const { startConversation, sendMessage } = buildHandlers(host);

        host.app.get('/bedrock/health', (req, res) => {
            const resolved = resolveBedrockProfile(host, {}, req.headers, req);
            if (!resolved) {
                if (req._allowlistRejection) return host.sendAllowlistRejection(req, res, req._allowlistRejection);
                return res.status(503).json({ ok: false, error: 'No AWS Bedrock profile configured. Add bedrockKnowledgeBaseId, bedrockRegion, bedrockModelArn, bedrockAccessKeyId, and bedrockSecretAccessKey to the proxy profile.' });
            }
            const engine = host.resolveEngine(resolved.profile);
            res.json({
                ok: true,
                engine: engine || 'bedrock-rag',
                model: resolved.profile.bedrockModelArn || resolved.profile.bedrockModelId || 'anthropic.claude-3-5-sonnet-20241022-v2:0',
                knowledgeBaseId: resolved.profile.bedrockKnowledgeBaseId || null,
            });
        });

        host.app.post('/bedrock/conversations/start', startConversation);
        host.app.post('/bedrock/conversations/:conversationId/messages', sendMessage);

        // Future dispatch seam — /assistant/conversations/start doesn't consult
        // this registry yet, but registering now means the flip is one-sided.
        host.conversationDispatch.add({
            id: 'bedrock',
            priority: 50,
            match: (profile) => module.exports.matchProfile(profile),
            start: startConversation,
            send: sendMessage,
        });

        if (process.env.NODE_ENV !== 'test' && !pruneTimer) {
            pruneTimer = setInterval(() => pruneSessions(host.sessionStateTtlMs), 60 * 60 * 1000);
            pruneTimer.unref();
        }
    },

    async unregister(_host) {
        if (pruneTimer) {
            clearInterval(pruneTimer);
            pruneTimer = null;
        }
        bedrockSessionMap.clear();
    },
};
