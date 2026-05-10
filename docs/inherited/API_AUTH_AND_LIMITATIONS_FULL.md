# PepPulse — API Surface, Auth Modes, and Known Limitations

> **Audience:** enterprise architects, IT/InfoSec, vendor-risk reviewers, the security person who'll ask "what does it actually call?"
>
> **Purpose:** ground-truth list of every API the proxy + visual will hit, every permission/scope you'll need to grant, what works under user-login vs service-principal, and the **honest limitations** so you can pre-empt every "gotcha" question.
>
> **Last reviewed:** 2026-05-09 (post-cycle 42, commit `198d9c1`).
>
> **How to use:** hand sections 1-3 to your IT team to enable APIs. Hand section 4 to InfoSec for the auth review. Hand section 5 to anyone who'll be on stage.

---

## Table of contents

1. **APIs the proxy calls — exhaustive list (5 backends)**
2. **Permissions / scopes / network requirements**
3. **OAuth Service Principal setup (production-grade)**
4. **User identity propagation — the honest answer**
5. **Known limitations — categorized, no marketing spin**

---

## 1. APIs the proxy calls — exhaustive list

The visual itself **only calls the proxy** (`http://127.0.0.1:8787` or your Azure App Service URL). The **proxy** is what calls the AI backends. Here's the complete list of upstream endpoints, scoped per backend.

### 1.1 Databricks Genie (Connection mode: `proxy` or `direct`)

| HTTP | Endpoint | Used by | Frequency |
|---|---|---|---|
| GET | `https://<workspace>/api/2.0/genie/spaces/{spaceId}` | Test connection, capabilities check | Once per setup, once per profile change |
| POST | `https://<workspace>/api/2.0/genie/spaces/{spaceId}/start-conversation` | Each new question (Chat) or each stage (Insights) | 1-7 per Insights run, 1 per Chat question |
| POST | `https://<workspace>/api/2.0/genie/spaces/{spaceId}/conversations/{convId}/messages` | Follow-up turns in same conversation | Per follow-up |
| GET | `https://<workspace>/api/2.0/genie/spaces/{spaceId}/conversations/{convId}/messages/{msgId}` | Polling for completion | Every 1-3s until COMPLETED/FAILED |
| GET | `https://<workspace>/api/2.0/genie/spaces/{spaceId}/conversations/{convId}/messages/{msgId}/query-result` | Direct mode SQL result enrichment | When status=COMPLETED + query attachment present |
| GET | `https://<workspace>/api/2.0/sql/warehouses/{warehouseId}` | Warehouse status check (display the green/red badge) | Once per setup, once per visual mount |
| POST | `https://<workspace>/api/2.0/sql/warehouses/{warehouseId}/start` | Warm a sleeping warehouse | When warehouse is STOPPED + author triggers run |
| POST | `https://<workspace>/api/2.0/sql/statements` | Wave 35 Custom SQL section execution | Per author-defined SQL section per Insights run |
| GET | `https://<workspace>/api/2.0/sql/statements/{statementId}` | Polling for Custom SQL completion | Every 1-2s until SUCCEEDED/FAILED |
| GET | `https://<workspace>/api/2.0/sql/history/queries` | **Cycle 40** — Genie Query Audit panel (Setup → Developer Tools) | On-demand only when author opens the panel |
| POST | `https://<workspace>/oidc/v1/token` | OAuth M2M token refresh (only when `auth.type=oauth-m2m` configured) | Initial + every ~50min (90% of 1h token lifetime) |

**Total calls per typical 7-stage Insights run:** ~40-60 (counts include polling iterations).

### 1.2 Azure OpenAI (Connection mode: `openai`)

| HTTP | Endpoint | Used by |
|---|---|---|
| POST | `https://{your-resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=2024-02-15-preview` | Each question / Insights stage (uses Anthropic Messages format adapter) |

OpenAI mode bypasses Genie entirely — runs through `proxy/lib/llmOrchestrator.js` which adapts to OpenAI's chat-completions format.

