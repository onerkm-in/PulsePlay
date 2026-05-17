# PulsePlay Error Handling Strategy

> Status: locked planning baseline, accepted 2026-05-17 after Codex scan + Claude challenge.
> Scope: proxy API responses, playground UX, BI adapters, Databricks enablement, connector probes, diagnostics, and operator runbooks.

## Goal

PulsePlay has many moving parts: React shell, BI adapters, Databricks APIs, Power BI embedding, AI connector profiles, knowledge packs, proxy auth, SQL warehouses, Vector Search, and future companion surfaces. The user must never be left with a panic-inducing "unknown error" or raw stack text.

Every failure should answer four questions:

1. What happened?
2. What is the likely cause?
3. What can the user or admin do next?
4. What support code joins the UI, proxy logs, and upstream provider logs?

## Decision (locked 2026-05-17)

Adopt an **Error Intelligence Layer** across PulsePlay:

- API errors use RFC 9457 Problem Details as the canonical envelope.
- UI errors render friendly, plain-language messages plus a support code.
- Operator details are available through disclosure, Evidence Drawer, Diagnostics, or support bundle, not dumped into the main user message.
- All errors map to a known category, or to `unexpected_internal` with a request id and logged server-side cause.
- Raw upstream errors, tokens, tenant secrets, SQL/schema internals, stack traces, and full provider bodies never reach viewer-facing copy.

The roadmap is accepted with Claude's 2026-05-17 challenge folded in:

- Slice 1a is a standalone security/supportability hotfix: mount `/responses-agent/*` under the same rate-limit, IdP, shared-key, and allowlist posture as the other cost-bearing AI connector paths.
- Streaming routes cannot always return `application/problem+json` after headers are flushed; later slices must use in-band stream error events for post-first-chunk failures.
- Pulse sibling clients keep the safe legacy `error` compatibility field while PulsePlay migrates to Problem Details.
- New lint/audit gates should prevent the raw-error count from increasing before attempting a full one-PR cleanup of every legacy offender.

## Source-Backed Baseline

