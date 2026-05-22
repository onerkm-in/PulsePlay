# PulsePlay Proxy Reference

> **Audience:** engineers wiring the proxy, IT/InfoSec teams reviewing what it calls, future contributors adding new connectors.
>
> **Scope:** the **10 backend paths** the proxy supports today (the 2026-05-20 Power BI semantic-model cycle added the tenth), every external API it touches, OAuth/M2M setup for production, and the route table the playground talks to. Pulse-specific user-identity propagation and PBI-sandbox limitations have been removed — they are archived at [inherited/API_AUTH_AND_LIMITATIONS_FULL.md](inherited/API_AUTH_AND_LIMITATIONS_FULL.md).

## 1. APIs the proxy calls

The playground only calls the proxy. The proxy is what calls the AI backends. Here's the complete list of upstream endpoints, scoped per backend.

### 1.1 Databricks Genie (default profile, no `type` set)

| HTTP | Endpoint | Used by | Frequency |
|---|---|---|---|
| GET | `https://<workspace>/api/2.0/genie/spaces/{spaceId}` | Test connection, capabilities check | Once per setup, once per profile change |
| POST | `https://<workspace>/api/2.0/genie/spaces/{spaceId}/start-conversation` | Each new question | 1 per question (or per stage in a multi-stage pipeline) |
| POST | `https://<workspace>/api/2.0/genie/spaces/{spaceId}/conversations/{convId}/messages` | Follow-up turns in same conversation | Per follow-up |
| GET | `https://<workspace>/api/2.0/genie/spaces/{spaceId}/conversations/{convId}/messages/{msgId}` | Polling for completion | Every 1-3s until COMPLETED/FAILED |
| GET | `https://<workspace>/api/2.0/genie/spaces/{spaceId}/conversations/{convId}/messages/{msgId}/query-result` | SQL result enrichment | When status=COMPLETED + query attachment present |
| GET | `https://<workspace>/api/2.0/sql/warehouses/{warehouseId}` | Warehouse status check | Once per profile mount |
| POST | `https://<workspace>/api/2.0/sql/warehouses/{warehouseId}/start` | Warm a sleeping warehouse | When warehouse is STOPPED + first request |
| POST | `https://<workspace>/api/2.0/sql/statements` | Custom SQL section execution | Per author-defined SQL section |
| GET | `https://<workspace>/api/2.0/sql/statements/{statementId}` | Polling for SQL completion | Every 1-2s until SUCCEEDED/FAILED |
| GET | `https://<workspace>/api/2.0/sql/history/queries` | Query Audit panel | On-demand only when admin opens the panel |
| POST | `https://<workspace>/oidc/v1/token` | OAuth M2M token refresh | Initial + every ~50min (90% of 1h token lifetime) |

### 1.2 Azure OpenAI (`profile.azureOpenAiEndpoint` present)

| HTTP | Endpoint | Used by |
|---|---|---|
| POST | `https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=2024-02-15-preview` | Each question / sidebar prompt (uses Anthropic Messages format adapter) |

OpenAI mode bypasses Genie entirely — runs through `proxy/lib/llmOrchestrator.js` which adapts to OpenAI's chat-completions format.

### 1.3 Azure OpenAI analytics mode (`profile.mode === 'analytics'`)