### 1.3 AWS Bedrock (Connection mode: `bedrock`)

| HTTP | Endpoint | Used by |
|---|---|---|
| POST | `https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/invoke` | InvokeModel path (Anthropic Messages format) |
| POST | `https://bedrock-agent-runtime.{region}.amazonaws.com/knowledge-bases/{kbId}/retrieve-and-generate` | RetrieveAndGenerate path (RAG over Knowledge Base) |

All requests signed with **AWS Signature Version 4** using `crypto` module (no AWS SDK dependency, smaller proxy footprint).

### 1.4 Databricks AI Gateway (Connection mode: `gateway`, **PREVIEW**)

End-to-end wiring is descriptor-only stub today. Not production-ready. Roadmap.

### 1.5 Localhost only (visual ↔ proxy)

| HTTP | Endpoint | Used by |
|---|---|---|
| GET | `http://127.0.0.1:8787/health` | Liveness probe |
| GET | `http://127.0.0.1:8787/admin/health-summary` | Diagnostics dashboard (optional, shared-key gated) |
| GET | `http://127.0.0.1:8787/admin/query-history` | Genie Queries panel (cycle 40) |
| POST | `http://127.0.0.1:8787/assistant/conversations/start` | Same as Genie start-conversation but profile-routed |
| POST | `http://127.0.0.1:8787/assistant/conversations/{id}/messages` | Same as Genie messages but profile-routed |
| GET | `http://127.0.0.1:8787/assistant/conversations/{id}/messages/{id}` | Same as Genie poll but profile-routed |
| GET | `http://127.0.0.1:8787/assistant/capabilities` | Capability/profile listing |
| POST | `http://127.0.0.1:8787/feedback` | Opt-in user feedback log |
| POST | `http://127.0.0.1:8787/confidence` | Per-answer confidence scoring (Tier B) |

The visual can also talk **directly** to Databricks (Direct mode) but only for dev — production deployments always route through the proxy.

---

## 2. Permissions / scopes / network requirements

### 2.1 Databricks workspace permissions

For the **Service Principal or PAT user** the proxy authenticates as, you need:

| Permission | Where to grant | Why |
|---|---|---|
| **Workspace user** | Settings → Identity & Access → Users / Service Principals | Baseline access |
| **Genie space CAN_VIEW** (or CAN_RUN) | Genie → space → Settings → Permissions | Required to ask questions |
| **SQL Warehouse CAN_USE** | SQL Warehouses → warehouse → Permissions | Required to execute generated SQL |
| **Unity Catalog SELECT on tables** | Catalog → table → Permissions | Required to read the underlying data |
| **Workspace API access** | Admin → Workspace settings → Workspace access control → Personal Access Tokens enabled | Required for PAT auth (skip if using OAuth M2M) |
| **`READ_QUERY_HISTORY` permission** (cycle 40) | Account console → Workspace assignments → Token-based access controls | Required for the `/api/2.0/sql/history/queries` endpoint used by the Genie Queries panel. If not granted → 403; panel shows error but everything else works. |

### 2.2 OAuth M2M scopes (production)

When using `auth.type: oauth-m2m`:

| Scope | Required for |
|---|---|
| `all-apis` | Default scope the proxy requests. Covers Genie + SQL + Unity Catalog. Equivalent to PAT scope. |

If your security team requires least-privilege scopes, narrower options exist but are not currently supported by the Genie API — Databricks recommends `all-apis` for application service principals as of May 2026.

### 2.3 Network outbound from proxy host

Allowlist these from your proxy host (on-prem firewall, Azure NSG, or k8s network policy):

| Destination | Port | Purpose |
|---|---|---|
| `*.cloud.databricks.com` | 443 | AWS-region Databricks workspaces |
| `*.azuredatabricks.net` | 443 | Azure-region Databricks workspaces |
| `*.databricks.com` | 443 | Generic Databricks (catch-all) |
| `accounts.cloud.databricks.com` | 443 | Account-level OAuth (if using SP from account principal) |
| `bedrock-runtime.{region}.amazonaws.com` | 443 | If Bedrock backend |
| `bedrock-agent-runtime.{region}.amazonaws.com` | 443 | If Bedrock Knowledge Base |
| `*.openai.azure.com` | 443 | If Azure OpenAI backend |

