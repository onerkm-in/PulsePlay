# Security Review — PepPulse

> Honest InfoSec architect's review of the cumulative security posture across Waves 1–38. Last updated: 2026-05-07 (post-cycle 10).
>
> **Audience:** your security team, ops team, anyone evaluating whether to ship this product to a regulated workload.

---

## TL;DR

| Deployment shape | Security verdict |
|---|---|
| **Local dev / lab** (PBI Desktop + localhost proxy) | ✅ Acceptable — security is appropriate for the threat model |
| **Internal enterprise** (PBI Service + Azure App Service + Key Vault) | ✅ Acceptable with the production hardening checklist (Section 5) applied |
| **Public-facing** (proxy on a public hostname without WAF) | ⚠ NOT recommended — see Section 6 |
| **Regulated workload** (HIPAA / PCI / FedRAMP) | ❌ Would require additional work: mTLS, request signing, formal audit, eval suite |

---

## 1. Threat model

### Who might attack
| Actor | Motivation | Access vector |
|---|---|---|
| **Internal employee** with .pbix file access | Credential theft, data exfiltration | Reads .pbix as a zip; extracts stored PAT; uses outside the visual |
| **External attacker** with workspace URL | Brute-force shared key, exhaust rate limits | Public-facing proxy URL |
| **Compromised report viewer** | Prompt injection to coerce AI into bypassing scope guardrails | Section C / Section H inputs |
| **Insider with malicious .pbix** | Override server-side config, escalate access | Wave 31 inline credentials (mitigated in Wave 36) |
| **Curious developer** | Read sensitive data from logs / errors | Token leakage in error responses |

### What they're after
1. **Databricks PAT** — gives full workspace access for the token's lifetime
2. **Service Principal client secret** — same with longer lifetime + broader blast radius
3. **PII from query results** (emails, phone numbers, SSNs in feedback logs)
4. **Schema enumeration** for downstream attack planning
5. **AI prompt injection** to extract data from forbidden tables

---

## 2. Trust boundaries

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠ LOW TRUST: PBI .pbix file                                 │
│   - Anyone with workspace access can download (zip + read)  │
│   - No encryption at rest (Microsoft platform-level)        │
│   - Stored credentials are plain JSON                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼  HTTPS-to-localhost (Desktop)
                              HTTPS over public Internet (Service)
