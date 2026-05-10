# PepPulse — Enterprise Readiness Brief

> **Audience:** enterprise reviewers, security architects, IT/InfoSec, vendor-risk teams. People who will demand evidence, not promises.
>
> **Purpose:** consolidate everything an enterprise pitch will be challenged on — proxy setup, security threats + mitigations, footprint, and the questions you WILL get asked. This doc is the answer key.
>
> **Last reviewed:** 2026-05-09 (post-cycle 41, commit `04daac4`).
>
> **How to use:** read once top-to-bottom for orientation; bring §3 (security) and §5 (Q&A) on stage; hand §1 (setup) to whoever pilots the proxy in your DevOps team.

---

## Table of contents

1. **Proxy setup — step by step**
2. **Security threat model — defense in depth, audited**
3. **Footprint — how lightweight (with hard numbers)**
4. **Performance budget — latency, throughput, memory**
5. **Reviewer Q&A — the 20 questions enterprise teams will ask**
6. **Enterprise adoption checklist**
7. **Comparison to alternatives — when NOT to pick PepPulse**

---

## 1. Proxy setup — step by step

The visual ALWAYS routes through a proxy (`127.0.0.1:8787` for dev, Azure App Service for production). The proxy is the only component that holds workspace credentials. Every Databricks call from the visual goes through it.

### 1.1 Prerequisites

| Requirement | Version | Why |
|---|---|---|
| **Node.js** | 18.x – 22.x (20 LTS recommended) | Runtime. Pin in `proxy/package.json`. Node 23+ crashes pbiviz tooling but the proxy itself runs on 23+ if needed. |
| **Databricks workspace** | Any region, classic or Premium | Source of Genie SQL + warehouse compute. |
| **Authentication** | One of: Personal Access Token (PAT), OAuth Service Principal, Databricks AI Gateway | PAT for dev/lab; SP/M2M for production (rotation without downtime). |
| **Network** | Outbound HTTPS to `*.databricks.com` (or your cloud-specific host) | Both proxy → Databricks AND visual → proxy must be reachable. |
| **OS** | Windows / macOS / Linux | Cross-platform. Smoke tests are PowerShell — easiest on Windows; Bash equivalents work elsewhere. |

### 1.2 Create `proxy/config.json`

Copy from the template:

```bash
cd proxy
cp config.example.json config.json
```

Edit `config.json`. Minimum viable shape (single profile, PAT auth):

```json
{
  "port": 8787,
  "sharedKey": null,
  "profiles": {
    "default": {
      "host": "https://your-workspace.cloud.databricks.com",
      "token": "dapiXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "spaceId": "01ef000000000000",
      "warehouseId": "0123456789abcdef",
      "assistantProfile": "default"
    }
  }
}
```

**Production-grade additions:**

```json
{
  "port": 8787,
  "sharedKey": "<32+ char random string>",
  "inlineCredentialsMode": "off",
  "profiles": {
    "sales": {
      "host": "...",
      "auth": {
        "type": "oauth-m2m",
        "clientId": "...",
        "clientSecret": "...",
        "scope": "all-apis"
      },
      "spaceId": "...",
      "warehouseId": "..."
    }
  }
}
```

| Field | Notes |
|---|---|
| `port` | Default `8787`. Change if conflict (rare). |
| `sharedKey` | When set, every proxy request must include `X-Genie-Key: <value>` header. Constant-time-compared. **Required for production.** |
| `inlineCredentialsMode` | `off` rejects the visual's inline credential headers. **Required for production** so authors can't override server-side trust. |
| `profiles` | Map of `assistantProfile name → backend config`. The visual sends `assistantProfile=sales` and proxy routes to that profile's host/token. |
| `auth.type` | `pat` (default) or `oauth-m2m` for service principal. |

### 1.3 Start the proxy

**Dev mode (foreground, for debugging):**
```bash
cd proxy
node server.js
```

**Production (Azure App Service):** documented in `docs/AUTHOR_GUIDE.md` Part 9 — Azure deployment. Cloud Shell script + env-var-based config + Key Vault integration.

**Background service (Windows, with restart on crash):**
```powershell
# Use NSSM (Non-Sucking Service Manager) — battle-tested
nssm install UniBridgeProxy "C:\Program Files\nodejs\node.exe" "D:\Working_Folder\...\proxy\server.js"
nssm start UniBridgeProxy
```

### 1.4 Verify it works

```bash
# Health (no auth required)
curl http://127.0.0.1:8787/health

# Should return: {"ok":true,"profiles":[...],"port":8787,...}

# Smoke tests (full Genie roundtrip — needs profiles configured)
pwsh -NoProfile -File scripts/smoke-full.ps1
pwsh -NoProfile -File scripts/smoke-rls-ols.ps1
```

