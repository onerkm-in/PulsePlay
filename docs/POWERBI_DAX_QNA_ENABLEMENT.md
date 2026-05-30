# Power BI DAX / Q&A Enablement

Last updated: 2026-05-22

## Bottom line

PulsePlay has two separate Power BI natural-language surfaces:

| Surface | What it does | Status | Strategic call |
| --- | --- | --- | --- |
| `powerbi-semantic-model` | PulsePlay maps a question to deterministic DAX templates, runs Power BI `executeQueries`, and renders Markdown. No LLM is called. | Backend exists; normal Ask Pulse UI and env-only deployment need fixes. | Durable path. Invest here. |
| Power BI Q&A embed | PulsePlay mints an embed token and loads Microsoft's Q&A iframe. Microsoft handles natural language inside Power BI. | Route and component exist. | Tactical bridge only. Microsoft retires Q&A in December 2026. |

Do not describe Power BI Q&A as a PulsePlay AI connector. It is a Microsoft Power BI embedded experience. PulsePlay's AI-side connector is the semantic-model DAX path.

## What already exists in PulsePlay

### Deterministic DAX path

Code path:

1. Profile type: `powerbi-semantic-model`.
2. Endpoint: `POST /powerbi/conversations/start`.
3. Profile resolver validates tenant/client/secret/workspace/dataset at [proxy/server.js](../proxy/server.js).
4. Dataset schema probe runs in [proxy/lib/connectorProbe.js](../proxy/lib/connectorProbe.js).
5. Question matching runs in [proxy/lib/powerbiQuestionMatcher.js](../proxy/lib/powerbiQuestionMatcher.js).
6. DAX templates live in [proxy/lib/powerbiDaxTemplates.js](../proxy/lib/powerbiDaxTemplates.js).
7. Power BI calls are made by [proxy/lib/powerbiDatasetClient.js](../proxy/lib/powerbiDatasetClient.js).

Current behavior:

- Supported deterministic templates: `top-n`, `aggregate-by`, `trend`, and `total`.
- DAX slot values are sanitized before query execution.
- Responses emit `mode: "powerbi-deterministic"` and `llmCallCount: 0`.
- The path is server-side. AAD client secrets never go to the browser.

Current product gap:

- The normal Ask Pulse sidebar still posts to `/api/assistant/conversations/start`. A clean Power BI DAX experience must route `powerbi-semantic-model` profiles to `/api/powerbi/conversations/start`.

### Power BI Q&A embed path

Code path:

1. User opens `/powerbi/qna`.
2. [playground/src/powerbi/PowerBiQnARoute.tsx](../playground/src/powerbi/PowerBiQnARoute.tsx) loads the Q&A shell.
3. [playground/src/lib/powerbiQnAClient.ts](../playground/src/lib/powerbiQnAClient.ts) requests an embed token from `/api/powerbi/qna/embed-token`.
4. [proxy/server.js](../proxy/server.js) mints a dataset embed token with Power BI `GenerateToken`.
5. [playground/src/components/PowerBiQnA.tsx](../playground/src/components/PowerBiQnA.tsx) embeds `type: "qna"` with `QnaMode.Interactive`.

Current behavior:

- The browser receives only the short-lived embed token and embed URL.
- `PowerBiQnA.tsx` refreshes the token before expiry.
- Settings already exposes an "Open Power BI Q&A" entry point when the active AI profile is `powerbi-semantic-model`.
- The UI warns that Power BI Q&A retires on December 31, 2026.

## Microsoft setup prerequisites

### Entra app registration

Create a Microsoft Entra app registration for the backend service. Capture:

- Tenant ID.
- Application/client ID.
- Client secret or certificate.
- Service principal object or a security group containing the service principal.

For service-principal embedding, Microsoft's current guidance says the app registration does not need delegated or application API permissions configured in Azure portal for this app-owns-data flow; workspace access and Power BI tenant settings are the decisive controls. For user-delegated/OBO RLS flows, delegated Power BI scopes become relevant.

Prefer certificates over client secrets for enterprise deployment. For a personal/free-credit test, a short-lived secret is acceptable if it is kept in local secrets, App Service settings, Databricks secrets, or Key Vault, never in frontend code.

### Power BI tenant settings

A Power BI admin must enable the relevant tenant settings:

- `Embed content in apps`.
- `Allow service principals to use Power BI APIs`.
- `Dataset Execute Queries REST API`.

Enterprise setup should restrict service-principal access to a dedicated Entra security group rather than the whole organization.

### Workspace and semantic model access

The service principal or its security group must be added to the target Power BI workspace as Member, Contributor, or Admin. For the semantic-model DAX path, it needs access to the target semantic model/dataset and enough permission for `executeQueries`.