### 2.4 Network outbound from PBI Desktop / Service (visual)

The visual's `capabilities.json` declares its WebAccess allowlist (Power BI enforces this at the platform level — anything else is silently blocked):

```json
"WebAccess": [
  "https://*.cloud.databricks.com",
  "https://*.databricks.com",
  "https://*.azuredatabricks.net",
  "https://*.openai.azure.com",
  "https://*.cognitiveservices.azure.com",
  "https://*.databricksapps.com",
  "https://bedrock-runtime.*.amazonaws.com",
  "https://bedrock-agent-runtime.*.amazonaws.com",
  "https://localhost", "http://localhost",
  "http://localhost:8787", "https://localhost:8787",
  "https://127.0.0.1", "http://127.0.0.1"
]
```

If your workspace is on a non-standard host (`my-corp.databricks.gov`, an enterprise tenant), **add the host to capabilities.json + repackage the .pbiviz**. Without this, the visual literally can't reach the host even with valid credentials.

### 2.5 Proxy host outbound from corporate network

If your network uses a MITM TLS proxy (Zscaler, Bluecoat, Forcepoint, etc.), the Node process needs the corporate root CA in its trust store:

```bash
export NODE_EXTRA_CA_CERTS=/path/to/corp-ca-bundle.pem
node server.js
```

Without this you'll see `unable to verify the first certificate` errors. (This is what bit us when I tried to start the proxy from the harness's terminal vs. your VS Code terminal.)

---

## 3. OAuth Service Principal setup (production-grade)

PAT is fine for dev. **For production: use a Databricks Service Principal with OAuth M2M (client credentials).** Token rotation happens transparently; no human credential rotates manually.

### 3.1 Setup steps (one-time)

1. **Create the Service Principal.** Account console → User Management → Service Principals → Add Service Principal. Note the `applicationId`.
2. **Generate OAuth secret.** SP → OAuth Secrets → Generate Secret. Note the secret value (you only see it once).
3. **Grant workspace assignment.** Account console → Workspaces → your workspace → Permissions → add the SP as a workspace user.
4. **Grant Genie space access.** Genie space → Settings → Permissions → add the SP as CAN_VIEW or CAN_RUN.
5. **Grant SQL Warehouse access.** SQL Warehouses → warehouse → Permissions → add the SP as CAN_USE.
6. **Grant Unity Catalog SELECT on the relevant tables/views.** Catalog → table → Permissions → add the SP with SELECT.
7. **(Optional, cycle 40 only)** Grant `READ_QUERY_HISTORY` if you want the Genie Queries panel to work for this SP.

### 3.2 Configure proxy to use the SP

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

Or via env vars (recommended for Azure App Service / Key Vault integration):
```bash
export DATABRICKS_OAUTH_CLIENT_ID=<applicationId>
export DATABRICKS_OAUTH_CLIENT_SECRET=<secret>
```

### 3.3 Token rotation behavior

The proxy handles all of this transparently:
- Initial token fetch on first request: ~200-400ms added latency (cached after).
- Tokens cached in-memory (LRU-capped, never persisted to disk).
- **Single-flight protection**: concurrent requests during initial fetch share one HTTP call to `/oidc/v1/token` (no thundering herd).
- **Early refresh** at 90% of token lifetime (~54min into a 1h token). User never sees a 401.
- On 401 from Databricks, cache invalidated immediately so the next request fetches a fresh token.

### 3.4 Secret rotation

Two paths:
- **Disruption-free**: generate a NEW secret for the SP; deploy new secret to proxy; the old secret stays valid for ~1h after revocation. Zero downtime.
- **Forced rotation (compromise)**: revoke the secret in Databricks UI; update proxy config; restart. ~30s downtime if you're not running multiple proxy instances behind a load balancer.