### 1.5 Common setup gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `unable to verify the first certificate` | Corporate MITM proxy intercepts TLS; Node doesn't trust the cert chain | Set `NODE_EXTRA_CA_CERTS=path\to\corp-ca-bundle.pem` BEFORE `node server.js`. Some teams put this in PowerShell `$PROFILE`. |
| `EADDRINUSE 8787` | Another process bound to the port | `Get-NetTCPConnection -LocalPort 8787` then `Stop-Process -Id <PID>`. Or change `port` in config.json. |
| `Authentication failed (401)` | PAT expired, SP credentials rotated, or workspace lockout | Regenerate PAT in Databricks UI → User Settings → Developer → Access Tokens; update config.json; restart proxy. |
| Proxy works but visual gets `Proxy Offline` | Visual is using `localhost` not `127.0.0.1`; on Windows `localhost` resolves IPv6 first → 2s fallback delay, sometimes timeout | Use `127.0.0.1:8787` in the visual's `apiBaseUrl` setting (not `localhost`). Documented as project tripwire. |
| Visual can't reach `*.databricks.com` directly | `capabilities.json` WebAccess allowlist doesn't include the host | Direct mode requires `https://*.cloud.databricks.com` etc. in `capabilities.json` — already in default. Custom workspaces (e.g. `https://my-corp.databricks.gov`) need the host added + repackage. |
| Proxy starts but `/admin/query-history` returns 404 | Old proxy code (pre-cycle 40) | Pull latest from `main`, restart proxy. |
| Proxy logs show nothing | `Start-Process` redirect lost stdout | Run interactively (`node server.js` not `Start-Process node`) OR pipe to file: `node server.js > proxy.out.log 2> proxy.err.log`. |

### 1.6 Multi-environment (lab → staging → production)

Recommended layout — different `config.json` per env, same profile names:

```
infra/
  proxy-config.lab.json       # localhost host, dev workspace
  proxy-config.staging.json   # Azure App Service, staging workspace
  proxy-config.prod.json      # Azure App Service, prod workspace, Key Vault refs
```

Same `.pbiviz` ships everywhere. The visual's `apiBaseUrl` setting per PBIP changes — lab points to `127.0.0.1:8787`, prod points to `https://your-proxy.azurewebsites.net`. Author choice, not code choice.

---

## 2. Security threat model — defense in depth, audited

### 2.1 Trust boundaries

```
┌──────────────────────────────────────────────────────────────┐
│ ⚠ LOW TRUST — Power BI .pbix file                            │
│   - Anyone with workspace access can download (it's a ZIP)   │
│   - Stored credentials are plain JSON inside the .pbix       │
│   - Mitigation: tenant admin disables .pbix download         │
└──────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS to localhost (Desktop)
                              │ HTTPS over public Internet (Service)
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ 🔒 MEDIUM TRUST — Proxy host                                  │
│   - Localhost (Desktop): no external attack surface          │
│   - Azure App Service (Service): public hostname             │
│   - X-Genie-Key shared-secret gate (constant-time compare)   │
│   - In-process token handling (no disk persistence)          │
│   - inlineCredentialsMode=off rejects visual-supplied creds  │
└──────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS + Bearer auth (or OAuth M2M)
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ 🔒🔒 HIGH TRUST — Databricks workspace (or Azure OpenAI / AWS)│
│   - Unity Catalog enforces row + column RBAC                 │
│   - SQL Warehouse executes under workspace identity          │
│   - Workspace audit logs                                     │
│   - This is the load-bearing security fence                  │
└──────────────────────────────────────────────────────────────┘
```

**Single most important point to internalise:** PepPulse is defense-in-depth ON TOP of these primary fences. We never claim to be the primary security boundary — we layer over Unity Catalog / Azure AD / workspace RBAC.

### 2.2 Audited security controls

These are the controls that EXIST IN CODE (not promises). Each row links to the specific source line for verification.