Collect:

- Power BI workspace/group ID.
- Power BI semantic model/dataset ID.
- Dataset display name and business owner.
- Whether the model uses RLS, OLS, SSO, DirectQuery, composite models, or live connections.

## PulsePlay profile configuration

`proxy/config.example.json` already documents the required profile shape:

```json
{
  "type": "powerbi-semantic-model",
  "displayName": "Power BI: Sales Semantic Model",
  "dataDomain": "Sales performance",
  "aadTenantId": "YOUR_AAD_TENANT_GUID",
  "aadClientId": "YOUR_SERVICE_PRINCIPAL_CLIENT_ID",
  "aadClientSecret": "YOUR_SERVICE_PRINCIPAL_CLIENT_SECRET",
  "powerbiGroupId": "YOUR_POWERBI_WORKSPACE_GUID",
  "powerbiDatasetId": "YOUR_POWERBI_DATASET_GUID"
}
```

The proxy also accepts the legacy aliases `powerBiTenantId`, `powerBiClientId`, `powerBiClientSecret`, `powerBiGroupId`, and `powerBiDatasetId`.

Optional RLS-related profile fields:

```json
{
  "powerBiRlsEnabled": true,
  "powerBiRlsRequired": true,
  "powerBiRlsUsernameClaim": "email",
  "powerBiRlsUsername": "",
  "powerBiRlsRoles": "Sales"
}
```

### Clean-deployment blocker

For env-only deployment, the proxy maps:

- `PROXY_PROFILE_<NAME>_POWER_BI_TENANT_ID`
- `PROXY_PROFILE_<NAME>_POWER_BI_CLIENT_ID`
- `PROXY_PROFILE_<NAME>_POWER_BI_CLIENT_SECRET`
- `PROXY_PROFILE_<NAME>_POWER_BI_RLS_*`

But it does not yet map:

- `PROXY_PROFILE_<NAME>_POWER_BI_GROUP_ID`
- `PROXY_PROFILE_<NAME>_POWER_BI_DATASET_ID`

That means Azure App Service or Databricks Apps can carry tenant/client/secret in settings, but cannot create a complete `powerbi-semantic-model` profile from environment variables alone. Until this is fixed, deployers must either:

1. Ship a server-side `proxy/config.json` containing `powerbiGroupId` and `powerbiDatasetId`, with secrets supplied by env overrides, or
2. Patch `ENV_PROFILE_FIELDS` in [proxy/server.js](../proxy/server.js) to include `POWER_BI_GROUP_ID` and `POWER_BI_DATASET_ID`.

Recommended fix:

```js
POWER_BI_GROUP_ID: 'powerBiGroupId',
POWERBIGROUPID: 'powerBiGroupId',
POWER_BI_DATASET_ID: 'powerBiDatasetId',
POWERBIDATASETID: 'powerBiDatasetId'
```

## Request flows

### DAX answer flow

1. Browser sends the user question to `/api/powerbi/conversations/start`.
2. Combined hosting strips `/api` before reaching the proxy route.
3. Proxy resolves the active `powerbi-semantic-model` profile.
4. Proxy probes or reuses dataset metadata.
5. Question matcher selects a deterministic DAX template.
6. Proxy executes one DAX query through Power BI `executeQueries`.
7. Proxy returns a completed assistant-style message with Markdown and audit metadata.

This route is synchronous today. It returns a completed payload rather than streaming partial LLM tokens.

### Q&A embed flow

1. User opens `/powerbi/qna`.
2. Browser requests `/api/powerbi/qna/embed-token`.
3. Proxy validates the configured semantic-model profile.
4. Proxy calls Power BI `GenerateToken` for the dataset.
5. Browser embeds the Q&A iframe with `type: "qna"` and `QnaMode.Interactive`.
6. Microsoft Power BI performs natural language parsing and visual rendering inside the iframe.

## Security and RLS

### What is safe today

- Service principal credentials stay on the proxy.
- Browser-supplied effective identities are rejected in the existing Power BI report embed-token path.
- Embed tokens are short-lived and should be cached only server-side with expiry buffers.
- Audit records identify deterministic Power BI DAX responses with `llmCallCount: 0`.

### What is not complete

- The DAX route currently calls `executeDaxNormalized(profile, dax)` without a user assertion. For RLS-enforced `executeQueries`, service principal access is not enough; the route needs a user-delegated/OBO path.
- `acquirePbiAccessTokenOnBehalfOf` already exists in `powerbiDatasetClient.js`, but the route does not use it.
- The Q&A embed-token helper can accept effective identities, but the Q&A route does not yet derive and pass server-side RLS identities the way the report embed-token path does.
- The schema probe currently tries `INFO.MEASURES`, `INFO.TABLES`, and `INFO.COLUMNS`. Microsoft's current `executeQueries` docs say INFO functions and DMV queries are not supported, so clean tenants may fail the rich metadata probe.

