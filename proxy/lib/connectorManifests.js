/**
 * connectorManifests.js — Cycle 20 / S1 (2026-05-20).
 *
 * Hardcoded table of all connector manifests, per PR #8 §7 S1 scope:
 *
 *   "S1 honest scope: manifest schema + hardcoded registry mapping
 *    connector id → existing route handlers + discovery endpoint + UI
 *    brand cards. NO physical route extraction in S1. Drop-in runtime
 *    is S2+."
 *
 * Why hardcoded: every connector below already has its routes wired in
 * proxy/server.js. The S1 manifest just describes them. S2 starts moving
 * connectors into proxy/connectors/<id>.js where the manifest will live
 * alongside the route handler. S3 finishes the migration.
 *
 * S1 brand grid (12 cards):
 *   Microsoft     — powerbi-dataset-dax, powerbi-dataset-qna
 *   Azure         — azure-openai-chat, azure-openai-analytics
 *   AWS           — bedrock-direct, bedrock-rag
 *   Databricks    — genie, foundation-model, supervisor, supervisor-local,
 *                   responses-agent
 *   Demo          — demo-mock
 *
 * Cards are vendor-grouped so a returning user can scan by what they
 * already license. category × capabilities × maturity stay orthogonal so
 * a designer can re-cut the grid (e.g. by "deterministic vs LLM") later
 * without rewriting manifests.
 *
 * IMPORTANT — Q9 field-naming guidance from Codex's re-review (locked):
 *   - PBI canonical AAD names: aadTenantId / aadClientId / aadClientSecret
 *     (legacy aliases powerBiTenantId / powerBiClientId / powerBiClientSecret
 *     handled by the env mapper)
 *   - PBI canonical workspace names: powerbiGroupId / powerbiDatasetId
 *   - PBI RLS uses existing names: powerBiRlsEnabled, powerBiRlsRequired,
 *     powerBiRlsUsernameClaim, powerBiRlsUsername, powerBiRlsRoles
 *   - powerbiReportId NOT exposed on Q&A (route mints a dataset token; report
 *     ID would look important while doing nothing)
 *   - DAX template allowlist / query timeout / result cache TTL NOT exposed
 *     until the runtime takes them (they're constants in
 *     powerbiDatasetClient.js today)
 *   - tokenLifetimeMinutes NOT exposed until generateQnAEmbedToken accepts it
 */

'use strict';

const { validateManifests } = require('./connectorManifestSchema');