Same OpenAI endpoint as 1.2, but additionally calls Databricks SQL Warehouse endpoints (1.1 sql/* rows) for SQL execution. The orchestrator (`runAnalyticsOrchestrator`) generates SQL via OpenAI, executes against Databricks, narrates over the result.

### 1.4 AWS Bedrock (`profile.bedrockKnowledgeBaseId` OR access keys)

| HTTP | Endpoint | Used by |
|---|---|---|
| POST | `https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/invoke` | InvokeModel path (Anthropic Messages format) |
| POST | `https://bedrock-agent-runtime.{region}.amazonaws.com/knowledge-bases/{kbId}/retrieve-and-generate` | RetrieveAndGenerate path (RAG over Knowledge Base) |

All requests signed with AWS Signature Version 4 in [proxy/lib/bedrock.js](../proxy/lib/bedrock.js) (no AWS SDK dependency).

### 1.5 Mosaic AI Foundation Model (`profile.type === 'foundation-model'`)

| HTTP | Endpoint | Used by |
|---|---|---|
| POST | `https://<workspace>/serving-endpoints/{endpoint}/invocations` | Each call (OpenAI-compatible chat-completions format) |

See [proxy/lib/foundationModelClient.js](../proxy/lib/foundationModelClient.js).

### 1.6 Mosaic AI Supervisor Agent (`profile.type === 'supervisor'`)

| HTTP | Endpoint | Used by |
|---|---|---|
| POST | `https://<workspace>/serving-endpoints/{endpoint}/invocations` | Each fan-out user prompt (LangGraph agent endpoint) |

The agent definition lives in [databricks-agents/supervisor/](../databricks-agents/supervisor/).

### 1.7 Supervisor-local (`profile.type === 'supervisor-local'`)

No new endpoints — proxy fans out to N Genie spaces (1.1 row 2-4 above) in parallel, then synthesizes via either Foundation Model (1.5) or OpenAI (1.2).

### 1.8 Mosaic AI ResponsesAgent (`profile.type === 'responses-agent'`)

| HTTP | Endpoint | Used by |
|---|---|---|
| POST | `https://<workspace>/serving-endpoints/{responsesAgentEndpoint}/invocations` | Managed Agent Framework / ResponsesAgent invocation |

See [proxy/lib/responsesAgentClient.js](../proxy/lib/responsesAgentClient.js). The public proxy routes are `/responses-agent/health` and `/responses-agent/chat`; both inherit the same rate-limit, IdP, shared-key, and allowlist posture as the other cost-bearing AI connector paths.

### 1.9 Localhost only (playground -> proxy)

| HTTP | Endpoint | Used by |
|---|---|---|
| GET | `/health` | Liveness probe |
| GET | `/admin/health-summary` | Diagnostics dashboard (shared-key gated) |
| GET | `/admin/query-history` | Genie Query Audit panel |
| GET | `/assistant/profiles` | Profile listing for the ConnectorPicker |
| GET | `/assistant/capabilities` | Per-profile capability listing |
| POST | `/assistant/embed-token/powerbi` | Power BI service-principal embed token issuance |
| POST | `/assistant/conversations/start` | Each new sidebar prompt |
| POST | `/assistant/conversations/{id}/messages` | Follow-up turns |
| GET | `/assistant/conversations/{id}/messages/{id}` | Polling for completion |
| POST | `/feedback` | Opt-in user feedback log |
| POST | `/confidence` | Per-answer confidence scoring |
| POST | `/foundation/section` | Direct Foundation Model section generation |
| POST | `/openai/chat` | Direct OpenAI chat (analytics mode) |
| POST | `/bedrock/retrieve-and-generate` | Direct Bedrock RAG |
| POST | `/bedrock/invoke` | Direct Bedrock InvokeModel |
| POST | `/supervisor/run` | Real Supervisor Agent invocation |
| POST | `/supervisor-local/run` | Proxy-side fan-out |
| GET | `/responses-agent/health` | Managed ResponsesAgent profile discovery/health |
| POST | `/responses-agent/chat` | Managed ResponsesAgent invocation |
| POST | `/powerbi/conversations/start` | Power BI semantic-model deterministic Q (cycle 15) |
| GET | `/powerbi/health` | Power BI semantic-model profile health + template inventory |
| POST | `/powerbi/qna/embed-token` | Power BI Q&A embed token mint for `/powerbi/qna` (cycle 15.5) |
| GET | `/clients/compatibility` | PX1 compatibility handshake for PulsePlay, Pulse PBI, and desktop EXE clients |

The Vite dev server proxies `/api/*` from the playground at `http://127.0.0.1:5173` to the proxy at `http://127.0.0.1:8787`. So the React app fetches `/api/assistant/conversations/start` and the proxy receives it at `/assistant/conversations/start`.

### 1.9.1 PX1 client identity contract

PulsePlay, Pulse PBI, and the future desktop EXE use the same proxy API. Clients SHOULD identify themselves on every request with:

| Header | Required | Notes |
|---|---:|---|
| `X-Pulse-Client` | no | Normalized to `pulseplay`, `pulse-pbi`, `pulseplay-desktop`, or `unknown`. Unknown values are not trusted or echoed raw. |
| `X-Pulse-Client-Version` | no | Sanitized, max 80 chars, audit-only/debug-only. |
| `X-Pulse-Request-Id` | no | Pulse-named alias for correlation. `X-Request-Id` still wins when both are present. |

The proxy echoes `X-Request-Id`, `X-Pulse-Request-Id`, and `X-Pulse-Client` on responses, and CORS exposes all three. Audit lines now include `clientApp` and optional `clientVersion`, so shared proxy logs can distinguish hosted PulsePlay, Power BI custom visual traffic, and the future bundled desktop proxy without forking connector routes.

`GET /clients/compatibility` is auth-free like `/health` and returns:

```json
{
  "ok": true,
  "contractVersion": "px1",
  "client": {
    "app": "pulse-pbi",
    "version": "1.2.3",
    "requestId": "rid-123"
  },
  "supportedClients": ["pulseplay", "pulse-pbi", "pulseplay-desktop"],
  "requestHeaders": ["X-Pulse-Client", "X-Pulse-Client-Version", "X-Pulse-Request-Id", "X-Request-Id"],
  "responseHeaders": ["X-Request-Id", "X-Pulse-Request-Id", "X-Pulse-Client"],
  "compatibility": {
    "host": "power-bi-custom-visual",
    "xhrSafe": true,
    "fetchAvailable": false,
    "powerBiSandbox": true,
    "bundledLocalProxy": false
  }
}
```

This is metadata only. It does not loosen auth, governance, allowlists, RLS/OLS, rate limits, or connector behavior.

**Request-body fields that span backends (added in cycles 12-14):**

- `discoveryContext` (object): cached summary of the client's DiscoverySnapshot. When present, the proxy injects a `[Discovery Context]` block above `[Pack Context]` and `[User Question]` for backends with a user-only prompt (Genie, Bedrock-RAG, Supervisor) OR augments the system prompt for backends with one (Foundation Model, OpenAI, Bedrock direct). Audit-log action: `discovery-context-inject`. Lets one screen-load probe ground every subsequent question without re-probing.
- `maxValidationRetries` (integer, 0..3): client override for `GENIE_POLL_VALIDATE_RETRIES`. Accepted on the Genie poll route as query string OR POST body. Cycle 13 latency-lever; lets Settings → Advanced → Performance raise/lower retries per session without re-deploying.

Power BI embed tokens are minted only by the proxy. Required profile fields are `powerBiClientId`, `powerBiClientSecret`, and `powerBiTenantId`. Optional hardening fields:

- `powerBiAllowEdit`: defaults false; must be true before the route will request `accessLevel: "Edit"`.
- `powerBiRlsEnabled` / `powerBiRlsRequired`: enable or require server-derived effective identity.
- `powerBiRlsUsernameClaim`: claim order for RLS username; default is `email`, `preferredUsername`, `upn`.
- `powerBiRlsUsername`: server-configured override for controlled pilots.
- `powerBiRlsRoles`: comma-separated or array of Power BI RLS role names.

The route rejects browser-supplied `identities` / `effectiveIdentity` payloads and caches tokens by non-secret `(profile, workspace, report, dataset, access, identityHash)`.

### 1.10 Power BI semantic-model (`profile.type === 'powerbi-semantic-model'`)

Added 2026-05-20 (Cycle 15). **Backend #10 — no LLM is invoked at any step.** PulsePlay probes the published Power BI dataset via INFO.* DAX functions, matches each user question to one of 4 deterministic DAX templates (top-n / aggregate-by / trend / total), executes the template through `executeQueries`, and renders the result as Markdown.

For the deployer-facing setup guide, including tenant settings, RLS/OBO gaps, Q&A retirement risk, and the current env-only deployment blocker, see [POWERBI_DAX_QNA_ENABLEMENT.md](POWERBI_DAX_QNA_ENABLEMENT.md).

| HTTP | Endpoint | Used by | Frequency |
|---|---|---|---|
| POST | `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` | AAD Service Principal token mint, scope `https://analysis.windows.net/powerbi/api/.default` | First call + every ~55 min (5-min early-refresh window) |
| GET | `https://api.powerbi.com/v1.0/myorg/groups/{groupId}/datasets/{datasetId}` | Dataset metadata fetch on probe | Once per probe |
| POST | `https://api.powerbi.com/v1.0/myorg/groups/{groupId}/datasets/{datasetId}/executeQueries` | Per-question DAX execution (probe schema via INFO.MEASURES / INFO.TABLES / INFO.COLUMNS + every user-question template) | 3 calls on probe + 1 per question |
| POST | `https://api.powerbi.com/v1.0/myorg/groups/{groupId}/datasets/{datasetId}/GenerateToken` | Q&A embed token mint (when the browser opens `/powerbi/qna`) | Once per Q&A session + every ~55 min |

**Profile fields:**

| Field | Required | Notes |
|---|---|---|
| `type` | yes | Must be `"powerbi-semantic-model"`. |
| `aadTenantId` | yes | Or legacy alias `powerBiTenantId`. |
| `aadClientId` | yes | Or legacy alias `powerBiClientId`. AAD app must be added to the Power BI workspace as a Member. |
| `aadClientSecret` | yes | Or legacy alias `powerBiClientSecret`. Never logged, never echoed to the browser. |
| `powerbiGroupId` | yes | Or legacy alias `powerBiGroupId`. Workspace GUID; `me` is not supported. |
| `powerbiDatasetId` | yes | Or legacy alias `powerBiDatasetId`. Dataset GUID. |
| `displayName`, `dataDomain` | no | UI labels. |

**Tenant setting required:** "Service principals can use Power BI APIs" must be ON in the Power BI admin portal.

Every response from the deterministic conversations/start path emits `mode: "powerbi-deterministic", llmCallCount: 0` in both the JSON payload and the audit log. The Q&A embed surface uses Microsoft's NLP inside an iframe — that NLP runs in Microsoft's tenant; PulsePlay only mints the dataset-scoped embed token.

**Known clean-tenant risk:** the current rich metadata probe uses INFO.* DAX functions, but Microsoft's current `executeQueries` documentation says INFO functions and DMV queries are not supported. Treat rich probe success as best-effort until the metadata path is replaced or made configurable.

See [proxy/lib/powerbiDatasetClient.js](../proxy/lib/powerbiDatasetClient.js), [powerbiDaxTemplates.js](../proxy/lib/powerbiDaxTemplates.js), [powerbiQuestionMatcher.js](../proxy/lib/powerbiQuestionMatcher.js).

## 2. Permissions, scopes, network

### 2.1 Databricks workspace permissions

For the **Service Principal or PAT user** the proxy authenticates as:

| Permission | Where to grant | Why |
|---|---|---|
| Workspace user | Settings -> Identity & Access -> Users / Service Principals | Baseline access |
| Genie space CAN_VIEW (or CAN_RUN) | Genie -> space -> Settings -> Permissions | Required to ask questions |
| SQL Warehouse CAN_USE | SQL Warehouses -> warehouse -> Permissions | Required to execute generated SQL |
| Unity Catalog SELECT on tables | Catalog -> table -> Permissions | Required to read the underlying data |
| Workspace API access (PATs enabled) | Admin -> Workspace settings | Required for PAT auth (skip if using OAuth M2M) |
| READ_QUERY_HISTORY | Account console -> Workspace assignments -> Token-based access controls | Required for `/api/2.0/sql/history/queries` (Query Audit panel) |

### 2.2 OAuth M2M scopes (production)

When using `auth.type: oauth-m2m`:

| Scope | Required for |
|---|---|
| `all-apis` | Default scope. Covers Genie + SQL + Unity Catalog. Equivalent to PAT scope. |

If your security team requires least-privilege, narrower options exist but are not currently supported by the Genie API — Databricks recommends `all-apis` for application service principals.

### 2.3 Network outbound from proxy host

Allowlist these from the proxy host (firewall, NSG, k8s network policy):

| Destination | Port | Purpose |
|---|---|---|
| `*.cloud.databricks.com` | 443 | AWS-region Databricks workspaces |
| `*.azuredatabricks.net` | 443 | Azure-region Databricks workspaces |
| `*.databricks.com` | 443 | Generic Databricks (catch-all) |
| `accounts.cloud.databricks.com` | 443 | Account-level OAuth |
| `bedrock-runtime.{region}.amazonaws.com` | 443 | If Bedrock backend |
| `bedrock-agent-runtime.{region}.amazonaws.com` | 443 | If Bedrock Knowledge Base |
| `*.openai.azure.com` | 443 | If Azure OpenAI backend |
| BI vendor SaaS endpoints | 443 | When embed-token endpoints are added (per-vendor) |

### 2.4 Proxy host outbound through corporate TLS-MITM proxy

If the network uses a TLS-MITM proxy (Zscaler, Bluecoat, Forcepoint, etc.), Node needs the corporate root CA in its trust store:

```bash
export NODE_EXTRA_CA_CERTS=/path/to/corp-ca-bundle.pem
node server.js
```

Without this you'll see `unable to verify the first certificate` errors.

## 3. OAuth Service Principal setup (production)

PAT is fine for dev. For production: use a Databricks Service Principal with OAuth M2M. Token rotation happens transparently; no human credential rotates manually.

### 3.1 Setup steps (one-time)

1. **Create the Service Principal.** Account console -> User Management -> Service Principals -> Add Service Principal. Note the `applicationId`.
2. **Generate OAuth secret.** SP -> OAuth Secrets -> Generate Secret. Note the secret value (you only see it once).
3. **Grant workspace assignment.** Account console -> Workspaces -> your workspace -> Permissions -> add the SP as a workspace user.
4. **Grant Genie space access.** Genie space -> Settings -> Permissions -> add the SP as CAN_VIEW or CAN_RUN.
5. **Grant SQL Warehouse access.** SQL Warehouses -> warehouse -> Permissions -> add the SP as CAN_USE.
6. **Grant Unity Catalog SELECT** on the relevant tables/views.
7. **(Optional)** Grant `READ_QUERY_HISTORY` if you want the Query Audit panel to work for this SP.

### 3.2 Configure the proxy to use the SP

```json
{
  "profiles": {
    "sales": {
      "host": "https://your-workspace.cloud.databricks.com",
      "auth": {
        "type": "oauth-m2m",
        "clientId": "<applicationId from step 1>",
        "clientSecret": "<secret from step 2>",
        "scope": "all-apis"
      },
      "spaceId": "01ef000000000000",
      "warehouseId": "0123456789abcdef"
    }
  }
}
```

Or via env vars (recommended for deployment-with-vault patterns):

```bash
export DATABRICKS_OAUTH_CLIENT_ID=<applicationId>
export DATABRICKS_OAUTH_CLIENT_SECRET=<secret>
```

Plus the per-profile env vars:

```bash
export PROXY_PROFILE_SALES_HOST=https://your-workspace.cloud.databricks.com
export PROXY_PROFILE_SALES_SPACE_ID=01ef000000000000
export PROXY_PROFILE_SALES_WAREHOUSE_ID=0123456789abcdef
```

### 3.3 Token rotation behavior

The proxy handles all of this transparently:

- Initial token fetch on first request: ~200-400ms added latency (cached after).
- Tokens cached in-memory (LRU-capped, never persisted to disk).
- **Single-flight protection**: concurrent requests during initial fetch share one HTTP call (no thundering herd).
- **Early refresh** at 90% of token lifetime (~54min into a 1h token). User never sees a 401.
- On 401 from Databricks, cache invalidated immediately so the next request fetches a fresh token.

### 3.4 Secret rotation

- **Disruption-free**: generate a new secret for the SP; deploy new secret to proxy; old secret stays valid for ~1h after revocation. Zero downtime.
- **Forced rotation (compromise)**: revoke the secret in Databricks UI; update proxy config; restart. ~30s downtime if not running multiple proxy instances behind a load balancer.

## 4. Profile shapes

A complete reference of the profile shapes the proxy understands. Detection order matters — the proxy resolves the FIRST matching shape.

### 4.1 Genie (default)

```json
{
  "host": "https://workspace.cloud.databricks.com",
  "auth": { "type": "oauth-m2m", "clientId": "...", "clientSecret": "...", "scope": "all-apis" },
  "spaceId": "01ef...",
  "warehouseId": "01..."
}
```

No `type` field. `spaceId` is the trigger.

### 4.2 Supervisor-local (proxy-side fan-out)

```json
{
  "type": "supervisor-local",
  "host": "https://workspace.cloud.databricks.com",
  "auth": { ... },
  "supervisor": {
    "spaces": ["01ef...space1", "01ef...space2", "01ef...space3"],
    "staggerMs": 2000
  },
  "synthesizer": {
    "type": "foundation-model",
    "endpoint": "databricks-meta-llama-3-1-70b-instruct"
  }
}
```

`type === 'supervisor-local'`. Stagger between fan-out requests is 2000 ms by default (the inline code at [server.js:3556](../proxy/server.js#L3556) — note ADR-0003 still says 800 ms; pending update).

### 4.3 Supervisor (real Mosaic AI Supervisor Agent endpoint)

```json
{
  "type": "supervisor",
  "host": "https://workspace.cloud.databricks.com",
  "auth": { ... },
  "endpoint": "/serving-endpoints/my-supervisor-agent/invocations"
}
```

`type === 'supervisor'`. Calls the Mosaic AI agent endpoint directly.

### 4.4 Foundation Model (Mosaic AI Model Serving)

```json
{
  "type": "foundation-model",
  "host": "https://workspace.cloud.databricks.com",
  "auth": { ... },
  "foundationModelEndpoint": "databricks-meta-llama-3-1-70b-instruct"
}
```

`type === 'foundation-model'`.

### 4.5 Azure OpenAI

```json
{
  "azureOpenAiEndpoint": "https://my-resource.openai.azure.com",
  "azureOpenAiDeployment": "gpt-4o",
  "azureOpenAiApiKey": "...",
  "azureOpenAiApiVersion": "2024-02-15-preview"
}
```

Triggered by `azureOpenAiEndpoint` presence.

### 4.6 Azure OpenAI analytics mode

```json
{
  "mode": "analytics",
  "azureOpenAiEndpoint": "...",
  "azureOpenAiDeployment": "...",
  "azureOpenAiApiKey": "...",
  "host": "https://workspace.cloud.databricks.com",
  "warehouseId": "01...",
  "catalog": "main",
  "schema": "sales"
}
```

`mode === 'analytics'` plus the warehouse and schema config so the orchestrator can generate SQL grounded in real schema.

### 4.7 AWS Bedrock RetrieveAndGenerate

```json
{
  "bedrockRegion": "us-east-1",
  "bedrockAccessKeyId": "...",
  "bedrockSecretAccessKey": "...",
  "bedrockKnowledgeBaseId": "ABCD1234EF",
  "bedrockModelArn": "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0"
}
```

Triggered by `bedrockKnowledgeBaseId` presence.

### 4.8 AWS Bedrock InvokeModel (direct)

```json
{
  "bedrockRegion": "us-east-1",
  "bedrockAccessKeyId": "...",
  "bedrockSecretAccessKey": "...",
  "bedrockModelId": "anthropic.claude-3-5-sonnet-20241022-v2:0"
}
```

Triggered by access keys but no knowledge base ID.

## 5. Response shape contract

Every backend's response is normalized to a Genie-equivalent shape so the AI sidebar reads the same fields regardless of which connector responded. From [proxy/lib/llmOrchestrator.js](../proxy/lib/llmOrchestrator.js):

```typescript
interface AssistantResponse {
  conversation_id: string;
  message_id: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  text?: string;              // The narrative answer
  sqlQuery?: string;          // The generated SQL (when applicable)
  queryResult?: {             // The executed SQL result (when applicable)
    columns: Array<{ name: string; type_name: string; }>;
    rows: Array<Array<any>>;
    truncated: boolean;
  };
  validationDiagnostics?: {   // From insightsValidator (opt-in)
    failureCount: number;
    sections: Array<{ title: string; failures: string[]; }>;
  };
  error?: {
    code: string;
    message: string;
    requestId: string;
  };
}
```

Field meanings:

- `status === 'COMPLETED'` -> the answer is final, render it
- `status === 'IN_PROGRESS'` -> keep polling (SHOULD become unnecessary when streaming lands in v0.4)
- `status === 'FAILED'` -> render the error block
- `text` is markdown
- `sqlQuery` is the SQL the AI generated (or null for non-SQL backends)
- `queryResult` is the executed table (or null)

When a backend doesn't produce SQL or a query result (e.g., a Foundation Model section call), those fields are simply omitted.

## 6. Setup checklist

Print this. Hand it to whoever pilots the proxy.

### Databricks workspace admin

- [ ] Create Service Principal (or generate PAT)
- [ ] Grant SP workspace user role
- [ ] Grant SP CAN_VIEW or CAN_RUN on each Genie space
- [ ] Grant SP CAN_USE on each SQL Warehouse
- [ ] Grant SP SELECT on each Unity Catalog table/view
- [ ] (Optional) Grant SP READ_QUERY_HISTORY for the Query Audit panel
- [ ] Note the workspace host URL
- [ ] Note the SP applicationId + OAuth secret

### Network / firewall admin

- [ ] Allow proxy host outbound to `*.databricks.com` :443
- [ ] Allow proxy host outbound to `accounts.cloud.databricks.com` :443
- [ ] Allow proxy host outbound to `*.openai.azure.com` :443 (if Azure OpenAI)
- [ ] Allow proxy host outbound to `bedrock-runtime.*.amazonaws.com` :443 (if Bedrock)
- [ ] Allow playground host outbound to your proxy URL
- [ ] If MITM TLS proxy: deploy `corp-ca-bundle.pem` to proxy host + set `NODE_EXTRA_CA_CERTS`

### Proxy / DevOps

- [ ] Provision proxy host (org-internal — VM, container, or Databricks App)
- [ ] Set `PROXY_INLINE_CREDENTIALS_MODE=off` for production
- [ ] Set `PROXY_SHARED_KEY` from vault
- [ ] Set per-profile env vars or fetch `config.json` from vault
- [ ] Wire IdP session validation (when middleware lands)
- [ ] Pipe logs to org SIEM
- [ ] Run smoke tests against production-like env

### Compliance / InfoSec

- [ ] Review [SECURITY.md](SECURITY.md) with stakeholders
- [ ] Confirm the SP scope vs user scope strategy (matched, or use Section H CTE for scoping)
- [ ] If regulated: identify which regime applies + map workarounds
- [ ] Approve secret-storage pattern (vault references, never plaintext on disk)
- [ ] Sign off on token rotation cadence (default: SP secret rotates every 90 days)

## 7. Detect what your workspace supports

```bash
# 1. Auth works?
databricks current-user me

# 2. Can you see Genie spaces?
databricks api get /api/2.0/genie/spaces

# 3. Can you see warehouses?
databricks api get /api/2.0/sql/warehouses

# 4. Can you read query history? (optional)
databricks api get /api/2.0/sql/history/queries?max_results=5
```

If any returns 401/403, that's the IT team's setup gap to close.

---

*Compiled 2026-05-10 during the docs consolidation cycle. Re-review at every major release. The Pulse-specific `§4 user identity propagation` and `§5 PBI-sandbox limitations` content is preserved at [inherited/API_AUTH_AND_LIMITATIONS_FULL.md](inherited/API_AUTH_AND_LIMITATIONS_FULL.md).*