| # | Control | Source | What it stops |
|---|---|---|---|
| C1 | XHR-only client (never `fetch`) | [genie.ts](../genieChatVisual/src/genie.ts) — XMLHttpRequest only | PBI Desktop sandbox blocks `fetch`; XHR is the only allowed transport. Defense against network-bypass attempts. |
| C2 | DML keyword blocklist (visual-side) | [genie.ts:353](../genieChatVisual/src/genie.ts#L353) — `DML_RE` regex | Author-supplied custom SQL containing `DROP / DELETE / UPDATE / INSERT / TRUNCATE / ALTER / GRANT / REVOKE` rejected before request leaves the visual. |
| C3 | DML keyword blocklist (proxy-side mirror) | [proxy/lib/sqlExecutor.js:108](../proxy/lib/sqlExecutor.js#L108) — same `DML_RE` | Defense-in-depth — even if visual is bypassed, proxy refuses to execute DML on the warehouse. |
| C4 | Identifier sanitization | [genie.ts:387](../genieChatVisual/src/genie.ts#L387) — `sanitizeIdentifierList` | Author-supplied forbidden-table/column lists are length-capped + character-restricted to prevent prompt injection via identifier names. |
| C5 | Inline-credential gate | [proxy/server.js:405-548](../proxy/server.js#L405) — `sanitizeInlineHeader` | When `inlineCredentialsMode=off`, visual-supplied `X-Databricks-Token` headers are rejected. Production posture. |
| C6 | Token redaction in logs | [proxy/server.js:874-877](../proxy/server.js#L874) — three regex passes | `dapi[a-f0-9]+`, `Bearer <...>`, and `Authorization: <...>` patterns stripped from any propagated error/log body. |
| C7 | Constant-time shared-key compare | [proxy/server.js:1305-1311](../proxy/server.js#L1305) — `crypto.timingSafeEqual` | Closes timing oracle that would let an attacker brute-force the shared key one byte at a time. |
| C8 | Rate limiting (per IP) | [proxy/server.js:1105-1116](../proxy/server.js#L1105) — 120 req/IP/min | Slows credential-stuffing / scraping attempts. Doesn't replace upstream Databricks rate limits. |
| C9 | Body-size limit (Express) | [proxy/server.js](../proxy/server.js) — `express.json({ limit: '5mb' })` | Reject 5MB+ payloads at the boundary. Smoke test T7 verifies 413 response. |
| C10 | Schema-name redaction in errors | [proxy/server.js:967-971](../proxy/server.js#L967) — `column/table/schema → [redacted]` | Databricks error bodies often leak `column 'CUSTOMER_AGE' not found in table 'SALES'`; redacted before reaching viewers without schema access. |
| C11 | OAuth M2M token caching with single-flight | [proxy/server.js](../proxy/server.js) — early-refresh at 90% of expiry | Concurrent requests don't all hit the token endpoint simultaneously. Reduces auth attack surface + cost. |
| C12 | WebAccess host allowlist | [genieChatVisual/capabilities.json](../genieChatVisual/capabilities.json) — `WebAccess` allowlist | Power BI's manifest restricts the hosts the visual can reach to a curated list (`*.databricks.com`, `*.openai.azure.com`, `*.amazonaws.com`, `127.0.0.1`). Anything else is blocked at the platform level. |
| C13 | DOM injection surface — controlled | [visual.tsx:6364, 6398, 7736](../genieChatVisual/src/visual.tsx#L7736) — three `dangerouslySetInnerHTML` sites | All three are SQL syntax-highlighting paths. Input is `highlightSql(sql)` which HTML-escapes via `.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')` BEFORE adding `<span>` markers. Audited safe. No other dangerouslySetInnerHTML in the codebase. |
| C14 | Audit log with X-Request-Id correlation | [proxy/server.js](../proxy/server.js) — `auditLog` per route | Every Databricks-bound request logged with `{ts, requestId, profile, action, status, latencyMs}`. Cross-system tracing from visual → proxy → Databricks. |
| C15 | Sandbox auto-detect (cycle 19) | [visual.tsx](../genieChatVisual/src/visual.tsx) — `lazyExportBlocked` flag | PNG/Excel exports rely on lazy chunks PBI Desktop sandbox blocks. Auto-detection hides those options in Desktop so author isn't tricked into thinking they failed. |
| C16 | Per-stage SQL validator (cycle 23) | [insightsStageValidator.ts](../genieChatVisual/src/insightsStageValidator.ts) | Detects when AI output doesn't match its format contract (e.g. RECOMMENDED ACTIONS rendered as prose). Triggers ONE auto-retry with strengthened prompt. Prevents bad output from silently shipping. |

### 2.3 Findings from the codebase scan (May 2026)

I ran a deliberate sweep for common security smells. Results:

| Smell | Found | Severity | Disposition |
|---|---|---|---|
| `eval()` / `new Function()` (code injection) | **0 occurrences** | — | Clean. |
| Hardcoded `apikey/secret/password/token` literals | **0 occurrences** | — | All credentials come from `proxy/config.json` (gitignored) or env vars. |
| `dangerouslySetInnerHTML` (XSS surface) | **3 occurrences** | LOW (audited) | All three are SQL syntax highlighting; input HTML-escaped before injection. See C13. |
| `innerHTML =` direct assignment | 0 occurrences | — | Clean. |
| Unsanitized SQL execution | **0 paths** | — | All SQL paths go through `DML_RE` blocklist (C2 + C3). |
| Token leak vectors in logs | **3 redaction passes** in place | LOW | Defense-in-depth. See C6. |
| Missing `rejectUnauthorized` (TLS bypass) | 0 occurrences | — | Default TLS verification active. Setup gotcha (1.5) addresses corp-cert chains. |
| `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` (insecure default) | 0 occurrences | — | Clean. |

**Outstanding hardening opportunities** (NOT in code today):

| Item | Effort | Priority |
|---|---|---|
| Add Content Security Policy meta to the visual HTML | <1 day | Medium — defense in depth against script injection |
| Sign the .pbiviz with Microsoft's pbiviz-cert path | <1 day | Medium — gets "Microsoft-signed" badge in Service |
| Implement X-Request-Id signing (HMAC of body) | 2-3 days | Low — only relevant if MITM is in scope |
| Add schema-aware deep redaction (right now redacts identifier names; doesn't redact metric VALUES) | 1 week | Low — viewer already had to authorize Genie |
| Formal dependency audit via `npm audit --production --json` in CI | <1 day | Medium — should run on every deploy |

### 2.4 What we explicitly DO NOT defend against

Be honest about scope. The presenter who oversells gets demolished. The presenter who's honest gets adopted.

| Threat | Why we don't defend | What you should do instead |
|---|---|---|
| Malicious .pbix author | The visual loads code the author packaged. If the author is malicious, the entire .pbix is. | PBI workspace permissions; tenant admin disables .pbix download. |
| RLS/OLS enforcement at warehouse | Genie runs SQL under the proxy's credentials, NOT the viewer's. So Unity Catalog row filters tied to `current_user()` won't fire. | If RLS is required, use the proxy's User-Mode + Section H CTE preamble with `{{userId}}` interpolation to scope queries authoritatively. Documented in `docs/SECURITY_REVIEW.md`. |
| AI hallucination | We don't run a hallucination detector. The auto-retry only catches FORMAT compliance, not factual accuracy. | Pair PepPulse with a periodic eval suite (5-10 known questions, run weekly, compare answers). Roadmapped. |
| Side-channel timing attacks on Genie answers | Out of scope — these require sub-millisecond timing precision Internet RTT erases anyway. | N/A. |
| Denial-of-Wallet via excessive Databricks queries | Rate limiting (C8) slows but doesn't stop a determined attacker burning DBUs. | Set DBU budget alerts in Databricks workspace. Use OAuth M2M with restrictive scope. |

---

## 3. Footprint — how lightweight (with hard numbers)

### 3.1 Visual binary size

| Component | Size | Notes |
|---|---|---|
| **Total `.pbiviz` (cycle 41)** | **283 KB** | Under PBI's 350 KB cap. Headroom for one more major feature without splitting. |
| Main JS bundle | ~245 KB | React 19 + Recharts + chart logic + setup UI + insights renderer |
| LESS-compiled CSS | ~30 KB | Theme tokens + Wave 44 inheritance + per-feature styling |
| Assets (icons, manifest) | ~8 KB | SVG icons inline; no external assets |

### 3.2 Lazy chunks (loaded on-demand)

These chunks are NOT in the main `.pbiviz` — they download only if the user actually triggers the feature. PBI Desktop sandbox blocks them (cycle 19 auto-detects + hides those options).

| Chunk | Size | Loaded when |
|---|---|---|
| `sql-formatter` | ~50 KB | First time user opens View SQL panel — cycle 41 added inline fallback so the chunk is no longer required for basic formatting |
| `xlsx` (SheetJS) | ~412 KB | First time user clicks Save as Excel (Service/Web only) |
| `html2canvas` | ~148 KB | First time user clicks Save as PNG (Service/Web only) |
| Compare panel (multi-space) | ~12 KB | First time multi-space mode renders side-by-side |

### 3.3 Memory footprint at runtime

Measured with PBI Desktop dev tools, fresh report load:

| State | RAM (visual iframe) | Notes |
|---|---|---|
| Idle (visual rendered, no insights run) | ~25-30 MB | Baseline for React + Recharts + setup UI |
| After 5-stage AI Insights run | ~45-55 MB | Stage traces + cached results in memory |
| Multi-space (3 spaces, all insights cached) | ~70-90 MB | One result tree per space |

**Comparison points:**
- A typical Power BI native chart visual: 15-25 MB
- The Microsoft Maps custom visual: 60-80 MB
- ESRI ArcGIS for Power BI: 200+ MB
- ThoughtSpot embedded: 400+ MB

PepPulse is **mid-pack for custom visuals** and **lighter than every embedded analytics alternative**.

### 3.4 Network footprint per insights run

| Phase | Calls | Bytes (typical) |
|---|---|---|
| Initial visual load | 1 (XHR to load chunk) | ~283 KB once + cache forever |
| Health probe | 1 GET to `/health` | <1 KB |
| Stage 0 + 1 (parallel, cycle 39) | 2 POSTs to `/conversations/start` | ~3 KB out, ~15-20 KB in each |
| Stages 2-7 (paired) | 6 POSTs distributed in 3 batches | ~3 KB out, ~5-15 KB in each |
| Genie polling | ~30-50 GETs across the run | ~1 KB each |
| **Total per fresh run** | **~40-60 calls** | **~150-250 KB** |
| **Cached re-render (Wave 27)** | **0 calls** | **0 bytes** |

Cache hit on second-open is instant (localStorage + module cache). Wave 27 fingerprint key auto-busts on schema change.

### 3.5 Cold-start latency budget

For a brand-new report load (no cache, cold proxy on Azure F1, cold Databricks warehouse):

| Phase | Time | Optimisation |
|---|---|---|
| Proxy wake (Azure F1 sleeps after 20min idle) | 15-45s | Cycle 6 cold-start banner; B1 tier ($13/mo) eliminates |
| Databricks warehouse start | 30-180s | Use serverless SQL warehouse (instant) |
| Stage 0+1 parallel cycle 39 | 15-25s | Was 25-40s; cycle 39 cut ~10s |
| Subsequent stage pairs | 8-15s each | Already parallel within batch |
| **End-to-end first run (worst case)** | **60-90s** | All factors above warmed → drops to ~30-50s |
| **End-to-end second run (warm)** | **20-40s** | No proxy wake, no warehouse start |
| **Cache hit (third+)** | **<200ms** | Instant from localStorage |

Acceptable for "open report once per day" use. Not acceptable for "switch reports every 30s" — but that's not the use case.

### 3.6 Proxy footprint

| Metric | Value |
|---|---|
| Proxy binary on disk (just the proxy/) | ~3 MB code + ~120 MB node_modules |
| Proxy memory at idle | ~50-70 MB Node baseline |
| Proxy memory under load (3 concurrent insights runs) | ~100-150 MB |
| Cold start time (`node server.js` to ready) | ~200-500ms |
| CPU per request | <5% of one core (mostly IO-bound waiting for Databricks) |
| Disk writes | `feedback.log` only (opt-in, append-only, no PII without explicit user consent) |

**Hosting recommendation:**
- Azure App Service F1 (free) — fits comfortably; sleeps after 20min idle
- Azure App Service B1 ($13/mo) — always-on, no cold start
- Container with 256MB memory cap — works fine
- Kubernetes pod — 100m CPU + 256Mi memory request, 500m CPU + 512Mi limit

**Throughput** (single instance, B1 tier): ~80-120 req/min sustained, bound by Databricks's per-workspace rate limits, not the proxy itself.

---

## 4. Performance budget

### 4.1 Where time is actually spent

For a 7-stage AI Insights run on a warm system:

```
Total: ~45s
├── Proxy → Databricks roundtrip: 35s (78%)
│   ├── Genie SQL generation: 15-25s
│   ├── Warehouse execution: 8-15s
│   └── HTTP overhead: <2s
├── Visual orchestration: 6s (13%)
│   ├── Stage scheduling + paint: 2s
│   ├── Inter-batch pacing (rate limits): 4s
│   └── React reconcile: <500ms
├── Theme + render: 3s (7%)
│   └── Markdown → React tree: 2-3s
└── Cache write: <100ms
```

**Headline:** **78% of total time is OUR proxy waiting for Databricks.** We can't speed up the Databricks side. We've optimised everything we control.

### 4.2 Optimisations already in code

| Cycle | Optimisation | Wall-clock saved |
|---|---|---|
| Wave 27 | Two-tier cache (memory + localStorage) | 100% on cache hit |
| Wave 35 | Custom SQL section dispatcher | 0% (deterministic SQL is intentionally slower than AI) |
| Wave 39 | Inter-batch pause from 5s → 2s | ~15s on multi-stage runs |
| Cycle 6 | Cold-start banner UX | 0% real, 100% perceived (user sees progress) |
| Cycle 23 | Per-stage auto-retry on format failure | -1 to +20s (sometimes adds time, but rescues otherwise-failed runs) |
| **Cycle 39** | **Stage 0+1 in parallel** | **~10-15s on cold runs** |
| **Cycle 39** | **Placeholder section cards (perceived)** | **~10s perceived** |

### 4.3 Optimisations NOT taken (and why)

| Option | Why we didn't | When to revisit |
|---|---|---|
| Stream stage content as it generates | Genie API doesn't support streaming today | When Databricks ships streaming endpoints |
| Pre-fetch insights on report open (before user clicks AI Insights tab) | Burns DBUs on reports that user never opens | If usage data shows >70% of users always open AI Insights tab |
| Drop inter-batch pause to 0s | Hits Databricks 5 req/min/workspace rate limit; gets us 429s | If rate limit is raised by workspace admin |
| Bundle all chunks into the .pbiviz | Pushes past 350 KB cap | When PBI raises the cap |
| Worker thread for markdown parsing | Visual sandbox doesn't support workers | If/when PBI adds worker support |

---

## 5. Reviewer Q&A — the 20 questions enterprise teams will ask

These are NEW questions specific to enterprise adoption. The 31 forum-stage questions are in `TECHNICAL_FORUM_BRIEFING.md` §14 — make sure to read both before going on stage.

### 5.1 InfoSec / Compliance

**E-Q1: "Where is the credential stored at rest?"**
A: `proxy/config.json` on the proxy host's filesystem (file permissions: `chmod 600` recommended). NOT in the .pbix. NOT in the visual. NOT in transit logs (token redaction C6). For Azure, use Key Vault references in App Settings — `proxy/server.js` reads via env vars. Production deploys should NEVER have a plaintext PAT on disk; use OAuth M2M with rotation.

**E-Q2: "Show me the threat model."**
A: §2 of this doc. Three trust zones, 16 audited code-level controls (C1-C16) with source line links, 5 hardening opportunities documented as deferred work, 5 explicit non-defenses with justifications. No vendor hand-waving.

**E-Q3: "Has the dependency tree been audited?"**
A: `npm audit` runs on every package install but NOT yet automated in CI. Roadmap entry. Top dependencies: `react@19`, `powerbi-visuals-tools@7.x`, `express@4`, `sql-formatter` (lazy chunk, optional), `recharts`, `html2canvas` (lazy chunk, optional), `xlsx` (lazy chunk, optional). All MIT/Apache-2 licensed. No GPL/AGPL.

**E-Q4: "What happens if Anthropic / OpenAI / AWS goes down?"**
A: We're backend-agnostic. Authors switch profile in `proxy/config.json` — visual unchanged. The proxy supports Databricks Genie + Azure OpenAI + AWS Bedrock + Databricks AI Gateway as first-class backends. Rebuild not required; settings change only.

**E-Q5: "What's the data residency story?"**
A: Data NEVER leaves your tenant boundary. Visual → proxy (your VM/App Service) → Databricks workspace (your region). No PepPulse SaaS tier exists. No telemetry shipped to Anthropic. The proxy itself is an open-source binary you self-host.

**E-Q6: "What's logged where?"**
A: Three log surfaces: (1) browser console — opt-in via Setup → Operations → Show Trace, no creds. (2) `proxy.out.log` / `proxy.err.log` — request audit + errors, no creds (token redaction C6). (3) `feedback.log` — opt-in user feedback only, no PII. All logs are append-only flat files; pipe to your SIEM via syslog/fluentd as needed.

**E-Q7: "Can you survive an SOC 2 audit?"**
A: The CONTROLS exist (C1-C16) and would survive a controls audit. The PROCESS gaps (formal change-management, incident response, encryption-at-rest for transit logs) are documented as Type II prerequisites. Honest position: SOC 2 Type I achievable in ~1 month of process work; Type II is an ongoing operational commitment, not a code change.

### 5.2 Operations / SRE

**E-Q8: "What's the upgrade path?"**
A: Two artifacts to upgrade independently:
- **Visual** — drop the new `.pbiviz` into the workspace; existing reports auto-pick-up (or republish if you ship via App Workspace).
- **Proxy** — `git pull && npm install --production && systemctl restart unibridge-proxy` (or Azure deployment slot swap). Zero-downtime if you run two instances behind a load balancer.

The visual + proxy versions DON'T need to match exactly — backward compatibility maintained for at least one major version. Breaking changes flagged in `docs/RELEASE.md`.

**E-Q9: "How do you do rollbacks?"**
A: Visual: re-publish the previous `.pbiviz` (workspace stores both, switch back in <1min). Proxy: `git checkout <previous-tag> && npm restart` OR Azure deployment slot rollback (<30s). State is in localStorage (per-viewer) and `proxy/config.json` (server) — neither requires migration.

**E-Q10: "How do you scale to 1000 concurrent users?"**
A: Proxy is stateless except for OAuth M2M token cache (process-local, LRU-capped). Multi-instance via Azure App Service horizontal scale-out works for everything except the OAuth cache (each instance fetches its own — slight redundancy, no correctness issue). Externalising to Redis is a future Wave when scale demands it. Single B1 instance handles ~120 req/min sustained = ~4000 unique-user/hour assuming typical BI usage patterns. Beyond that, scale horizontally.

**E-Q11: "What's your monitoring story?"**
A: `/health` endpoint returns liveness in <50ms. `/admin/health-summary` (cycle 27) returns counters: per-status-class, per-action, per-profile, recent errors ring buffer. Wire to your monitoring (Azure Monitor / Datadog / Prometheus) via standard HTTP scraping. Per-request structured logs (X-Request-Id correlation) flow to your log aggregator.

### 5.3 Pricing / TCO

**E-Q12: "What's the total cost of ownership?"**
A: Three components:
- **Visual licensing**: $0 — open source MIT.
- **Proxy hosting**: $0 (Azure F1) to $13/mo (B1 always-on) per env. Container/k8s comparable.
- **Databricks DBUs**: variable. A typical 7-stage Insights run consumes ~0.1-0.3 DBU on a small Serverless SQL warehouse. At $0.55/DBU = ~$0.05-0.15 per run. 1000 runs/month = $50-150/month.

Total: **~$13-160/month for a small team**. Compare to ThoughtSpot ($95/user/month), Tableau Pulse ($70/user/month), Looker Enterprise ($5000+/instance/month).

**E-Q13: "Hidden costs?"**
A: (1) Databricks workspace + warehouse compute — already paid if you're on Databricks. (2) Optional: Azure Key Vault if you want managed secrets (~$0.03/10K transactions). (3) Optional: a Power BI Pro license per editor for the .pbix author. Viewers don't need a license if you publish via Embedded.

**E-Q14: "What if we want to swap Databricks for Snowflake?"**
A: Out of scope today — PepPulse's Genie integration is Databricks-specific. The architecture supports it (the proxy is connector-pluggable; OpenAI / Bedrock are alternative LLM backends), but Snowflake Cortex would need a new connector module. ~3-4 weeks of work. Roadmap candidate if there's demand.

### 5.4 Vendor risk / governance

**E-Q15: "Is PepPulse a single-developer project?"**
A: Today, primarily yes. The codebase is open-source MIT, fully inspectable, with 1130 vitest + 295 jest tests + 11 smoke tests + comprehensive docs. Bus-factor mitigation: anyone with React/Node knowledge can maintain it. The AI-collaboration framework (BEAST_MODE_MEMORY, llm_onboard.py, llm_wrapup.py) makes onboarding fast. **Honest position:** for enterprise adoption, you should plan for an internal contributor or a vendor-supported fork.

**E-Q16: "Is there a support SLA?"**
A: Community-only today. No paid support tier exists. For enterprise adoption, options:
- Internalise: fork to your private repo, allocate one engineer ~25% time, run your own release cycle.
- Vendor-led: arrange a paid maintenance contract (separate engagement; not part of the open-source project).
- Hybrid: rely on community for non-critical fixes, internalise for security patches.

**E-Q17: "Open source means no warranty. What's the legal exposure?"**
A: MIT license — "AS IS, WITHOUT WARRANTY". Same exposure as any open-source dependency in your stack (React itself, Express, etc.). Legal review of your usage in production should happen alongside your other OSS reviews. This is not a unique risk; it's a standard one.

**E-Q18: "What happens if Databricks deprecates the Genie API?"**
A: Two-track mitigation: (1) the proxy abstraction means we'd swap Genie for whatever Databricks ships next without changing the visual. (2) For long-tail safety, we already support Azure OpenAI and AWS Bedrock as alternative backends — you have a fallback path even within Databricks.

### 5.5 The hostile / curveball questions

**E-Q19: "Show me an architectural failure mode that ISN'T documented."**
A: Honest answer — the visual's localStorage cache can grow unbounded in long-lived sessions because we don't have a hard byte cap, only a TTL. After ~50-100 distinct insights runs in one session, you might hit browser localStorage limits (5MB typical). Mitigation: viewer can clear cache via Refresh button. Real fix is on the roadmap (LRU eviction with byte cap).

**E-Q20: "What would you not tell us if we weren't asking?"**
A: (1) The Theme Inheritance feature (Wave 44 / cycle 28) sometimes shows partial inheritance — the visual picks up bg/text/accent from PBI's theme but not all derived shades. We documented this honestly in cycle 27 diagnostics; visual works but a sharp-eyed designer will spot it. (2) The AI's RECOMMENDED ACTIONS section sometimes returns descriptive prose instead of imperative actions despite our cycle 23 auto-retry validator — Genie compliance is probabilistic. We mitigated, didn't eliminate. (3) Multi-space mode beyond 3 spaces is functional but not heavily tested at 7-9 spaces — we ship the slot UI but real-world usage at high counts is unknown.

The presenter who admits this stuff first wins. The reviewer's job is to find what you're hiding; if you hand them the list, they have nothing to do.

---

## 6. Enterprise adoption checklist

Print this. Walk it with your IT / InfoSec / DevOps teams BEFORE the pitch. Every "yes" closes a door reviewers were going to push on.

### 6.1 Pre-pitch (do this in your test environment)

- [ ] Proxy deployed on Azure App Service B1 (or container) — not running on someone's laptop
- [ ] `proxy/config.json` uses OAuth M2M (not PAT) for at least the production profile
- [ ] `sharedKey` set to a 32+ char random string in production config
- [ ] `inlineCredentialsMode` is `off` in production config
- [ ] `NODE_EXTRA_CA_CERTS` configured if your network uses MITM
- [ ] `npm audit --production` runs clean (or known-acceptable)
- [ ] Smoke tests pass against your production-like env
- [ ] At least one full insights run captured in proxy audit log
- [ ] Per-section retry tested
- [ ] Theme inheritance tested against your corporate PBI theme
- [ ] PBI Desktop sandbox limitations explained to authors (PNG/Excel only in Service)

### 6.2 Pitch day

- [ ] §2 (security) printed and bookmarked
- [ ] §5 (Q&A) read twice — answers cached not improvised
- [ ] Live demo dataset connected, queries warmed (no cold-start during demo)
- [ ] At least ONE failure scenario rehearsed (you WILL be asked to break it on stage)
- [ ] Honest "what we don't do" list ready (E-Q20)
- [ ] Forum-prep package downloadable (`docs/MASTER_GUIDE.md`, `TECHNICAL_FORUM_BRIEFING.md`, this doc, `SECURITY_REVIEW.md`)

### 6.3 Post-pitch (if they say yes)

- [ ] Pilot scope agreed (1-3 reports, 1 workspace, 5-15 users)
- [ ] Success criteria documented (latency targets, accuracy thresholds, NPS)
- [ ] Ownership named (who runs the proxy? who patches?)
- [ ] Runbook handed off (this doc + AUTHOR_GUIDE Part 9 Azure deployment)
- [ ] Eval suite plan agreed (5-10 known questions run weekly to detect quality drift)
- [ ] 30/60/90 day check-ins scheduled

---

## 7. Comparison to alternatives — when NOT to pick PepPulse

Honesty wins adoption. Here's where alternatives are better:

| Use case | Better choice | Why |
|---|---|---|
| You need WCAG 2.1 AA certified by Microsoft | **Microsoft Copilot in PBI** | Backed by Microsoft's accessibility team |
| You're 100% Snowflake / no Databricks | **ThoughtSpot or native Snowflake Cortex** | PepPulse's Genie integration is Databricks-specific |
| You need a managed SaaS with a vendor SLA | **Tableau Pulse or ThoughtSpot SaaS** | PepPulse is self-hosted; no vendor pays the on-call beeper |
| You need real-time streaming AI (sub-second updates) | **Custom build on Databricks LLM endpoints** | PepPulse pipeline is 30-60s; not designed for sub-second |
| You have <5 users total | **Microsoft Q&A in PBI (free)** | PepPulse's setup overhead isn't worth it for 5 users |
| You need iOS / Android native AI app | **Microsoft Copilot mobile** | PepPulse runs only inside PBI |
| You need 100% accuracy (regulated reporting) | **Hand-coded SQL + Power BI native viz** | AI is probabilistic — even with our cycle 23 validator, occasionally wrong |

**PepPulse is the right choice when:**
- You're on Databricks already
- You want backend optionality (today Genie, tomorrow maybe Azure OpenAI)
- You need governance hooks (Section H CTE, forbidden-table lists, SP-only auth) that Microsoft Copilot doesn't expose
- You want open-source you can audit + fork
- $0/user pricing matters
- You can self-host the proxy

**PepPulse is NOT the right choice when:**
- You can't self-host anything
- You need enterprise vendor support with SLAs
- Your security review demands a SOC 2 Type II certified product TODAY (not "achievable")
- You're not on Databricks (and don't plan to be)

Be the presenter who recommends an alternative when it fits better. That's how trust gets built.

---

## Appendix A — Quick file references

| Concern | File |
|---|---|
| Proxy code | `proxy/server.js`, `proxy/lib/sqlExecutor.js`, `proxy/lib/llmOrchestrator.js` |
| Visual code | `genieChatVisual/src/visual.tsx`, `genieChatVisual/src/genie.ts` |
| Settings | `proxy/config.json` (gitignored), `proxy/config.example.json` (template) |
| Capabilities (PBI manifest) | `genieChatVisual/capabilities.json` |
| Tests | `genieChatVisual/tests/`, `proxy/tests/`, `scripts/smoke-*.ps1` |
| Other docs | `docs/SECURITY_REVIEW.md`, `docs/AUTHOR_GUIDE.md`, `docs/TECHNICAL_FORUM_BRIEFING.md`, `docs/QUALITY_METHODOLOGY.md` |

---

*Compiled May 2026 by post-cycle-41 audit. Re-run §2.3 (codebase scan) and §3.1 (size measurements) before any major release. The other sections are stable until you make architectural changes.*
