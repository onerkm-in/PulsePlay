# Proxy Deployment Guide

Related documents:

- [DEPLOYMENT_GUIDELINES.md](DEPLOYMENT_GUIDELINES.md)
- [TECHNICAL_REFERENCE.md](TECHNICAL_REFERENCE.md)
- [PERFORMANCE_AND_SECURITY_CHECKLIST.md](PERFORMANCE_AND_SECURITY_CHECKLIST.md)

## Why a Proxy Is Recommended

The visual can call Databricks directly using a Personal Access Token (PAT) stored in the Power BI format-pane settings. This is acceptable for controlled developer testing but is not recommended for production because:

- PATs stored in format-pane settings are visible to any report editor.
- Tokens cannot be rotated without updating every report that uses them.
- Direct mode cannot enforce organization-level rate limits or logging.
- Power BI does not provide per-user identity propagation to Databricks automatically.

A production proxy or gateway addresses all of these by placing a controlled, auditable server between the visual and Databricks.

## How the Visual Uses the Shared PulsePlay Proxy

Configure the visual's **PulsePlay Proxy URL** setting to point at the shared PulsePlay proxy base URL (for example `https://pulseplay-proxy.example.com`). When this setting is populated:

- The visual sends all assistant requests to the shared PulsePlay proxy under `/assistant/*` instead of calling Databricks REST paths directly.
- Every request includes `X-Pulse-Client: pulse-pbi`, `X-Pulse-Client-Version`, and request-id headers so proxy audit logs can distinguish Power BI custom visual traffic.
- If configured, the visual sends the proxy shared secret as `X-PulsePlay-Key`.
- If configured, the visual sends `assistantProfile` in request bodies / query strings and as `X-Assistant-Profile`.
- Direct developer mode remains available only when **PulsePlay Proxy URL** is blank; then the browser calls Databricks directly with the PAT stored in the report.

The production proxy is the PulsePlay repo-root [`proxy/`](../../../proxy) service. The snapshot-local [`../proxy/server.js`](../proxy/server.js) is historical reference / local testing code, not the production contract.

## Proxy Interface Contract

The shared PulsePlay proxy must expose the following to the visual:

| Route | Method | Description |
|---|---|---|
| `/health` | GET | Health check and auth posture |
| `/clients/compatibility` | GET | PX1 compatibility handshake for PulsePlay / Pulse PBI / desktop clients |
| `/assistant/capabilities?assistantProfile={profile}` | GET | Connection check for the configured profile |
| `/assistant/conversations/start` | POST | Start a Genie conversation |
| `/assistant/conversations/{conversationId}/messages` | POST | Send a follow-up |
| `/assistant/conversations/{conversationId}/messages/{messageId}` | GET | Poll message status; proxy enriches completed query results inline when available |
| `/feedback` | POST | Optional — receive usage feedback logs |

The proxy must:

- Accept `GET` and `POST` requests on the PulsePlay assistant paths above.
- Resolve the target Databricks workspace from server-side profile config, or from inline `X-Databricks-*` headers only when that mode is explicitly enabled for local/lab use.
- Stamp renderable responses with the proxy governance attestation field.
- Return CORS headers that allow the Power BI visual sandbox to receive responses.

