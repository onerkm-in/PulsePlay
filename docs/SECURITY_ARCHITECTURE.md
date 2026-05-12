# PulsePlay — Enterprise Security Architecture

> **Audience:** security review board, enterprise architecture review board, identity-and-access stewards.
> **Companion docs:** [SECURITY.md](SECURITY.md) (internal posture summary), [ARCHITECTURE.md](ARCHITECTURE.md) (system design), [PROXY_REFERENCE.md](PROXY_REFERENCE.md) (API surface).
> **Last audit:** 2026-05-11, working tree after `c3133b8` (Power BI secure embed quick-preview landed).

## Executive Summary

PulsePlay is a **defense-in-depth orchestration layer**, not a fortress. It sits between the org's existing IdP, Unity Catalog RBAC, BI-tool workspace permissions, and AI-service policies — it does **not** replace them. The org's controls are the load-bearing fences; PulsePlay's job is sanitization, scoping, audit, and embed-token issuance on the orchestration plane.

**Verdict:** Acceptable for internal-org pilots once the production-hardening checklist (§ 9) is ticked. Not yet appropriate for public-facing or regulated workloads — see § 8 for the open gaps.

---

## 1. Identity & Authentication Flows

PulsePlay supports **eight backend identity paths** (multi-AI × multi-BI). Each routes credentials predictably:

| Path | Credential | Lives | Blast radius if leaked |
|---|---|---|---|
| **Power BI secure embed preview** | User's Power BI web session | Power BI iframe/browser session | The user's own PBI access; preview-only, no SDK control |
| **Power BI SSO** (AAD User-Owns-Data) | AAD access token | Browser MSAL sessionStorage | The user's own PBI access (no escalation) |
| **Power BI Service Principal** | AAD client secret | Proxy vault-managed env var | All PBI reports in SP's workspace |
| **Power BI manual paste** | Embed token | Browser memory | Single report, 1-hour TTL |
| **Databricks PAT direct** | User PAT | Browser localStorage / form field | User's full workspace access |
| **Databricks PAT via proxy** | User PAT | Proxy config or env var | Same as above; server-side blast only |
| **Databricks OAuth M2M (OBO)** | SP client secret | Proxy vault | SP's scoped Databricks access |
| **Azure OpenAI / Bedrock / Foundation** | Cloud API key | Proxy vault | Single AI endpoint |
| **Shared-key (X-Genie-Key)** | Random secret | Proxy vault | Ability to invoke proxy (no user context) |

### 1.1 Power BI SSO (preferred for production)