---

## 4. User identity propagation — the honest answer

This is where reviewers will probe hardest. **Be honest. Authenticated security people can smell hand-waving.**

### 4.1 The hard truth

**PepPulse runs as a SHARED service principal.** Genie sees ALL queries originating from the SP, NOT from the actual viewer of the report. This means:

- Unity Catalog row filters tied to `current_user()` **do NOT filter per-viewer** — they all see the SP's user context.
- Databricks audit logs show the SP as the actor for every query, not the original viewer.
- Per-user data residency claims (e.g., "EU users only see EU data") via Databricks-native row-level security **do NOT work** out of the box.

This is the SAME limitation Microsoft Copilot for Power BI has, the same as ThoughtSpot embedded, the same as Tableau Pulse. The workarounds we offer are documented below.

### 4.2 Workarounds we DO support

| Workaround | What it does | When it's appropriate |
|---|---|---|
| **Section H CTE preamble with `{{userId}}` template** | Author writes a SQL CTE that scopes the data BEFORE Genie sees it. The visual interpolates the viewer's USERPRINCIPALNAME (Wave 42 binding) into the CTE. Every query Genie generates runs against the scoped CTE, not the raw table. | When you can express the row-level scope as SQL (`WHERE user_id = '{{userId}}'`). Authoritative — Genie cannot escape the CTE. |
| **USERPRINCIPALNAME measure binding (Wave 42)** | Author binds a DAX measure that returns `USERPRINCIPALNAME()` to the visual's User Role data role. The visual passes that string to the prompt + Section H CTE. | Required prerequisite for the {{userId}} interpolation above. |
| **Section C custom instructions** | Author writes natural-language instructions ("Only return data for region matching the user's email domain"). Genie tries to honor — not deterministic. | Best-effort scoping; not RBAC. Don't rely on for compliance. |
| **Forbidden-tables list** | Author specifies tables Genie MAY NOT query. Visual + proxy both enforce the blocklist. | Coarse-grained "this whole dataset is off-limits" controls. |
| **Multiple Genie spaces with different RBAC, multi-space mode** | Each Genie space has its own UC permissions. Author configures different spaces for different audience tiers. | When you can pre-segment audiences (e.g., "exec space" with all data, "rep space" with sales-team-only data) AND deploy separate reports per audience. |

### 4.3 Workarounds we DO NOT support

| Not supported | Why | What you'd need instead |
|---|---|---|
| **OAuth On-Behalf-Of (OBO)** flow with Databricks | Databricks Genie API doesn't support OBO today. SP creds OR PAT only. | Wait for Databricks to ship OBO for Genie (no public roadmap). |
| **Per-viewer Bearer token** passed through the proxy | Would require each viewer to authenticate to the proxy with their OWN token. PBI Desktop doesn't expose viewer auth tokens to custom visuals. | Microsoft would need to expose the PBI session token to custom visuals. Not on roadmap. |
| **Native Unity Catalog dynamic views with `current_user()`** | Even if your view defines `WHERE user_id = current_user()`, Genie runs as the SP, so `current_user()` always returns the SP. | Use the {{userId}} CTE workaround (4.2) — application-level scoping rather than database-level. |
| **Row-level security via PBI's RLS roles** | PBI RLS is enforced by the PBI engine at semantic-model layer. PepPulse calls Genie directly; doesn't go through the semantic model. | Pre-filter data in Genie (Section H CTE) instead. |

### 4.4 What this means for compliance

| Requirement | PepPulse default | With workarounds |
|---|---|---|
| GDPR Article 32 (per-user data segregation) | ❌ Not enforced — SP sees everything | ⚠ Possible via Section H CTE + UPN binding, but author has to write the SQL correctly |
| HIPAA per-user PHI access controls | ❌ Not enforced | ⚠ Same as above; would need formal verification of the CTE for HIPAA scope |
| SOX user-attributable audit trail | ⚠ Audit log shows SP, not viewer | ⚠ Cycle 40 Query Audit panel can correlate proxy `X-Request-Id` to Databricks query history; viewer identity captured in proxy `X-Forwarded-User` header (if you enable it) |
| Sarbanes-Oxley segregation of duties | N/A | Use multi-space mode with pre-segmented data |