| Source | PulsePlay interpretation |
|---|---|
| [RFC 9457 - Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457) | Use `type`, `title`, `status`, `detail`, and `instance` as the stable API error base. Add safe extension fields for PulsePlay. |
| [W3C Trace Context](https://www.w3.org/TR/trace-context/) | Use `traceparent`/trace ids to correlate browser, proxy, and provider activity. Do not put PII or secrets in trace fields. |
| [OpenTelemetry context propagation](https://opentelemetry.io/docs/concepts/context-propagation/) | Propagate trace/request context through service calls and correlate logs with traces. |
| [OWASP Improper Error Handling](https://owasp.org/www-community/Improper_Error_Handling) | Avoid inconsistent or over-detailed errors that reveal internals; centralize policy. |
| [OWASP Developer Guide: Handle all errors and exceptions](https://devguide.owasp.org/en/04-design/02-web-app-checklist/10-handle-errors-exceptions/) | Centralize exception handling, avoid critical-data leaks, log enough for support and incident response, and test error handling. |
| [IBM Carbon notification guidance](https://carbondesignsystem.com/components/notification/usage/) | Error content must be concise and include user action. Inline notifications fit task failures; toasts are more disruptive. |
| [Nielsen Norman heuristics summary](https://media.nngroup.com/media/articles/attachments/Heuristic_Summary1_Letter-compressed.pdf) | Error messages should be plain-language, precise, and constructively suggest a solution. |

## API Problem Contract

New and migrated proxy routes should return `application/problem+json` for non-2xx errors, while preserving legacy `error` during migration for existing callers.

```json
{
  "type": "https://pulseplay.internal/problems/embed-token-denied",
  "title": "Embed token cannot be issued",
  "status": 403,
  "detail": "This report is not approved for embedding in PulsePlay.",
  "instance": "urn:pulseplay:error:20260517:abc123",
  "code": "EMBED_TOKEN_DENIED",
  "category": "governance_allowlist",
  "severity": "error",
  "retryable": false,
  "requestId": "req_20260517_abc123",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "spanId": "00f067aa0ba902b7",
  "target": "bi.reportId",
  "provider": "powerbi",
  "upstreamStatus": 403,
  "userAction": "Choose an approved report in Settings.",
  "operatorAction": "Check the BI allowlist and service-principal permissions for this workspace/report.",
  "links": {
    "help": "/help/errors/embed-token-denied",
    "runbook": "/runbooks/errors/embed-token-denied"
  },
  "errors": [
    {
      "pointer": "#/reportId",
      "code": "REPORT_NOT_ALLOWLISTED",
      "detail": "The selected report id is not in the organization allowlist."
    }
  ],
  "error": "This report is not approved for embedding in PulsePlay."
}
```

Migration note: `error` stays as a short safe legacy field until all clients read the problem contract.

## Error Categories

| Category | Typical HTTP | Example stable codes | User-facing copy pattern | Admin/operator action |
|---|---:|---|---|---|
| `auth` | 401 | `AUTH_REQUIRED`, `TOKEN_EXPIRED`, `SP_SECRET_INVALID` | "PulsePlay could not authenticate to the selected service." | Re-authenticate, rotate PAT/client secret, check IdP/JWKS config. |
| `permission` | 403 | `PROVIDER_PERMISSION_DENIED`, `UC_OBJECT_FORBIDDEN` | "The identity is signed in but does not have access to this asset." | Grant access to workspace/report/Genie space/warehouse/UC object. |
| `governance_allowlist` | 403 | `REPORT_NOT_ALLOWLISTED`, `PROFILE_NOT_ALLOWED` | "This selection is outside your organization's PulsePlay allowlist." | Update allowlist policy or choose an approved profile/asset. |
| `config` | 400/503 | `PROFILE_MISSING_FIELD`, `WAREHOUSE_NOT_CONFIGURED` | "PulsePlay is missing required setup for this action." | Update proxy profile, Settings setup tree, or environment variables. |
| `validation` | 400 | `INVALID_INPUT`, `FIELD_REQUIRED`, `INVALID_JSON` | "One or more fields need attention." | Fix field-level input; show inline errors with pointers. |
| `network_tls` | 502/503 | `UPSTREAM_UNREACHABLE`, `TLS_CHAIN_FAILED`, `DNS_FAILED` | "PulsePlay could not reach the upstream service." | Check network path, DNS, proxy egress, corporate TLS chain, `NODE_EXTRA_CA_CERTS`. |
| `rate_limit` | 429 | `PROVIDER_RATE_LIMIT`, `LOCAL_RATE_LIMIT` | "The service is receiving too many requests. Wait and retry." | Use `Retry-After`, reduce fan-out, tune backoff/caching. |
| `upstream_unavailable` | 502/503 | `DATABRICKS_UNAVAILABLE`, `POWERBI_API_UNAVAILABLE` | "The provider returned an unavailable or failed state." | Check provider status, request logs, region/workspace health. |
| `capability_absent` | 404/501 | `VECTOR_SEARCH_ABSENT`, `GENIE_NOT_AVAILABLE` | "This capability is not available in the selected workspace/profile." | Hide feature, configure capability, or choose another profile. |
| `embedding_blocked` | 409/502 | `IFRAME_BLOCKED`, `EMBED_POLICY_BLOCKED` | "The asset exists, but browser or vendor policy is blocking embedding." | Enable embedding/share iframe, allow PulsePlay origin, check frame ancestors/admin settings. |
| `schema_sql` | 400/422 | `SQL_INVALID`, `WAREHOUSE_STOPPED`, `SCHEMA_NOT_FOUND` | "The generated SQL or configured schema cannot run as-is." | Fix schema context, warehouse id, SQL permissions, or prompt/pack metadata. |
| `timeout_cancelled` | 408/499/504 | `REQUEST_TIMEOUT`, `USER_CANCELLED` | "The request did not finish in time." | Retry, warm warehouse, lower scope, or inspect provider latency. |
| `unexpected_internal` | 500 | `UNEXPECTED_PROXY_ERROR`, `UNEXPECTED_UI_ERROR` | "PulsePlay could not complete this request. Share the support code with the admin." | Inspect logs by request id/trace id. Root cause stays server-side until classified. |

## UX Pattern

### Viewer-Facing Message

Use a compact error card near the failed surface:

- Short title: what stopped.
- One-sentence reason: likely cause in business language.
- Next action: Retry, Open Settings, Reconnect, Choose approved asset, View details.
- Support code: request id or trace id.

Avoid raw `HTTP 503`, stack traces, JSON blobs, unredacted upstream details, and vague "Something went wrong" without a support code.

### Author/Admin Detail

Use a disclosure, Evidence Drawer, Console, or support bundle for:

- Error category and code.
- Provider and route family.
- Upstream status.
- Request id, trace id, span id.
- Sanitized cause chain.
- Suggested admin runbook.

### Forms And Setup

For setup/configuration errors:

- Keep entered values.
- Show inline field errors and an error summary.
- Link/focus to the field when possible.
- Use the same code/category contract as API errors.

### Notifications

- Inline notification for task-specific failure.
- Toast only for background/system status, and never as the only place critical errors live.
- Modal only when the user must stop before continuing.

## Current Strengths To Preserve

- `X-Request-Id` middleware and audit log correlation already exist in [proxy/server.js](../proxy/server.js).
- `databricksRequest` already redacts token patterns, retries transient GET network errors, backs off for 429s, and can propagate `X-Request-Id`.
- SQL preview already has targeted validation and redaction in [sqlSectionPreview.js](../proxy/lib/sqlSectionPreview.js).
- Diagnostics buffer and export bundle already capture recent BI events and console errors with redaction in [diagnosticsBuffer.ts](../playground/src/settings/diagnosticsBuffer.ts) and [exportBundle.ts](../playground/src/settings/exportBundle.ts).
- Newer Databricks enablement routes are closer to the desired pattern than older connector routes because they map upstream statuses and audit each failure.

## Current Gaps

### P0 - Security / Supportability Gaps

1. `/responses-agent/*` was a cost-bearing Databricks-backed route family not mounted under the same auth/rate-limit/shared-key middleware family as `/assistant`, `/openai`, `/bedrock`, `/foundation`, and `/supervisor`. **Closed in Slice 1a (2026-05-17):** `/responses-agent` now inherits rate-limit, IdP, shared-key, and allowlist middleware.
2. `express.json()` currently mounts before request-id/CORS/security middleware. Malformed JSON can fall through to non-standard Express error bodies without a PulsePlay support code.
3. Several older connector routes return raw `err.message` to clients, including Azure OpenAI, Bedrock, Foundation Model, ResponsesAgent, Supervisor, and history SQL paths.
4. Databricks OAuth token acquisition errors are not normalized by `errorStatusFromDatabricks`, whose parser only handles `Databricks NNN:` messages.

### P1 - Product Clarity Gaps

1. `BIPanel` collapses adapter, governance, SDK, iframe, and config failures into one raw string: `Failed to embed ...`.
2. BI adapter errors use string constants but not a diagnostic shape with `code`, `category`, `likelyCause`, `resolution`, and `source`.
3. React `AISidebar` fetch paths surface raw proxy strings and do not consistently generate or display request ids, while legacy Pulse XHR already does.
4. Setup/admin surfaces often display `HTTP 503` or direct upstream `error` strings without likely cause or next action.
5. Connector probe can read like success even when metadata probing failed: "Connection successful (no metadata)" should become "PulsePlay reached the connector, but upstream metadata probe failed."
6. Capability registry status is useful but too coarse: `absent`, `forbidden`, and `error` need category mapping for Launchpad and Settings.

### P2 - Observability And Runbook Gaps

1. Request id propagation is incomplete in some Databricks helper chains and supervisor paths.
2. Metadata/discovery failures are intentionally swallowed to keep the user flow alive, but the root cause is not consistently written to diagnostics.
3. Embedding-blocked failures are hard to classify after iframe load because browser security policies hide details; setup should preflight and provide vendor-specific admin hints where possible.
4. No central problem-type catalog or internal runbook links exist yet.

## Implementation Roadmap

### Slice 1a - ResponsesAgent Middleware Hotfix

- Mount `/responses-agent` under rate limit, IdP, shared key, and allowlist posture.
- Add structural and behavioral tests proving the prefix cannot drift out of auth/rate-limit coverage.

### Slice 1b - Backend Guardrail And Contract Foundation

- Add `proxy/lib/problemDetails.js` with helpers:
  - `createProblem()`
  - `sendProblem()`
  - `mapDatabricksError()`
  - `mapUpstreamError()`
  - `redactProblemCause()`
- Mount request-id/CORS before body parsing where possible, and add JSON parse/global error middleware.
- Convert high-risk raw `err.message` routes to `sendProblem()` while retaining legacy `error`.
- Add tests for malformed JSON, redaction, and problem shape.

### Slice 2 - Frontend Problem Reader And Error Card

- Add `playground/src/lib/problemDetails.ts`:
  - `parseProblemResponse(response)`
  - `problemToUserError(problem)`
  - `makeRequestId()`
- Thread request ids through React fetch paths.
- Render `ErrorCard` in `BIPanel`, `AISidebar`, Launchpad, Knowledge, Settings health/probe surfaces.
- Keep raw detail in diagnostics/export bundle only.

### Slice 3 - Adapter Diagnostics

- Promote `BI_ERR` from string constants to structured adapter diagnostics.
- Add `AdapterError` or `BIAdapterProblem` shape:
  - `code`, `category`, `source`, `userMessage`, `likelyCause`, `resolution`, `detail`.
- Convert generic iframe, Power BI, Databricks AI/BI, and Databricks Genie adapter throws first.
- Keep adapter conformance tests but assert diagnostic payloads.

### Slice 4 - Error Catalog And Runbooks

- Add `docs/ERROR_CATALOG.md` with stable codes, type URIs, copy, operator action, owner, and test coverage.
- Add internal runbook stubs for top categories: auth, permission, network/TLS, config, rate limit, embedding blocked, schema/SQL.
- Link Settings/Console/Evidence Drawer detail views to the catalog.

### Slice 5 - Zero-Unknown Audit Gate

- Add a test/lint check that scans for new `res.status(...).json({ error: err.message })` and unclassified `throw new Error` in adapter surfaces.
- Add negative-path smoke tests for every connector family.
- Release gate: no critical path shows raw `HTTP NNN` as the only user-facing message.

## Acceptance Criteria

- Every non-2xx proxy route returns a problem object or is explicitly documented as streaming/legacy.
- Every problem response includes `requestId`; trace ids are included when available.
- Viewer-facing copy includes what happened and what to do next.
- Admin detail includes likely cause, provider, upstream status, and runbook link when available.
- No tokens, Authorization headers, service-principal identifiers, SQL schema/table/column names, stack traces, or full upstream bodies appear in viewer-facing errors.
- Critical errors are not auto-dismissed.
- All new error categories have negative tests.
- `unexpected_internal` is allowed only as a safe fallback with support code and server-side log detail.