- **Pattern:** "Embed for your organization" — MSAL.js silently issues an AAD access token in the viewer's browser; powerbi-client embeds with `tokenType: TokenType.Aad`. Power BI applies the viewer's own row-level security.
- **Implementation:** [playground/src/lib/pbiAuth.ts](../playground/src/lib/pbiAuth.ts), [playground/src/components/EmbedConfigForm.tsx](../playground/src/components/EmbedConfigForm.tsx)
- **Per Microsoft docs:** [Embed for your organization](https://learn.microsoft.com/en-us/power-bi/developer/embedded/embed-organization-app)
- **Risk:** LOW. AAD redirects, scopes (`Report.Read.All`), and token rotation are all enforced by Microsoft. No proxy round-trip.
- **Token cache:** `sessionStorage` (cleared on tab close — narrower blast radius than localStorage).

### 1.1a Power BI secure embed quick-preview

- **Pattern:** Author pastes the Power BI portal's "securely embed in a website or portal" URL or iframe. PulsePlay mounts it as a sandboxed iframe.
- **Implementation:** [playground/src/components/EmbedConfigForm.tsx](../playground/src/components/EmbedConfigForm.tsx), [bi-adapters/powerbi/index.ts](../bi-adapters/powerbi/index.ts)
- **Risk:** LOW for preview when report/workspace permissions are already correct. PulsePlay does not see an embed token or AAD secret.
- **Limitation:** Preview-only. AI-applied filters, page navigation, rich event capture, and future export flows require SSO or service-principal embed-token mode.

### 1.2 Power BI Service Principal (proxy-issued embed tokens)

- **Pattern:** "Embed for your customers" — proxy holds an AAD SP, mints embed tokens via `client_credentials` grant.
- **Implementation:** [proxy/server.js:2317](../proxy/server.js#L2317)
- **Token caching:** Per `(profile, reportId, accessLevel)` with TTL = expiry − 60s buffer; LRU eviction at 500 entries.
- **Single-flight:** Concurrent requests for the same key share one AAD round-trip and one GenerateToken round-trip.
- **Token redaction in logs:** [`_redactForEmbedTokenLog`](../proxy/server.js#L2215) strips `eyJ…` JWT pattern and Databricks `dapi…` patterns.
- **Risk:** MEDIUM. SP secret IS a production secret; must be vault-managed (Azure Key Vault / HashiCorp Vault), not in `proxy/config.json`. Documented in § 9.

### 1.3 Databricks Direct mode

- **Pattern:** Browser → Databricks Genie REST with a user PAT. PAT lives in the visual settings (PBIX property bag) or form field.
- **Risk:** **HIGH** in production. PAT in plaintext + sharable .pbix = credential leak waiting to happen.
- **Mitigation:** UI hint flags Direct as "dev / lab only"; production must disable it via `PROXY_INLINE_CREDENTIALS_MODE=off`.

### 1.4 Databricks OAuth On-Behalf-Of (M2M)

- **Pattern:** Proxy uses an Azure AD SP to obtain tokens; each user's identity flows via the embed-token `identities` parameter.
- **Implementation:** [proxy/server.js — `resolveDatabricksOAuthToken`](../proxy/server.js)
- **Token cache:** Per `(host, clientId)`; refreshed at 90% TTL (5-min early-refresh buffer); single-flighted.
- **Risk:** LOW. SP credentials vault-managed; cache prevents thundering-herd token acquisition.

### 1.5 Tableau / Qlik / Looker (future)

- All planned vendor adapters follow the same **server-side embed-token issuance** pattern as Power BI SP. No vendor credentials ever in the browser. Currently stubs that extend `GenericIframeAdapter` per [bi-adapters](../bi-adapters/).

---

## 2. Token Hygiene

| Concern | Implementation | Status |
|---|---|---|
| **Storage location** | AAD: MSAL sessionStorage; PATs: server-side env vars; embed tokens: browser memory + proxy LRU | ✅ Tiered |
| **Rotation buffer** | AAD M2M: 5 min before expiry; Embed: 60 s before expiry | ✅ Refresh-ahead |
| **Log redaction** | Regex `eyJ[A-Za-z0-9_\-]+\.[…]\.[…]` + `dapi[a-f0-9]{16,}` | ✅ Enforced at boundary |
| **Cache key** | Profile + resource ID + access level; **secret NEVER in key** | ✅ |
| **Single-flight** | Concurrent requests for same key share one upstream round-trip | ✅ |
| **Header strip on error** | Error responses don't echo Authorization back to browser | ✅ |

All token-handling code paths verified against [proxy/server.js](../proxy/server.js) §§ 2200–2500.

---

## 3. Network Boundaries

### 3.1 CORS

**Current:** `Access-Control-Allow-Origin: *` (development default).
**Risk:** MEDIUM in production — any origin can invoke the proxy.
**Fix (queued):** Add `PROXY_CORS_ORIGIN` env var; pin to playground origin; refuse `*` when `NODE_ENV=production`.

### 3.2 Content-Security-Policy

**Current:** No CSP headers set.
**Risk:** MEDIUM — no constraint on inline scripts or external frame loads.
**Fix (queued):** CSP middleware in proxy + playground:
- Proxy: `default-src 'none'` (it only serves JSON).
- Playground: `default-src 'self'; script-src 'self' 'nonce-…'; frame-src 'self' https://app.powerbi.com https://<approved-tableau-host>; …`

### 3.3 Iframe sandbox per-vendor

| Vendor | Default sandbox | Risk |
|---|---|---|
| generic-iframe | `allow-scripts allow-same-origin allow-forms allow-popups` | MEDIUM (loose-but-safe default; deployer narrows per-mount) |
| Power BI | Inherits generic; SDK manages its own iframe | LOW |
| Tableau | `allow-scripts allow-same-origin` (narrowed in cycle, [bi-adapters/tableau/index.ts](../bi-adapters/tableau/index.ts)) | LOW |
| Qlik | `allow-scripts allow-same-origin` | LOW |
| Looker | `allow-scripts allow-same-origin` | LOW |

`cfg.sandbox` per-mount override always wins, so deployments needing wider permissions (drill-out popups, share dialogs) can opt in.

### 3.4 Network bind

- **Proxy:** Dual-binds `127.0.0.1` + `::1` (ADR-0002 rationale). Databricks Apps mode listens on `0.0.0.0` for containerized deploys.
- **Vite dev server:** Explicit IPv4 `127.0.0.1` per ADR-0002.

---

## 4. Authorization & Governance

Critical distinction: **prompt-layer ≠ query-layer.**

| Control | File | Layer | Enforcement strength |
|---|---|---|---|
| `runtimeForbiddenColumns` | [settings.ts](../playground/src/pulse/settings.ts) | Prompt | **Advisory** — adversarial prompts can override |
| `runtimeMandatoryRowFilter` | settings.ts | Prompt | **Advisory** |
| `sqlCtePreamble` | settings.ts | Prompt + proxy SQL-prefix | **Strong** if proxy prepends before send |
| `sqlForbiddenTables` | settings.ts + `proxy/lib/sqlExecutor.js` | Query | **Strong** — proxy regex blocklist |
| `runtimeReadOnlyEnforced` | settings.ts + proxy DML_RE | Query | **Strong** + warehouse RBAC required |
| `sqlRlsHintEnabled` | settings.ts | Optimizer hint | **Optimizer-only** — UC row filters are the real boundary |
| `ucRowFiltersEnforced` | settings.ts (declaration) | Data layer (UC) | **Strong** — enforced by Databricks Unity Catalog |
| `ucColumnMasksEnforced` | settings.ts (declaration) | Data layer (UC) | **Strong** — enforced by Databricks Unity Catalog |

**Board point:** Prompt-layer controls are UX guardrails. **Unity Catalog row filters + column masks are the load-bearing controls.** PulsePlay declares its compliance with UC policies; UC enforces them at query time regardless.

---

## 5. Audit & Traceability

### 5.1 Proxy audit log

[`auditLog`](../proxy/server.js) emits one JSON line per AI request with:

- `ts` (ISO-8601), `ip`, `ua` (truncated), `requestId` (X-Request-Id, cycle 28)
- `action` (route name), `route` (method + path), `status`
- `profile`, `spaceId`, `detail` (error message or extra context)
- `spIdentityHash` (SHA-256 of SP client ID — never the raw secret)
- `inlineCredsUsed`, `inlineCredsMode`, `inlineCredsFields` (forensics for shared-credential overrides)

**Production:** pipe to org SIEM (syslog / fluentd / Splunk forwarder).

### 5.2 Request ID threading

Every request gets a unique `X-Request-Id`:
- Echoed back in response headers
- Logged in proxy audit log
- Recorded in visual session log
- Forwarded to Databricks SQL warehouse

Allows cross-system correlation: visual log → proxy audit → Databricks query log on a single ID.

### 5.3 Visual session log

[`logSession`](../playground/src/pulse/visual.tsx) captures:
- AI request submission + result outcomes
- Setup-tab Check Connection / Test Question outcomes (cycle of `f678a4c`)
- Window-level uncaught exceptions + unhandled promise rejections (cycle of `f678a4c`)

Surfaces in Pulse's Developer Tools modal → Session Log tab. Copy-to-clipboard for support cases.

---

## 6. Data Privacy & PII

### 6.1 `sendContextToGenie` toggle

When ON (default), bound dimensions / measures / active filters from the active BI surface are appended to every prompt.

**Risk:** MEDIUM. Chart labels containing customer names or other PII flow upstream.
**Fix (queued):** Add `sanitizeContextPayload` pass that strips common PII regex patterns (emails, phone, SSN) before injection. Pack authors must NOT include PII in domain guidance / example SQLs.

### 6.2 Pack-context injection (cycle C)

Proxy wraps user messages with vertical-pack vocabulary ([proxy/server.js](../proxy/server.js)). Packs are curated content; review process must verify no PII in `domainGuidance` or example SQLs.

### 6.3 Smart Connect probe

Probe reveals table names, column names, sample values to the browser via `/assistant/probe`. **Column names that ARE PII** (e.g. `customer_email_field`) appear in browser memory and AI prompts.

**Fix (queued):** Implement column-name redaction on probe results when `runtimeForbiddenColumns` overlaps the schema; mask sensitive names to opaque placeholders like `IDENTITY_FIELD_1`.

### 6.4 Browser storage

| Key | Type | Contents | Risk |
|---|---|---|---|
| MSAL cache | sessionStorage | AAD tokens | LOW (auto-clears on tab close) |
| `pulseplay:visual-settings:genieSettings` | localStorage | Proxy URL, profile name, workspace URL | LOW (no secrets if proxy mode) |
| `pulseplay:pack-selection` | localStorage | Active pack / sub-vertical name | LOW (no data, just labels) |
| `pulseplay:pbi-sso-config` | localStorage | AAD app client ID + tenant ID | LOW (client ID is not a secret; tenant is not a secret) |
| `pulseplay:split:horizontal/vertical` | localStorage | Pane size ratios | NONE |
| `pulseplay:bi-tile-mode` | localStorage | `1` / `2` / `4` | NONE |
| `pulseplay:ui-mode`, `enabled-components`, `layout-mode` | localStorage | UI prefs | NONE |
| Insights cache | localStorage / IndexedDB | AI responses cached for TTL | MEDIUM if responses contain PII; cache TTL configurable |

**Direct-mode warning:** If the user chooses Direct mode for Databricks, the PAT lands in genieSettings. Documented; production must disable Direct mode via `PROXY_INLINE_CREDENTIALS_MODE=off`.

---

## 7. Trust-Boundary Diagram

```
┌──────────────────────────────────────────────────────────────┐
│ Browser — authenticated user                                 │
│ • IdP session cookie (org SSO)                               │
│ • Holds NO vendor secrets                                    │
│ • MSAL sessionStorage (AAD token, ephemeral)                 │
│ • localStorage: pane prefs, profile name, pack name          │
└──────────────────────────────────────────────────────────────┘
                      ↓ HTTPS
                      ↓ Optional X-Genie-Key, X-Request-Id
┌──────────────────────────────────────────────────────────────┐
│ PulsePlay Proxy — org-internal host                          │
│ • Validates IdP session (planned, § 8.1)                     │
│ • Rate-limits per IP (120 / min)                             │
│ • Vault-managed SP secrets / OAuth credentials               │
│ • Issues short-lived embed tokens (Power BI; vendor-extensible)│
│ • Pack-context injection                                     │
│ • DML blocklist on returned SQL                              │
│ • Token redaction in logs                                    │
│ • Audit log → org SIEM                                       │
└──────────────────────────────────────────────────────────────┘
            ↓ HTTPS + Service Principal / OAuth M2M
            ↓ or Managed Identity
┌──────────────────────────────────────────────────────────────┐
│ Org-managed backends — LOAD-BEARING SECURITY FENCES          │
│ • Unity Catalog: row filters + column masks (THE BOUNDARY)   │
│ • Power BI workspace RBAC                                    │
│ • Databricks Genie / Mosaic / Foundation Model policies      │
│ • Tableau / Qlik / Looker workspace RBAC                     │
│ • IdP — user provisioning / deprovisioning / MFA / SCIM      │
│ • Audit logs at every layer                                  │
└──────────────────────────────────────────────────────────────┘
```

---

## 8. Open Gaps (honest)

Tracker — updated 2026-05-11 evening. **4 of 8 gaps closed this session.**

| # | Severity | Status | Gap | Mitigation |
|---|---|---|---|---|
| 8.1 | ~~HIGH~~ | ✅ **CLOSED** (`9c9a160`) | No IdP session validation middleware in proxy | JWT verification via `jose` against `PROXY_IDP_JWKS_URL`. Fail-open in dev, fail-closed when `PROXY_IDP_REQUIRED=true` in production. `req.user` claims flow into the audit log automatically. Coexists with shared-key (either auth method satisfies). |
| 8.2 | ~~MEDIUM~~ | ✅ **CLOSED** (`f15e16e`) | CORS `*` permissive | `PROXY_CORS_ORIGIN` comma-separated allowlist; production refuses to start with `*`. Vary:Origin so caches don't pin wrong matches. |
| 8.3 | ~~MEDIUM~~ | ✅ **CLOSED** (`f15e16e`) | No CSP headers | Strict CSP on every proxy response (`default-src 'none'`, `frame-ancestors 'none'`). Playground `index.html` meta CSP with vendor-origin allowlist for `frame-src` (PBI / Tableau / Qlik / Looker) and `connect-src` (proxy + AAD + Graph + PBI REST). |
| 8.4 | ~~MEDIUM~~ | ✅ **CLOSED** (`f15e16e`) | `sendContextToGenie` doesn't sanitize PII in chart labels | `lib/piiRedact.ts` regex pass over filter / dimension / selection values inside `buildCategoricalFromBIEvents`. Patterns: email, US SSN, IBAN, credit-card-shape, phone, API-key-shape. 14 unit tests lock the behaviour in. |
| 8.5 | MEDIUM | OPEN | Per-user rate limit absent (per-IP only at 120/min) | Now unblocked since 8.1 closed — `req.user.sub` is the natural key. Queued. |
| 8.6 | MEDIUM | OPEN | Embed-token cache miss-rate not alerted | Add `embed_token_cache_hits/misses` metric in `_powerBiTokenCache`. Separate ops cycle. |
| 8.7 | LOW | OPEN | No replay protection (nonces / timestamps) | Out of scope for v1 (idempotent requests). |
| 8.8 | LOW | OPEN | No CSRF protection | N/A — proxy is stateless and uses explicit headers, not cookies. |

---

## 9. Production Hardening Checklist

**Tick before any non-laptop pilot:**

### Proxy host
- [ ] `PROXY_INLINE_CREDENTIALS_MODE=off`
- [ ] `PROXY_SHARED_KEY` set to 32+ char random vault value
- [ ] All credentials (SP secret, Azure OpenAI key, Bedrock keys) in vault, referenced via env vars
- [ ] Managed identity assigned to proxy with least-privilege vault read role
- [ ] `PROXY_CORS_ORIGIN` pinned to playground deployment origin
- [ ] CSP `frame-src` set to org-approved BI vendor origins
- [ ] Egress allowlist enforced at network layer
- [ ] TLS 1.2+ enforced
- [ ] `NODE_EXTRA_CA_CERTS` set if org uses TLS-MITM proxy
- [ ] Logs piped to org SIEM
- [ ] Audit log monitored for `inlineCredsUsed:true` (should always be zero in production)

### Identity & authorization
- [ ] SSO wired (JWT or SAML validation in proxy)
- [ ] MFA enforced at IdP
- [ ] SCIM provisioning configured
- [ ] App-level user group exists and gates access
- [ ] Per-profile authorization rules defined server-side
- [ ] No PATs in production — OAuth M2M with rotation only

### Data layer
- [ ] Unity Catalog row/column policy reviewed for catalogs PulsePlay queries
- [ ] Genie space access matches user-group access
- [ ] BI workspace permissions reviewed for embedded reports
- [ ] Sensitive columns have UC column masks applied

### BI embeds
- [ ] Embed-token endpoints per vendor implemented + scoped to user + report + TTL
- [ ] Sandbox attributes per-adapter narrowed where vendor permits
- [ ] Approved vendor-origin allowlist published in CSP

### AI
- [ ] Prompt-injection defenses reviewed (sanitization + validator framework)
- [ ] BI event payload sanitization applied before prompt injection
- [ ] Validator framework configured for AI output format
- [ ] AI is NOT granted tool permission for write-back, export, or refresh in v1

---

## 10. Closing

PulsePlay is acceptable for **internal-org pilots** with this checklist applied. It is **not yet** appropriate for public-facing, multi-tenant, or regulated workloads — the path to those (multi-tenant isolation, full ISO/EU AI-Act compliance, conformance harness) is deferred to [PUBLIC_OSS_AGENDA.md](PUBLIC_OSS_AGENDA.md).

**For a security review board:** present this document as evidence that PulsePlay (a) has a clear threat model (internal-org behind IdP), (b) delegates load-bearing controls to the data layer (Unity Catalog + BI RBAC), (c) implements defense-in-depth on the orchestration plane, and (d) tracks its own open gaps honestly with mitigation plans.