const MANIFESTS = [
    // ─── Microsoft ──────────────────────────────────────────────────────
    {
        id: 'powerbi-dataset-dax',
        version: '1.0.0',
        displayName: 'Power BI Dataset — Deterministic DAX',
        tagline: 'No-LLM Q&A over Power BI semantic models',
        description: 'Deterministic NL → DAX template router. Four templates (top-N, aggregate-by, trend, total) executed against the Power BI dataset via executeQueries. Zero LLM calls in the loop.',
        icon: 'powerbi',
        category: 'microsoft',
        maturity: 'beta',
        profileType: 'powerbi-semantic-model',  // S1 soft-migration: legacy single type covers both DAX + Q&A
        profileTypes: ['powerbi-semantic-model', 'powerbi-dataset-dax'],
        capabilities: {
            llm: false,
            deterministic: true,
            qnaEmbedSurface: false,
            streamingAnswer: false,
            ragGrounded: false,
        },
        profileSchema: {
            displayName:     { kind: 'string', required: false, label: 'Display name', help: 'Friendly label shown in answer attributions.' },
            dataDomain:      { kind: 'string', required: false, label: 'Data domain', help: 'Short noun phrase (e.g. "Sales performance").' },
            aadTenantId:     { kind: 'guid',   required: true,  label: 'AAD tenant ID' },
            aadClientId:     { kind: 'guid',   required: true,  label: 'Service principal client ID' },
            aadClientSecret: { kind: 'secret', required: true,  label: 'Service principal client secret', secret: true },
            powerbiGroupId:  { kind: 'guid',   required: true,  label: 'Power BI workspace (group) ID' },
            powerbiDatasetId:{ kind: 'guid',   required: true,  label: 'Power BI dataset ID' },
            powerBiRlsEnabled:        { kind: 'boolean', required: false, label: 'Enable RLS' },
            powerBiRlsRequired:       { kind: 'boolean', required: false, label: 'Require RLS (fail when identity cannot be derived)' },
            powerBiRlsUsernameClaim:  { kind: 'string',  required: false, label: 'IdP claim for RLS username', help: 'Defaults to email / preferredUsername / upn' },
            powerBiRlsUsername:       { kind: 'string',  required: false, label: 'Static RLS username override' },
            powerBiRlsRoles:          { kind: 'string',  required: false, label: 'PBI RLS role names (comma-separated)' },
        },
        setupSteps: [
            'Azure AD: create an app registration + client secret',
            'Power BI: add the service principal as a workspace Member',
            'Power BI admin portal: enable "Service principals can use Power BI APIs"',
            'Paste profile to proxy/config.json with the 4 GUIDs',
            'Restart the proxy and pick the new profile under Settings → AI → Provider',
        ],
        docsUrl: 'https://learn.microsoft.com/en-us/power-bi/developer/embedded/embed-service-principal',
        sharedCredentialHint: 'powerbi-aad-sp',
        envPrefix: 'POWERBI_DAX',
        routes: [
            { method: 'POST', path: '/powerbi/conversations/start',          purpose: 'conversation-start' },
            { method: 'GET',  path: '/powerbi/conversations/:cid/messages/:mid', purpose: 'conversation-poll' },
        ],
    },
    {
        id: 'powerbi-dataset-qna',
        version: '1.0.0',
        displayName: 'Power BI Dataset — Q&A Embed',
        tagline: "Microsoft's NLP surface over a Power BI dataset",
        description: "Mints a dataset-scoped embed token and renders Microsoft's Q&A surface in PulsePlay. NLP runs in the Microsoft tenant; PulsePlay makes no LLM call. Surface mounts at /powerbi/qna. NOTE: Microsoft is retiring Power BI Q&A on 2026-12-31; durable replacement is the powerbi-semantic-model connector.",
        icon: 'powerbi-qna',
        category: 'microsoft',
        maturity: 'beta',
        // 2026-05-22 research finding: Microsoft officially deprecated
        // Power BI Q&A on 2025-12-01 (Power BI Updates Blog) with hard
        // end-of-life 2026-12-31 per Microsoft 365 Message Center notice
        // MC1218421. Full research + 24 URL signatures in
        // docs/research/EXTERNAL_REFERENCES.md "Power BI Q&A readiness
        // assessment + deprecation finding". This connector remains as a
        // tactical bridge through Dec 2026 — no new investment.
        eol: '2026-12-31',
        eolReason: 'Microsoft retiring Power BI Q&A; migrate to Copilot for Power BI or powerbi-semantic-model.',
        eolMigrationTarget: 'powerbi-semantic-model',
        eolDocsUrl: 'https://powerbi.microsoft.com/en-us/blog/deprecating-power-bi-qa/',
        profileType: 'powerbi-semantic-model',  // Legacy combined type also activates this card; new explicit type below.
        profileTypes: ['powerbi-semantic-model', 'powerbi-dataset-qna'],
        capabilities: {
            llm: false,           // Microsoft's NLP, not PulsePlay's
            deterministic: false,
            qnaEmbedSurface: true,
            streamingAnswer: false,
            ragGrounded: false,
        },
        profileSchema: {
            displayName:     { kind: 'string', required: false, label: 'Display name' },
            dataDomain:      { kind: 'string', required: false, label: 'Data domain' },
            aadTenantId:     { kind: 'guid',   required: true,  label: 'AAD tenant ID' },
            aadClientId:     { kind: 'guid',   required: true,  label: 'Service principal client ID' },
            aadClientSecret: { kind: 'secret', required: true,  label: 'Service principal client secret', secret: true },
            powerbiGroupId:  { kind: 'guid',   required: true,  label: 'Power BI workspace (group) ID' },
            powerbiDatasetId:{ kind: 'guid',   required: true,  label: 'Power BI dataset ID' },
            powerBiRlsEnabled:        { kind: 'boolean', required: false, label: 'Enable RLS' },
            powerBiRlsRequired:       { kind: 'boolean', required: false, label: 'Require RLS' },
            powerBiRlsUsernameClaim:  { kind: 'string',  required: false, label: 'IdP claim for RLS username' },
            powerBiRlsUsername:       { kind: 'string',  required: false, label: 'Static RLS username override' },
            powerBiRlsRoles:          { kind: 'string',  required: false, label: 'PBI RLS role names (comma-separated)' },
        },
        setupSteps: [
            'Azure AD: create an app registration + client secret',
            'Power BI: add the service principal as a workspace Member',
            'Power BI admin portal: enable "Service principals can use Power BI APIs"',
            'Confirm Q&A is enabled on the target dataset in Power BI',
            'Paste profile to proxy/config.json, restart, then open /powerbi/qna',
        ],
        docsUrl: 'https://learn.microsoft.com/en-us/power-bi/developer/embedded/embed-q-and-a',
        sharedCredentialHint: 'powerbi-aad-sp',
        envPrefix: 'POWERBI_QNA',
        routes: [
            { method: 'POST', path: '/powerbi/qna/embed-token', purpose: 'embed-token' },
        ],
    },

    // ─── Azure ─────────────────────────────────────────────────────────
    {
        id: 'azure-openai-chat',
        version: '1.0.0',
        displayName: 'Azure OpenAI — Chat',
        tagline: 'GPT-4o/4 chat completions through your Azure tenant',
        description: 'Routes Ask Pulse and AI Insights through Azure OpenAI chat completions. Your tenant, your model, your data residency.',
        icon: 'azure-openai',
        category: 'azure',
        maturity: 'stable',
        profileType: 'azure-openai',
        profileTypes: ['azure-openai', 'azure-openai-chat'],
        capabilities: {
            llm: true,
            deterministic: false,
            qnaEmbedSurface: false,
            streamingAnswer: true,
            ragGrounded: false,
        },
        profileSchema: {
            displayName:             { kind: 'string', required: false, label: 'Display name' },
            azureOpenAiEndpoint:     { kind: 'url',    required: true,  label: 'Endpoint', help: 'https://<resource>.openai.azure.com' },
            azureOpenAiDeployment:   { kind: 'string', required: true,  label: 'Deployment name' },
            azureOpenAiApiKey:       { kind: 'secret', required: true,  label: 'API key', secret: true },
            azureOpenAiApiVersion:   { kind: 'string', required: false, label: 'API version', help: 'Defaults to 2024-08-01-preview' },
        },
        setupSteps: [
            'Provision an Azure OpenAI resource in your Azure subscription',
            'Deploy a model (e.g. gpt-4o)',
            'Copy the endpoint URL, deployment name, and an API key',
            'Paste profile to proxy/config.json and restart the proxy',
        ],
        docsUrl: 'https://learn.microsoft.com/en-us/azure/ai-services/openai/',
        envPrefix: 'AZURE_OPENAI',
        routes: [
            { method: 'POST', path: '/openai/conversations/start', purpose: 'conversation-start' },
        ],
    },
    {
        id: 'azure-openai-analytics',
        version: '1.0.0',
        displayName: 'Azure OpenAI — Analytics',
        tagline: 'Grounded SQL + narrative over your warehouse via Azure OpenAI',
        description: 'Analytics-grade pipeline: LLM writes SQL, proxy validates SELECT-only and executes against your warehouse, LLM writes the narrative. Genie-equivalent shape without needing Genie.',
        icon: 'azure-openai-analytics',
        category: 'azure',
        maturity: 'beta',
        profileType: 'azure-openai',
        profileTypes: ['azure-openai-analytics'],
        capabilities: {
            llm: true,
            deterministic: false,
            qnaEmbedSurface: false,
            streamingAnswer: false,
            ragGrounded: true,
            sqlExecution: true,
        },
        profileSchema: {
            displayName:             { kind: 'string', required: false, label: 'Display name' },
            azureOpenAiEndpoint:     { kind: 'url',    required: true,  label: 'Endpoint' },
            azureOpenAiDeployment:   { kind: 'string', required: true,  label: 'Deployment name' },
            azureOpenAiApiKey:       { kind: 'secret', required: true,  label: 'API key', secret: true },
            warehouseId:             { kind: 'string', required: true,  label: 'Databricks SQL warehouse ID' },
            host:                    { kind: 'url',    required: true,  label: 'Databricks workspace URL' },
            token:                   { kind: 'secret', required: true,  label: 'Databricks PAT (or use OAuth M2M)', secret: true },
            schemaContext:           { kind: 'string', required: false, label: 'Schema context (overrides auto-introspection)' },
            catalog:                 { kind: 'string', required: false, label: 'Catalog name (for auto-introspection)' },
            mode:                    { kind: 'enum',   required: true,  label: 'Mode', help: 'Must be "analytics" for this profile' },
        },
        setupSteps: [
            'Provision Azure OpenAI + deploy a model (as above)',
            'Identify the Databricks SQL warehouse + catalog you want to query',
            'Generate a Databricks PAT or configure OAuth M2M',
            'Paste profile to proxy/config.json with mode:"analytics" and restart',
        ],
        docsUrl: 'https://learn.microsoft.com/en-us/azure/ai-services/openai/',
        envPrefix: 'AZURE_OPENAI_ANALYTICS',
        routes: [
            { method: 'POST', path: '/openai/conversations/start', purpose: 'conversation-start' },
        ],
    },

    // ─── AWS ───────────────────────────────────────────────────────────
    {
        id: 'bedrock-direct',
        version: '1.0.0',
        displayName: 'AWS Bedrock — Direct',
        tagline: 'Claude / Llama / Nova through AWS Bedrock',
        description: 'Direct LLM calls to Anthropic Claude, Meta Llama, or Amazon Nova models hosted in your AWS account. SigV4-signed; no AWS SDK shipped to the browser.',
        icon: 'aws-bedrock',
        category: 'aws',
        maturity: 'stable',
        profileType: 'bedrock',
        profileTypes: ['bedrock', 'bedrock-direct'],
        capabilities: {
            llm: true,
            deterministic: false,
            qnaEmbedSurface: false,
            streamingAnswer: true,
            ragGrounded: false,
        },
        profileSchema: {
            displayName:        { kind: 'string', required: false, label: 'Display name' },
            bedrockRegion:      { kind: 'string', required: true,  label: 'AWS region', help: 'e.g. us-east-1' },
            bedrockModelId:     { kind: 'string', required: true,  label: 'Model ID', help: 'e.g. anthropic.claude-3-5-sonnet-20241022-v2:0' },
            awsAccessKeyId:     { kind: 'string', required: true,  label: 'AWS access key ID' },
            awsSecretAccessKey: { kind: 'secret', required: true,  label: 'AWS secret access key', secret: true },
            awsSessionToken:    { kind: 'secret', required: false, label: 'AWS session token (if using STS)', secret: true },
        },
        setupSteps: [
            'Enable Bedrock model access in your AWS account (Bedrock console → Model access)',
            'Create an IAM user/role with bedrock:InvokeModel permission',
            'Generate access keys (or use STS session credentials)',
            'Paste profile to proxy/config.json and restart',
        ],
        docsUrl: 'https://docs.aws.amazon.com/bedrock/',
        envPrefix: 'BEDROCK',
        routes: [
            { method: 'POST', path: '/bedrock/conversations/start', purpose: 'conversation-start' },
        ],
    },
    {
        id: 'bedrock-rag',
        version: '1.0.0',
        displayName: 'AWS Bedrock — Knowledge Base (RAG)',
        tagline: 'Grounded answers via Bedrock Knowledge Bases',
        description: 'RetrieveAndGenerate against a configured Bedrock Knowledge Base. The KB owns the retrieval; PulsePlay forwards the question and renders the cited answer.',
        icon: 'aws-bedrock-kb',
        category: 'aws',
        maturity: 'beta',
        profileType: 'bedrock-rag',
        profileTypes: ['bedrock-rag'],
        capabilities: {
            llm: true,
            deterministic: false,
            qnaEmbedSurface: false,
            streamingAnswer: false,
            ragGrounded: true,
        },
        profileSchema: {
            displayName:            { kind: 'string', required: false, label: 'Display name' },
            bedrockRegion:          { kind: 'string', required: true,  label: 'AWS region' },
            bedrockKnowledgeBaseId: { kind: 'string', required: true,  label: 'Knowledge Base ID' },
            bedrockModelId:         { kind: 'string', required: true,  label: 'Model ID (synthesis)' },
            awsAccessKeyId:         { kind: 'string', required: true,  label: 'AWS access key ID' },
            awsSecretAccessKey:     { kind: 'secret', required: true,  label: 'AWS secret access key', secret: true },
        },
        setupSteps: [
            'Build a Knowledge Base in Bedrock (S3 → vector store)',
            'Note the KB ID and select a synthesis model',
            'Create an IAM principal with bedrock:RetrieveAndGenerate permission',
            'Paste profile to proxy/config.json and restart',
        ],
        docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html',
        envPrefix: 'BEDROCK_RAG',
        routes: [
            { method: 'POST', path: '/bedrock/conversations/start', purpose: 'conversation-start' },
        ],
    },

    // ─── Databricks ─────────────────────────────────────────────────────
    {
        id: 'genie',
        version: '1.0.0',
        displayName: 'Databricks Genie',
        tagline: 'Natural-language Q&A over Genie spaces',
        description: 'Databricks-native NL → SQL against your warehouse, with full provenance. The original PulsePlay flagship connector.',
        icon: 'databricks-genie',
        category: 'databricks',
        maturity: 'stable',
        profileType: 'genie',
        // Legacy duck-type: spaceId presence implies genie (matchProfile soft-migration path).
        profileTypes: ['genie'],
        capabilities: {
            llm: true,
            deterministic: false,
            qnaEmbedSurface: false,
            streamingAnswer: true,
            ragGrounded: true,
            sqlExecution: true,
            agentMode: true,  // UI-only; see CLAUDE.md tripwire
        },
        profileSchema: {
            displayName: { kind: 'string', required: false, label: 'Display name' },
            dataDomain:  { kind: 'string', required: false, label: 'Data domain' },
            host:        { kind: 'url',    required: true,  label: 'Databricks workspace URL' },
            spaceId:     { kind: 'guid',   required: true,  label: 'Genie space ID' },
            warehouseId: { kind: 'string', required: false, label: 'SQL warehouse ID (for analytics)' },
            token:       { kind: 'secret', required: true,  label: 'Databricks PAT (or use OAuth M2M)', secret: true },
        },
        setupSteps: [
            'Create a Genie space in your Databricks workspace',
            'Note the space ID from the URL',
            'Generate a PAT (or configure OAuth M2M)',
            'Paste profile to proxy/config.json and restart',
        ],
        docsUrl: 'https://docs.databricks.com/en/genie/index.html',
        envPrefix: 'GENIE',
        routes: [
            { method: 'POST', path: '/assistant/conversations/start',                  purpose: 'conversation-start' },
            { method: 'GET',  path: '/assistant/conversations/:cid/messages/:mid',     purpose: 'conversation-poll' },
        ],
    },
    {
        id: 'foundation-model',
        version: '1.0.0',
        displayName: 'Mosaic AI Foundation Model',
        tagline: 'Databricks-hosted Llama / Mistral / DBRX',
        description: 'Calls a Databricks Foundation Model serving endpoint. Lower latency than going out to Azure/AWS when your data is already in Databricks.',
        icon: 'mosaic-fm',
        category: 'databricks',
        maturity: 'stable',
        profileType: 'foundation-model',
        profileTypes: ['foundation-model', 'foundation'],
        capabilities: {
            llm: true,
            deterministic: false,
            qnaEmbedSurface: false,
            streamingAnswer: true,
            ragGrounded: true,
        },
        profileSchema: {
            displayName:              { kind: 'string', required: false, label: 'Display name' },
            host:                     { kind: 'url',    required: true,  label: 'Databricks workspace URL' },
            token:                    { kind: 'secret', required: true,  label: 'Databricks PAT (or OAuth M2M)', secret: true },
            foundationModelEndpoint:  { kind: 'string', required: true,  label: 'Serving endpoint name' },
        },
        setupSteps: [
            'Deploy a Foundation Model serving endpoint in Databricks',
            'Note the endpoint name',
            'Generate a PAT (or configure OAuth M2M)',
            'Paste profile to proxy/config.json and restart',
        ],
        docsUrl: 'https://docs.databricks.com/en/machine-learning/foundation-models/index.html',
        envPrefix: 'FOUNDATION',
        routes: [
            { method: 'POST', path: '/foundation/section', purpose: 'conversation-start' },
        ],
    },
    {
        id: 'supervisor',
        version: '1.0.0',
        displayName: 'Mosaic AI Supervisor Agent',
        tagline: 'Managed multi-helper orchestration on Mosaic',
        description: 'Calls a managed Supervisor Agent serving endpoint that fans questions out to multiple helpers and synthesizes a unified answer. Operated by Mosaic; PulsePlay just dispatches.',
        icon: 'mosaic-supervisor',
        category: 'databricks',
        maturity: 'beta',
        profileType: 'supervisor',
        profileTypes: ['supervisor'],
        capabilities: {
            llm: true,
            deterministic: false,
            qnaEmbedSurface: false,
            streamingAnswer: true,
            ragGrounded: true,
            multiHelper: true,
        },
        profileSchema: {
            displayName:           { kind: 'string', required: false, label: 'Display name' },
            host:                  { kind: 'url',    required: true,  label: 'Databricks workspace URL' },
            token:                 { kind: 'secret', required: true,  label: 'Databricks PAT', secret: true },
            synthesisEndpoint:     { kind: 'string', required: true,  label: 'Supervisor serving endpoint' },
            agentName:             { kind: 'string', required: false, label: 'Agent name override' },
        },
        setupSteps: [
            'Deploy a Mosaic AI Supervisor Agent (see databricks-agents/supervisor/)',
            'Note the serving endpoint name',
            'Paste profile to proxy/config.json and restart',
        ],
        docsUrl: 'https://docs.databricks.com/en/generative-ai/agent-framework/index.html',
        envPrefix: 'SUPERVISOR',
        routes: [
            { method: 'POST', path: '/supervisor/conversations/start', purpose: 'conversation-start' },
            { method: 'GET',  path: '/supervisor/stream',              purpose: 'fan-out-stream' },
        ],
    },
    {
        id: 'supervisor-local',
        version: '1.0.0',
        displayName: 'Supervisor — Local Fan-Out',
        tagline: 'Proxy-side multi-Genie fan-out + synthesis',
        description: 'Local orchestrator: the proxy fans the question to N helper Genie spaces (configured with profileTypes:["genie"]) in parallel with a 2000 ms stagger, then synthesizes via Foundation Model. ADR-0003.',
        icon: 'pulseplay-supervisor-local',
        category: 'databricks',
        maturity: 'beta',
        profileType: 'supervisor-local',
        profileTypes: ['supervisor-local'],
        capabilities: {
            llm: true,
            deterministic: false,
            qnaEmbedSurface: false,
            streamingAnswer: true,
            ragGrounded: true,
            multiHelper: true,
        },
        profileSchema: {
            displayName:           { kind: 'string', required: false, label: 'Display name' },
            spaces:                { kind: 'json',   required: true,  label: 'Helper profile names', help: 'JSON array of Genie profile names to fan out to. Empty = every non-supervisor profile.' },
            synthesisEndpoint:     { kind: 'string', required: true,  label: 'Synthesis Foundation Model endpoint' },
            // host/token are OPTIONAL on a supervisor-local profile: the proxy
            // fans out to the helper Genie profiles (each carrying its own
            // host+token) and borrows credentials for the FM synthesis call.
            // Marking them required produced a false "Missing required field"
            // that disabled an otherwise-working connector in the catalogue.
            host:                  { kind: 'url',    required: false, label: 'Databricks workspace URL', help: 'Optional — inherited from the helper profiles when omitted.' },
            token:                 { kind: 'secret', required: false, label: 'Databricks PAT', secret: true, help: 'Optional — inherited from the helper profiles when omitted.' },
            staggerMs:             { kind: 'integer',required: false, label: 'Inter-launch stagger (ms)', help: 'Defaults to 2000 (ADR-0003)' },
        },
        setupSteps: [
            'Have at least two Genie profiles configured (the helpers)',
            'Configure a Foundation Model endpoint for synthesis',
            'Paste a supervisor-local profile listing the helper profile names',
            'Restart the proxy',
        ],
        docsUrl: 'https://docs.databricks.com/en/generative-ai/agent-framework/index.html',
        envPrefix: 'SUPERVISOR_LOCAL',
        routes: [
            { method: 'POST', path: '/supervisor/conversations/start', purpose: 'conversation-start' },
            { method: 'GET',  path: '/supervisor/stream',              purpose: 'fan-out-stream' },
        ],
    },
    {
        id: 'responses-agent',
        version: '1.0.0',
        displayName: 'Mosaic AI ResponsesAgent',
        tagline: 'Responses-style streaming agent',
        description: 'Calls a Databricks Responses-style agent endpoint. Returns the unified Responses event stream that PulsePlay translates into the existing answer shape.',
        icon: 'mosaic-responses',
        category: 'databricks',
        maturity: 'preview',
        profileType: 'responses-agent',
        profileTypes: ['responses-agent'],
        capabilities: {
            llm: true,
            deterministic: false,
            qnaEmbedSurface: false,
            streamingAnswer: true,
            ragGrounded: true,
        },
        profileSchema: {
            displayName:                { kind: 'string', required: false, label: 'Display name' },
            host:                       { kind: 'url',    required: true,  label: 'Databricks workspace URL' },
            token:                      { kind: 'secret', required: true,  label: 'Databricks PAT', secret: true },
            responsesAgentEndpoint:     { kind: 'string', required: true,  label: 'Responses-agent serving endpoint' },
        },
        setupSteps: [
            'Deploy a Responses-style agent in Databricks',
            'Note the endpoint name',
            'Paste profile to proxy/config.json and restart',
        ],
        docsUrl: 'https://docs.databricks.com/en/generative-ai/agent-framework/index.html',
        envPrefix: 'RESPONSES_AGENT',
        routes: [
            { method: 'POST', path: '/responses-agent/conversations/start', purpose: 'conversation-start' },
        ],
    },

    // ─── Demo ──────────────────────────────────────────────────────────
    {
        id: 'demo-mock',
        version: '0.1.0',
        displayName: 'Demo — Synthetic Mock',
        tagline: 'Try PulsePlay without any cloud credentials',
        description: 'In-memory mock connector returning canned analytics answers. Useful for evaluating PulsePlay end-to-end without configuring AAD / AWS / Databricks. Not for production.',
        icon: 'demo-mock',
        category: 'demo',
        maturity: 'preview',
        profileType: 'demo-mock',
        profileTypes: ['demo-mock'],
        capabilities: {
            llm: false,
            deterministic: true,
            qnaEmbedSurface: false,
            streamingAnswer: false,
            ragGrounded: false,
        },
        profileSchema: {
            displayName: { kind: 'string', required: false, label: 'Display name' },
            dataDomain:  { kind: 'string', required: false, label: 'Data domain', help: 'e.g. "demo retail data"' },
        },
        setupSteps: [
            'Paste { "type": "demo-mock" } into proxy/config.json profiles',
            'Restart the proxy and pick "Demo — Synthetic Mock" under Provider',
            '(Future cycle ships the actual route handler; S1 only declares the manifest.)',
        ],
        docsUrl: 'https://github.com/onerkm-in/PulsePlay/blob/publish/local-main-2026-05-20/docs/CONNECTOR_PLATFORM_REDESIGN_2026-05-20.md',
        envPrefix: 'DEMO_MOCK',
        routes: [
            // Demo route is reserved for a follow-up cycle; manifest declares it
            // so the UI can show a brand card today.
            { method: 'POST', path: '/demo/conversations/start', purpose: 'conversation-start' },
        ],
    },
];

// Validate at module load so a broken manifest crashes the proxy at boot
// rather than at first request. The error message lists every problem at
// once so a deployer can fix them in one pass.
const _validation = validateManifests(MANIFESTS);
if (!_validation.ok) {
    const bad = _validation.report.filter(r => !r.ok);
    const detail = bad.map(b => `  ${b.id}:\n    - ${b.errors.join('\n    - ')}`).join('\n');
    throw new Error(`connectorManifests.js: ${bad.length} manifest(s) failed validation:\n${detail}`);
}

module.exports = {
    MANIFESTS,
    // Re-exported so callers can ask "is this manifest table healthy?" without
    // re-running the validator.
    validation: _validation,
};