## Operational limits and gotchas

Power BI `executeQueries` constraints that matter for PulsePlay:

- DAX only.
- One query per API call.
- One table result per query.
- Maximum 100,000 rows or 1,000,000 values per query.
- Maximum 15 MB of data per query.
- 120 query requests per minute per user.
- Service principals are not supported for datasets with RLS or SSO enabled on this API.
- INFO functions and DMV queries are not supported by the current Microsoft documentation.

Q&A constraints that matter for PulsePlay:

- Q&A embedded analytics supports one dataset in the embed configuration.
- Interactive and result-only modes are supported.
- Q&A experiences and Q&A setup retire in December 2026.
- Q&A setup and linguistic-schema investment is a stranded asset for PulsePlay. Keep the bridge, but do not build product roadmap around it.

## Clean enablement plan

### Phase 0 - Document and prepare

- Create a `powerbi-semantic-model` profile with placeholder GUIDs.
- Confirm whether deployment will use `proxy/config.json`, env-only, or Key Vault-backed settings.
- Decide whether the first smoke uses a non-RLS dataset. This is strongly preferred for the first proof.

### Phase 1 - Tenant and workspace setup

- Register the Entra app.
- Create or choose the dedicated Entra security group.
- Add the service principal to that group.
- Enable Power BI tenant settings for that security group.
- Add the service principal/security group to the Power BI workspace.
- Capture workspace ID and dataset ID.

### Phase 2 - PulsePlay backend proof

- Configure the profile.
- Start the proxy.
- Call `/powerbi/health` and confirm the profile resolves.
- Call `/powerbi/conversations/start` with a simple total/top-N question.
- Record whether metadata probe is rich, minimal, or failed.

### Phase 3 - Product wiring

- Route `AISidebar` requests to `/api/powerbi/conversations/start` when the active profile type is `powerbi-semantic-model`.
- Add env field mapping for `POWER_BI_GROUP_ID` and `POWER_BI_DATASET_ID`.
- Add tests for env-only profile construction.
- Add user-facing fallback messages for unsupported questions and metadata probe failures.

### Phase 4 - RLS and enterprise hardening

- Wire OBO/user assertion into the DAX route for RLS datasets.
- Mirror server-derived RLS identity into the Q&A embed-token route.
- Add rate-limit handling and cache strategy for `executeQueries`.
- Replace the INFO.* probe with a supported metadata path or make the rich probe optional with a clean fallback.
- Add security tests for DAX slot sanitization, RLS-required failures, and browser-supplied identity rejection.

## Troubleshooting checklist

| Symptom | Likely cause | Check |
| --- | --- | --- |
| `No Power BI semantic-model profile configured` | Missing profile fields or env-only missing workspace/dataset IDs | Confirm profile has tenant/client/secret/group/dataset |
| 401 from Power BI | Bad tenant/client/secret or wrong authority | Recreate the app secret, confirm tenant ID |
| 403 from Power BI | Tenant setting or workspace permission missing | Check Power BI admin portal and workspace access |
| `executeQueries` works locally but fails on RLS dataset | Service principal path used against RLS model | Use OBO/user-delegated route |
| Metadata probe returns minimal/none | INFO.* unsupported or blocked | Fall back to configured metadata or supported TOM/XMLA path |
| Q&A iframe loads but cannot answer | Q&A unsupported model shape or tenant feature issue | Validate in Power BI service first |
| Q&A works now but has roadmap risk | Microsoft retirement | Treat as bridge through December 2026 only |

## Official references checked

- Microsoft Learn: Execute Queries REST API - https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/execute-queries
- Microsoft Learn: Embed Power BI content with service principal and application secret - https://learn.microsoft.com/en-us/power-bi/developer/embedded/embed-service-principal
- Microsoft Learn: Generate an embed token - https://learn.microsoft.com/en-us/power-bi/developer/embedded/generate-embed-token
- Microsoft Learn: Q&A in Power BI embedded analytics - https://learn.microsoft.com/en-us/power-bi/developer/embedded/qanda
- Microsoft Learn: Limitations of Power BI Q&A - https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-limitations
- Microsoft Fabric Community / Power BI Updates Blog: Deprecating Power BI Q&A - https://powerbi.microsoft.com/en-us/blog/deprecating-power-bi-qa/
- Microsoft Learn: Register an application in Microsoft Entra ID - https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app