**Bottom line:** PepPulse is appropriate for **internal BI on non-regulated data**. For regulated workloads, you need to do extra work AND have your compliance team formally bless the workarounds.

---

## 5. Known limitations — categorized, no marketing spin

This is the section a hostile reviewer will read first. Hand it to them. The presenter who admits limitations BEFORE being asked wins.

### 5.1 Functional limitations

| Limitation | Impact | Mitigation / roadmap |
|---|---|---|
| **PBI Desktop sandbox blocks lazy chunks** (xlsx, html2canvas) | PNG/Excel exports unavailable in PBI Desktop. CSV + Markdown still work. | Cycle 19 auto-detects + hides the broken options. PBI Service has no such restriction; works there. |
| **Genie API rate limit: 5 req/min/workspace** | Multi-stage pipelines pace at 2s inter-batch. Heavy usage pattern (10+ users hitting at once) can hit 429s. | Workspace admins can request a higher limit. We retry on 429 with exponential backoff (Wave 28). |
| **Genie cold-start: 5-15s on first call** | First Insights run after warehouse goes idle takes 30-60s longer | Use Serverless SQL Warehouse (instant). Or schedule a warm-up cron via Databricks Jobs. |
| **Multi-space limited to 9 spaces** | Hard cap in current code. | Soft limit; could be raised but UI gets cluttered past 5. |
| **Chat conversation history capped at 50 turns per space** | Old turns drop off. | localStorage limit; could externalize to proxy. Roadmap. |
| **No real-time streaming responses** | User waits 15-30s per stage; sees progress placeholder, not character-by-character generation. | Genie API doesn't support SSE/streaming. Will switch when Databricks ships. |
| **AI Insights pipeline is sequential within a stage** | Each stage waits for the previous's response before starting (except cycle 39 which parallelizes stages 0+1). | Inherent to multi-stage prompting — later stages need earlier outputs as context. |
| **Cache TTL: 30 min default for AI sections, 4h for SQL sections** | Author-tunable. After TTL, fresh pipeline run on next view. | Tune via Setup → Operations → Insights cache TTL. Custom SQL section cache is in-memory only (4h hardcoded). |
| **Custom JSON sections capped at ~10 user-defined sections** | UI gets crowded; pipeline takes longer (more stages). | Soft limit; tested up to 10. |
| **Section H CTE: 2000 char limit on forbidden tables / columns** | Author can't list 500+ forbidden columns. | Soft cap to prevent prompt-injection attacks. Hard limit is workspace-side. |

### 5.2 Performance limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| **End-to-end Insights run: 30-90s typical** | User waits. Cold-start can push to 120s+. | Cycle 39 parallel stages 0+1 cuts ~10s. Cycle 39 placeholder cards show SHAPE immediately (perceived <1s). Beyond this we're bound by Databricks latency. |
| **Browser memory: 70-90 MB at multi-space steady state** | Slow machines may struggle | Multi-space cache shared across spaces; per-space usage is ~25 MB additional. |
| **Visual binary: 283 KB** | Under PBI's 350 KB cap with ~67 KB headroom | Can't add another major feature without splitting `visual.tsx` (~7000 lines, flagged for split). |
| **Proxy throughput: ~120 req/min/instance** | Single B1 instance handles ~4000 unique-user/hour in typical BI usage | Scale horizontally (Azure App Service auto-scale). Stateless except OAuth cache. |
| **localStorage hard limit: 5MB per origin** | Long-lived sessions with 50+ Insights runs may fill cache | Cycle XXX roadmap: LRU eviction with byte cap. Today: viewer can clear via Refresh. |