Required CORS headers on all responses:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Content-Type, Authorization, X-PulsePlay-Key, X-Pulse-Client, X-Pulse-Client-Version, X-Pulse-Request-Id, X-Request-Id, X-Assistant-Profile, X-Databricks-Host, X-Databricks-Token, X-Genie-Space-Id
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Expose-Headers: X-Request-Id, X-Pulse-Request-Id, X-Pulse-Client
```

The repo-root PulsePlay proxy already emits these headers.

## Power BI WebAccess Origins

Power BI custom visuals require outbound origins to be declared in `capabilities.json` before packaging. The committed visual includes Databricks hosts plus local development proxy origins (`localhost` / `127.0.0.1`). For a hosted shared proxy, add your production proxy origin to the `WebAccess` privilege parameters before packaging the `.pbiviz`, for example:

```json
"https://pulseplay-proxy.example.com"
```

Do not use an open wildcard for production packaging. Keep the list as narrow as the deployed proxy origins your organization actually uses.

## Production Requirements

Any proxy deployed outside local development must satisfy all of the following:

**Transport**
- All traffic must use HTTPS with a valid TLS certificate.
- HTTP-only endpoints must not be used outside local development.

**Authentication**
- The proxy must authenticate callers before forwarding requests to Databricks.
- Preferred: OAuth 2.0 / OIDC with a managed identity or service principal.
- Acceptable for internal deployments: a shared secret or API key validated by the proxy.
- Not recommended for production: relying solely on the PAT forwarded from the visual.

**Authorization**
- The proxy must validate that the incoming request targets only permitted Genie Space IDs.
- Block requests to paths not matching `/api/2.0/genie/spaces/{allowedSpaceId}/...`.

**Rate Limiting**
- Enforce per-caller or global request rate limits.
- Return HTTP 429 with a `Retry-After` header when limits are exceeded.
- The visual handles non-2xx responses gracefully and will surface the error to the user.

**Token Management**
- Store the Databricks token in a secrets manager (Azure Key Vault, AWS Secrets Manager, HashiCorp Vault, or equivalent).
- Do not hard-code tokens in proxy source or configuration files.
- Rotate tokens on the proxy without requiring changes to Power BI reports.

**Logging and Monitoring**
- Log request metadata (timestamp, caller identity, space ID, response status, latency).
- Do not log Genie prompt content unless required and approved for your organization.
- Alert on elevated error rates or latency.

**Request Validation**
- Reject requests with missing or malformed paths.
- Reject requests with a body size that exceeds a reasonable limit (suggested: 64 KB).
- Return 400 for invalid requests before forwarding anything to Databricks.

## Common Platform Patterns

### Azure API Management (APIM)

Suitable for organizations already using APIM as a gateway.

Key configuration steps:

1. Create an APIM API that mirrors the Genie API path pattern `/api/2.0/genie/spaces/*`.
2. Store the Databricks token in Azure Key Vault and retrieve it via a named value in APIM.
3. Add an inbound policy to inject `Authorization: Bearer <token>` and set `X-Genie-Target-Host`.
4. Add a rate-limit-by-key policy keyed on the caller subscription or IP.
5. Add CORS headers to responses via an outbound policy.
6. Point the visual's **API Base URL Override** at the APIM gateway URL.

Advantages: built-in auth (subscriptions, OAuth), rate limiting, logging to Azure Monitor, TLS by default.

### Azure Functions (HTTP Trigger)

Suitable for lightweight deployments that need custom validation logic.

Key configuration steps:

1. Create an HTTP-triggered Azure Function that accepts the Genie API path pattern.
2. Store the Databricks token in Azure Key Vault and bind it as an environment variable.
3. Validate the incoming path, inject authorization, forward to Databricks using `fetch`, and return the response.
4. Use Azure AD authentication or a function-level key to restrict access.
5. Add CORS configuration in the Function App settings.
6. Point the visual's **API Base URL Override** at the Function App URL.

Advantages: low operational overhead, scales to zero, easy to add custom validation logic.

### AWS API Gateway + Lambda

Suitable for organizations running on AWS.

Key configuration steps:

1. Create an API Gateway REST API or HTTP API with a proxy resource `{proxy+}`.
2. Back the resource with a Lambda function that validates the path, retrieves the Databricks token from AWS Secrets Manager, and forwards the request.
3. Enable CORS on the API Gateway resource.
4. Use an API Gateway usage plan and API key for rate limiting, or a Lambda authorizer for identity-based access.
5. Point the visual's **API Base URL Override** at the API Gateway invoke URL.

Advantages: familiar AWS operational model, tight integration with IAM and Secrets Manager.

### Nginx Reverse Proxy

Suitable for on-premises or VM-based deployments where a managed platform is not available.

Key configuration notes:

- Configure Nginx to proxy only the `/api/2.0/genie/spaces/` path prefix to the Databricks host.
- Inject the `Authorization` header using `proxy_set_header`.
- Add CORS headers using the `add_header` directive on responses.
- Use `limit_req_zone` and `limit_req` for basic rate limiting.
- Terminate TLS at Nginx with a valid certificate.
- Store the Databricks token in an environment variable or a secrets file readable only by the Nginx process user.

Caution: Nginx does not provide built-in authentication. Pair with a network policy, mTLS, or an upstream auth module.

### Local Proxy (Testing Only)

The snapshot-local `enablers/pulse-pbi/proxy/server.js` is preserved as upstream historical reference. New PulsePlay work should use the repo-root shared proxy instead:

```powershell
cd ../../../proxy
node server.js
```

For local Power BI Desktop testing, configure **PulsePlay Proxy URL** to `http://localhost:8787` and ensure `capabilities.json` includes the local WebAccess origins.

The historical local proxy must not be used as the production gateway. It speaks the old Databricks-shaped route pattern and does not provide the full PulsePlay client identity, governance, audit, allowlist, and auth contract.

## Validation Checklist for a New Proxy Deployment

Before connecting the visual to any new proxy:

1. Confirm the proxy URL is accessible from Power BI Service (not just from a local machine).
2. Confirm the proxy health endpoint returns `{"ok": true}` with HTTP 200.
3. Confirm HTTPS is enforced — HTTP requests should redirect or be rejected.
4. Confirm the Databricks token is stored in a secrets manager, not in code or config files.
5. Confirm path allowlisting blocks requests to non-Genie paths.
6. Confirm rate limits are active and return HTTP 429 when triggered.
7. Confirm CORS headers are present on all responses including errors.
8. Confirm the visual's **PulsePlay Proxy URL** points at the shared PulsePlay proxy, not at Databricks directly.
9. Confirm the connection indicator in the visual shows green before publishing.
10. Confirm request logs appear in your monitoring system after a test question is asked.