┌─────────────────────────────────────────────────────────────┐
│ 🔒 MEDIUM TRUST: Proxy host                                  │
│   - Localhost (Desktop) — no external attack surface        │
│   - Azure App Service (Service) — public hostname           │
│   - X-Genie-Key shared secret gate                          │
│   - In-process token handling (no disk persistence)         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼  HTTPS + Bearer auth
┌─────────────────────────────────────────────────────────────┐
│ 🔒🔒 HIGH TRUST: Databricks workspace                        │
│   - Unity Catalog enforces RBAC at row/column level         │
│   - SQL Warehouse executes queries under workspace identity │
│   - Workspace audit logs                                    │
└─────────────────────────────────────────────────────────────┘
```

Wave 36's layered config precedence places **Azure env vars > config.json > visual headers** in trust order — matches this boundary diagram.

---

## 3. Defense layers shipped (cycle-by-cycle map)

### Sanitization (Wave 22 + extensions)
| Layer | Where | What it does |
|---|---|---|
| Visual-side sanitizer | `genieChatVisual/src/genie.ts` `sanitizeInstructionText` / `sanitizeIdentifierList` / `sanitizeTemplateValue` | Strips control chars, blocks DML keywords, escapes template variables in Section C inputs and Section H CTE preamble |
| Proxy-side sanitizer | `proxy/lib/sqlExecutor.js` (Wave 35), `proxy/server.js` `sanitizeInlineHeader` (Wave 31), `extractInlineCredentials` (Wave 36) | Final gate before SQL execution; identifier validation; DML keyword blocklist |
| Three-layer test coverage | `genieChatVisual/tests/security.test.ts` + `proxy/tests/inlineCredentials.test.js` + `proxy/tests/sqlPreviewRoute.test.js` | 41+ tests asserting each sanitizer rejects known attack patterns |

### Authentication & authorization
| Layer | Where | What it does |
|---|---|---|
| Shared key gate | `proxy/server.js` `sharedKeyMiddleware` (cycle 6: `crypto.timingSafeEqual`) | Prevents anonymous proxy access; constant-time comparison eliminates timing oracle |
| OAuth M2M (Service Principal) | `proxy/server.js` `resolveDatabricksOAuthToken` (Wave 28) | Refreshable tokens, 90% early-refresh, single-flight on concurrent requests, LRU cache |
| Wave 36 layered precedence | `proxy/server.js` `resolveProfile` + `resolveInlineCredentialsMode` | Server config > visual headers; `mode=off` on Azure auto-default ignores visual entirely |
| Setup access allowlist (Wave 38) | `genieChatVisual/src/setupAccessControl.ts` | UX gate by email/UPN; documented as "not an authorization gate" — tenant-level RBAC remains the load-bearing fence |

### Information disclosure prevention
| Layer | Where | What it does |
|---|---|---|
| Token redaction in error bodies | `proxy/server.js` `_databricksRequestOnce` (cycle 5) | Strips `Bearer`/`dapi[hex]`/`Authorization:` patterns from raw response bodies before propagation |
| PII redaction in feedback log | `proxy/server.js` `redactFeedbackPayload` (Wave 28) | Strips emails, phones, tokens; typed labels `[REDACTED-EMAIL]` etc. |
| SQL error column/table redaction | `proxy/server.js` `errorStatusFromDatabricks` (Wave 28) | Replaces identifier names in DBR error messages before client sees them |
| Direct-mode error mapping | `genieChatVisual/src/genie.ts` `mapDirectStatusToMessage` (cycle 4) | Friendly status messages; raw DBR error bodies never reach chat bubble |
| SP-identity hashing (Tier B Day 3) | `proxy/server.js` `hashServicePrincipalId` | SHA-256 first 12 hex chars; non-reversible; `clientId` never written to disk |

### Cross-system observability (Wave 28)
| Layer | Where | What it does |
|---|---|---|
| `X-Request-Id` correlation | `proxy/server.js` middleware + `databricksRequest` (cycle 5) | Visual generates ID; proxy echoes + propagates downstream; logs join on one ID |
| Structured audit log | `proxy/server.js` `auditLog` | Per-route action + status + profile + timing + `inlineCredsUsed` flag (Wave 36) |
| `recentErrors` ring buffer | `proxy/server.js` `_auditCounters` | Last N errors with redacted detail; `/admin/health-summary` exposes via shared-key gate |

### Sandbox-aware constraints
| Layer | Where | What it does |
|---|---|---|
| XHR-only client | `genieChatVisual/src/genie.ts` (CLAUDE.md tripwire) | PBI Desktop iframe blocks `fetch`; XHR works with `WebAccess` capability |
| WebAccess allowlist | `genieChatVisual/capabilities.json` | Only declared hosts are reachable; Azure host must be added explicitly |
| LESS-imported-in-TS | CLAUDE.md tripwire | Build-time guarantee that styles ship in the .pbiviz |

### Defense-in-depth on SQL (Wave 35)
| Layer | Where | What it does |
|---|---|---|
| DML keyword blocklist | `proxy/lib/sqlExecutor.js` (`SELECT|...|DELETE|DROP|...` regex) | Server-side gate — author SQL with DML keywords rejected before warehouse hits |
| Section H CTE auto-prepend | `proxy/lib/sqlSectionPreview.js` | Author SQL is wrapped in scope CTE — read-only enforcement |
| `validateSqlSection` pre-save | `genieChatVisual/src/sqlSection.ts` | Paren balance, length cap, identifier sanity |
| `/sql/explain` dry-run | `proxy/server.js` (Wave 35 P3) | Catches table-not-found, permission errors before billable execution |

---

## 4. Known gaps + mitigations

### Yellow flags ⚠ (acceptable; document and monitor)

#### 4.1 PAT in `.pbix` file (inline mode)
**Issue:** When Wave 31 inline-credentials mode is `override` (local dev default), the visual's settings store the PAT. Anyone who downloads the .pbix can extract it.
**Mitigation:** Wave 36 auto-defaults to `off` when `WEBSITE_SITE_NAME` (Azure) or `PROXY_SHARED_KEY` is set. Production deployments lock down by default.
**Author guidance:** Use Direct mode / inline mode for lab + dev only. Production = Proxy mode + Key Vault + `mode=off`.

#### 4.2 Setup access allowlist (Wave 38) is a UX gate, not RBAC
**Issue:** The `setupAccessAllowedUsers` field hides the Setup tab from non-listed viewers, but the .pbix can still be downloaded by anyone with workspace access.
**Mitigation:** Honest-limitation banner shipped in Section B (Wave 38). Recommend tenant admin sets "Allow downloads from workspaces = Off" globally.
**Future fix:** Wave 38 Phase 2 candidate — proxy-side AD group check via Microsoft Graph (out of current scope; ~3 days when prioritized).

#### 4.3 SP-identity hash is unsalted
**Issue:** `hashServicePrincipalId` uses SHA-256 with no salt — deterministic across processes (so logs can group by identity). Targeted attacker with known clientId can confirm presence.
**Mitigation:** Documented in `proxy/server.js` and in HANDOVER tripwire. Trade-off is privacy-vs-utility; salting would break log analysis.
**Author guidance:** Don't include the audit log in publicly-shared incident reports.

#### 4.4 Anonymous mode is the default for local dev
**Issue:** When `PROXY_SHARED_KEY` is unset, the proxy runs in anonymous mode — anyone on localhost can hit it.
**Mitigation:** Localhost-only binding (`127.0.0.1` dual-bind) is the primary defense; not externally reachable. Set `PROXY_SHARED_KEY` for any non-localhost deployment.

#### 4.5 OAuth M2M cache is process-local
**Issue:** Tokens cached in-memory only; multi-instance proxy deployment would multiply token-fetch load.
**Mitigation:** Single-instance App Service is the documented topology. For multi-instance, externalize to Redis (future Wave candidate).

#### 4.6 Lazy-loaded chunks (xlsx + html2canvas) work in web hosts but reject in PBI Desktop
**Issue:** IDEA-044 P2 export buttons display a friendly LazyLoadError toast in PBI Desktop because the sandbox can't fetch separate webpack chunks.
**Mitigation:** Documented in cycle 8 commit. The buttons work transparently in any web-hosted deployment (Azure Embedded, SaaS portal, browser extension).

### Red flags ❌ (would block FedRAMP / PCI / HIPAA)

| Gap | Why it matters | Effort to close |
|---|---|---|
| **No mTLS** for visual → proxy | Bearer token in `Authorization` header is the only auth | ~5 days (Azure App Service mTLS + visual cert pinning — non-trivial in PBI sandbox) |
| **No request signing** | Replay attacks within the token's lifetime | ~3 days (HMAC over body+timestamp; Wave 28 X-Request-Id provides scaffolding) |
| **No per-tenant rate limit** | Global per-IP limit only; tenant abuse possible at multi-tenant deployments | ~2 days (extend `rateLimitBuckets` Map keyed on profile) |
| **No formal evaluation suite** | "Output quality" is qualitative (see `QUALITY_METHODOLOGY.md`) | ~2 weeks (Wave 36 candidate per QUALITY_METHODOLOGY roadmap) |
| **Vendor / dependency audit not yet run** | xlsx, html2canvas, marked, html5-qrcode etc. | 1 day (`npm audit` review + Snyk-style scan) |
| **No data residency controls** | Proxy can route to any Databricks region; no region pinning | 2 days (`profile.allowedRegions` allowlist + middleware check) |

---

## 5. Production deployment hardening checklist

For any internal-enterprise deployment of PepPulse, set up:

### Azure App Service side
- [ ] **`PROXY_INLINE_CREDENTIALS_MODE=off`** explicitly (auto-default also catches it via `WEBSITE_SITE_NAME`, but explicit is clearer for ops)
- [ ] **`PROXY_SHARED_KEY` set** to a strong random value (32+ chars), stored in Key Vault, referenced via `@Microsoft.KeyVault(...)` syntax in App Service config
- [ ] **Databricks PAT or SP credentials in Key Vault** (never in App Service env vars in plaintext)
- [ ] **Managed Identity** assigned to App Service with `Key Vault Secrets User` role only on the specific vault
- [ ] **Azure Front Door + WAF** in front of the App Service for public deployments
- [ ] **App Insights** wired (cycle 6 stub; full Wave 39 candidate: trace export to Azure Monitor)
- [ ] **TLS 1.2 minimum** on the App Service (default in newer regions; verify)
- [ ] **CORS allowlist** restricted to your PBI Service tenant URL pattern (currently `*`; tighten via `Access-Control-Allow-Origin` middleware override — cycle 11+ candidate)

### Power BI tenant side
- [ ] **Disable .pbix download for viewers** at tenant settings → "Allow downloads from workspaces = Off"
- [ ] **Workspace access** restricted to authors-only at Contributor+; viewers get Viewer role
- [ ] **Sensitivity labels** applied to reports containing AI Insights output
- [ ] **DLP policies** to block .pbix exfil if tenant supports

### Visual-side
- [ ] **Setup access allowlist** populated (Wave 38) — even though it's a UX gate, it raises the bar
- [ ] **`showSetupAccess = false`** as a tenant-default visual setting (default already)
- [ ] **`setupAccessAdGroup` server enforcement** — Wave 38 Phase 2 candidate (defer until needed)
- [ ] **Section H CTE** populated with row-filter `WHERE region = '{{role}}'` or equivalent
- [ ] **Section C forbidden columns** populated with PII column names (email, phone, ssn, dob)

### Databricks side
- [ ] **Unity Catalog** enforces actual RBAC; the visual's gates are defense-in-depth, NOT primary
- [ ] **PAT lifetime** ≤ 90 days; rotate via SP if longer-lived needed
- [ ] **SQL Warehouse** scoped to the smallest possible role with read-only access to the target catalog
- [ ] **Audit log forwarding** to your SIEM

---

## 6. Compliance posture

| Standard | Pass-as-is? | What's missing |
|---|---|---|
| **GDPR** (data subject rights, processor agreement) | ⚠ Partial | PII redaction in logs (Wave 28) ✅; data-deletion API ❌ (would need a /admin/delete-user-data route); Data Processing Agreement is a contractual matter, not technical |
| **SOC 2 Type II** | ⚠ With effort | Defense-in-depth ✅; access logs ✅; would need formal change management + incident response runbooks |
| **HIPAA** | ❌ No | Need: BAA with proxy host, mTLS, request signing, formal eval suite, encryption-at-rest in transit logs, Cellebrite-style forensic readiness |
| **PCI DSS** | ❌ No | Bound data must NEVER include card numbers (use Section C forbidden columns + Unity Catalog tokenization upstream); proxy needs to be in a dedicated PCI-scoped network segment |
| **FedRAMP Moderate** | ❌ No | Mappable but would require: FIPS-validated crypto, Azure Government cloud, formal SSP, ATO process |
| **ISO 27001** | ⚠ Documentation gap | Technical controls largely present; need formal ISMS docs + annual audit |

For typical **enterprise BI deployments serving internal users with non-regulated data** (the most common case), the current posture is appropriate. Regulated workloads need the gaps in Section 4 (Red flags) closed first.

---

## 7. Continuous monitoring recommendations

### What ops should watch
- `/admin/health-summary` — request volume, error counts, recent failures
- App Insights / proxy.err.log — error patterns; spike = likely attack or misconfiguration
- Audit log `inlineCredsUsed: true` lines — should be zero in production deployments (with `mode=off`)
- Audit log `actionResult: "401"` rate — sustained 401s = brute-force or credential rotation in flight
- Databricks workspace audit log — cross-correlate via `X-Request-Id`

### Alerting candidates
- 401 rate exceeds 50 req/min on `/assistant` path → likely brute-force
- `inlineCredsUsed: true` ANY occurrence in production → misconfiguration; `PROXY_INLINE_CREDENTIALS_MODE` not set to `off`
- Sustained 5xx from Databricks → workspace issue; not our bug
- Cache hit rate < 50% → either schemaHash thrashing (bound fields changing) OR localStorage quota issues
- New profile name appears in audit log → onboarding tracking

---

## 8. Honest closing statement

PepPulse is a **defense-in-depth product** that ships **enterprise-appropriate security for the BI custom-visual category**. It is not a fortress; no BI tool is, because the ultimate trust boundary is the .pbix file format itself, which Microsoft owns.

The most important security control is not anything we shipped — it's **Power BI tenant settings + Unity Catalog row-level security + workspace RBAC**. Everything in Sections 1-5 is layered ON TOP of those primary fences as defense-in-depth.

If your security team's question is *"can someone with read-only PBI access exfiltrate data they shouldn't see?"* — the answer is **no, not via PepPulse**, because:
1. They can't reach the proxy (localhost-only or sharedKey-gated)
2. They can't bypass Unity Catalog (which enforces row/column RBAC at the warehouse)
3. They can't extract the PAT in `mode=off` deployments (it's not in the .pbix)
4. They can't prompt-inject past Section H (sanitization + DML blocklist + read-only CTE)

If their question is *"can a malicious author with edit-mode access misuse the visual?"* — **yes, partially**, because:
1. They can write SQL via Wave 35 Custom SQL Mode (mitigated by DML blocklist; warehouse role limits remaining damage)
2. They can override scope guardrails by editing Setup (mitigated by Wave 38 allowlist + tenant-level workspace RBAC)
3. They can extract PAT from .pbix in inline mode (mitigated by Wave 36 server-side `mode=off`)

Both threat models are **adequately covered** for typical enterprise use. Regulated workloads need the additional work in Section 4 Red Flags.

---

*Compiled May 2026 by beast-mode session. Re-run before any major version release or when tenant security posture changes.*