### 5.3 Quality / accuracy limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| **AI hallucinations are possible** | Genie occasionally invents column names or fabricates aggregates | Cycle 23 format validator catches FORMAT non-compliance + auto-retries once. We do NOT have a semantic-correctness validator. |
| **No automated answer-correctness eval suite** | We don't track quality drift over time | Roadmap: 5-10 known-answer questions run weekly via cron. Compare against ground truth. |
| **Section formatting compliance is probabilistic** | RECOMMENDED ACTIONS sometimes returns prose despite cycle 23 retry | Validator catches most; some still slip through. Eyeball + Refresh button. |
| **Theme inheritance occasionally partial** | Bg/text/accent inherit; some derived shades don't | Cycle 28 added `getColor()` API fallbacks + diagnostic logging (cycle 27). Visible to designers; functional. |
| **Multi-space supervisor mode: untested at 7-9 spaces** | Built but not stress-tested | Use 1-3 spaces in production for now. |
| **Confidence scoring (Tier B): heuristic, not ML-based** | Confidence ratings are based on shape (SQL complexity, result row count) + business-language reasons; not a true probability | Honest framing only — never claim "99% confidence". |

### 5.4 Security limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| **Wave 38 setup-access allowlist is UX-gate only** | Anyone with edit-mode access to the .pbix can bypass | Documented explicitly in product banner. Real authorization = PBI workspace permissions. Wave 38 Phase 2 (server-side AD group enforcement) is roadmapped. |
| **Token redaction is regex-based** | Custom token formats with no recognizable prefix could leak | Three regex passes catch dapi*, Bearer*, Authorization:* — covers Databricks PATs + OAuth tokens + AWS SigV4 tokens. Custom token formats would need explicit support. |
| **SP-identity hash is unsalted** | Targeted attacker with known SP `clientId` can recompute the hash | Deterministic by design for log-grouping. For HIPAA/PCI: salt it. Documented trade-off. |
| **No formal WCAG 2.1 AA audit** | Accessibility claim limited to "controls in place" not "certified" | Roadmap: 1-week axe-core/Lighthouse audit. |
| **Inline credentials path (Wave 31)** | When `inlineCredentialsMode=on`, visual can supply own creds via headers — bypasses server-side trust | DEFAULT IS `off`. Production deployments MUST keep it `off`. Documented as project tripwire. |
| **No mutual TLS** | Proxy ↔ Databricks uses standard server-cert TLS | Roadmap if needed. Would require client cert management. |
| **Logs not encrypted at rest** | `proxy.out.log`, `feedback.log` are plain files on disk | Pipe to your SIEM via syslog/fluentd. Enable disk encryption on host. |

### 5.5 Operational limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| **No CI/CD in upstream repo** | Tests run locally before commit; no automated PR gate | Set up GitHub Actions (vitest + jest + pbiviz package) — half a day of work. |
| **No paid support tier** | Community / self-support only | Internalize maintenance OR arrange paid maintenance contract separately. |
| **Single-developer bus-factor** | One primary contributor today | Mitigation: open-source MIT, fully inspectable, BEAST_MODE_MEMORY makes onboarding fast, AI-collab framework documented. Pre-pitch: identify your internal contributor. |
| **Proxy is single-tenant** | One proxy instance serves one tenant's profiles | Multi-tenant version would need per-request profile routing changes. ~2 weeks of work. |
| **Settings stored per-PBIP, not per-tenant** | Each report has its own settings; updating 50 reports requires 50 edits | Workaround: use the JSON export/import feature (cycle 11+) to bulk-apply. Tedious; not great. |
| **`proxy/config.json` plaintext on disk** | File needs `chmod 600` and backup-encrypted | Production: use Azure Key Vault references via env vars; never put plaintext PAT on disk. |
| **No automated dependency CVE scanning in CI** | `npm audit` runs only when developer remembers | Add `npm audit --production --audit-level=high` to your CI. |

### 5.6 Backend-specific limitations

#### Databricks Genie
- Genie space must be in the SAME workspace as the warehouse it queries.
- Multi-space mode treats each space as independent — they cannot reference each other's data.
- Genie's prompt-following is probabilistic; cycle 23 helps but doesn't eliminate format drift.
- Direct mode (no proxy) requires PAT in the .pbix — credential-leak risk for shared reports.

#### Azure OpenAI
- Requires you to deploy specific models (GPT-4 / GPT-4o recommended) in your Azure OpenAI resource.
- No built-in SQL execution — needs a separate SQL execution path (currently delegates to Databricks SQL Warehouses via proxy; or accepts the AI's claim about results without execution).
- Token costs accrue against your Azure OpenAI quota.

#### AWS Bedrock
- RetrieveAndGenerate path requires you to have built a Bedrock Knowledge Base over your data.
- InvokeModel path needs separate SQL execution (same caveat as OpenAI).
- AWS SigV4 signing is implemented in-proxy (no AWS SDK dependency); works but adds 5-10ms per request.

#### Databricks AI Gateway (preview)
- Preview only. Don't demo. Don't deploy to production.

---

## Appendix A — Quick API enable checklist for IT

Print this. Hand it to your IT team. They'll know what to do.

### Databricks workspace admin
- [ ] Create Service Principal (or generate PAT)
- [ ] Grant SP workspace user role
- [ ] Grant SP CAN_VIEW or CAN_RUN on each Genie space the visual will use
- [ ] Grant SP CAN_USE on each SQL Warehouse the visual will use
- [ ] Grant SP SELECT on each Unity Catalog table/view the visual will read
- [ ] (Optional) Grant SP READ_QUERY_HISTORY for the cycle 40 Query Audit panel
- [ ] Note the workspace host URL (e.g. `https://my-org.cloud.databricks.com`)
- [ ] Note the SP applicationId + OAuth secret (generated once)

### Network / firewall admin
- [ ] Allow proxy host outbound to `*.databricks.com` :443
- [ ] Allow proxy host outbound to `accounts.cloud.databricks.com` :443 (if SP from account principal)
- [ ] Allow proxy host outbound to `*.openai.azure.com` :443 (if Azure OpenAI backend)
- [ ] Allow proxy host outbound to `bedrock-runtime.*.amazonaws.com` :443 (if Bedrock backend)
- [ ] Allow PBI Service or PBI Desktop machines outbound to your proxy URL
- [ ] If MITM TLS proxy in use: deploy corp-ca-bundle.pem to proxy host + set `NODE_EXTRA_CA_CERTS`

### Power BI admin
- [ ] Tenant setting: "Allow custom visuals" enabled
- [ ] Tenant setting: "Allow custom visuals built using developer mode" enabled (for our `.pbiviz`)
- [ ] (Optional, recommended) Disable .pbix export download to mitigate PAT-in-pbix risk
- [ ] Approve the `.pbiviz` for org-wide use (Workspace → Custom Visuals)

### Compliance / InfoSec
- [ ] Review §4 (user identity propagation) with stakeholders
- [ ] Decide: SP-only or workaround chain (Section H CTE + UPN binding)
- [ ] If regulated: identify which compliance regime applies + map workarounds
- [ ] Approve `proxy/config.json` storage (Azure Key Vault recommended)
- [ ] Sign off on token rotation cadence (default: SP secret rotates every 90 days)

---

## Appendix B — Detect what your workspace supports

Run these from your VS Code terminal (not from this session — credential handling). They'll tell you in 30 seconds whether your workspace has what's needed:

```bash
# 1. Auth works?
databricks current-user me

# 2. Can you see Genie spaces?
databricks api get /api/2.0/genie/spaces

# 3. Can you see warehouses?
databricks api get /api/2.0/sql/warehouses

# 4. Can you read query history? (optional, cycle 40 Query Audit)
databricks api get /api/2.0/sql/history/queries?max_results=5
```

If any of those returns 401/403, that's your IT team's setup gap to close.

---

*Compiled May 2026 by post-cycle-42 audit. The API list (§1) and limitations (§5) drift slowly — re-review at every major release. The OAuth setup (§3) and identity propagation (§4) sections are stable until Databricks ships OBO for Genie.*
