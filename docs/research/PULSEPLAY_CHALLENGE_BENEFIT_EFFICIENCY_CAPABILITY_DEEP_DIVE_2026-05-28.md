# PulsePlay — Deep-Dive: Challenge · Benefit · Efficiency · Capability (+ Risk, Security, Competitive, Maturity)

> **Date:** 2026-05-28 · **Verified at HEAD** `4436b0f` (branch `codex/f5-g0-native-layout-2026-05-21`).
> **Method:** four research lanes — three offline (in-repo, file:line evidence) + one online (market/standards). Every capability is tagged **SHIPPED / PARTIAL / ROADMAP** and cited.
> **Posture:** brutal-honest. This doc exists so the briefing survives exec cross-examination. Where CLAUDE.md or older docs over-claim, it is called out here (see Appendix A).

---

## 0 · How to read this

- **SHIPPED** = wired and exercised in code at HEAD, with a file:line citation.
- **PARTIAL** = real but with a material limit (regex-only, in-memory, single-source, etc.).
- **ROADMAP** = described/intended but not in the code today.
- The four lenses the briefing must nail are **Challenge / Benefit / Efficiency / Capability**. This doc adds the "and more": **Security & Governance, an honest Risk Register, Competitive positioning, and a Maturity verdict.**

---

## 1 · CHALLENGE — the problem, and the hard bets

**The problem PulsePlay solves.** The org runs *several* BI tools (Power BI, Tableau, Qlik, Looker) and owns *several* AI services (Databricks Genie, Mosaic Foundation Models & agents, Azure OpenAI, AWS Bedrock). But every AI capability is trapped inside the tool that ships it: Power BI's AI only sees Power BI, you can't bring your own approved model or governed Genie space, the "ask the data" experience differs per tool, and governance fragments because each tool mints its own tokens.

**The hard bets PulsePlay makes (and why they're hard):**
1. **Vendor-neutral without becoming lowest-common-denominator** — host any BI surface yet still offer a deep experience (real Power BI SDK today; others embed).
2. **Trustworthy answers** — never present ungrounded output as fact; enforce a status contract in code, not in the LLM's mouth (§4.8).
3. **Orchestrate, don't rebuild** — no new LLM, agent framework, or warehouse; call what the org already owns. The cost of this bet is that PulsePlay's value is *choreography + governance*, not a model moat.

> The honest counterweight to every "challenge solved" is the **Risk Register (§5)** — read them together.

---

## 2 · CAPABILITY — what's actually shipped

### 2.1 AI connector backend paths (axis X) — **10/10 SHIPPED**
CLAUDE.md's "10 backend paths" is **accurate**. Each has a live route in `proxy/server.js` (note: *not* in a `proxy/connectors/` folder — see Appendix A):

| # | Connector | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Databricks Genie | SHIPPED | default path `/assistant/conversations/start` |
| 2 | Azure OpenAI — chat | SHIPPED | `server.js:5432` `/openai/conversations/start` |
| 3 | Azure OpenAI — analytics | SHIPPED | same route `mode:'analytics'` via `llmOrchestrator.js` |
| 4 | Bedrock — Retrieve&Generate (RAG) | SHIPPED | `server.js:5687`, `bedrock.js:95` |
| 5 | Bedrock — InvokeModel (direct) | SHIPPED | `bedrock.js:154` (native SigV4, no SDK) |
| 6 | Mosaic Foundation Model | SHIPPED | `server.js:6501` `/foundation/section`, `foundationModelClient.js:125`; **+ streaming** `/foundation/conversations/start-stream` `server.js:6841` |
| 7 | Supervisor — real endpoint | SHIPPED | `server.js:7938` |
| 8 | Supervisor — local fan-out | SHIPPED | `server.js:7922` (fans out across spaces, Genie-bound) |
| 9 | Mosaic ResponsesAgent | SHIPPED | `server.js:7077` `/responses-agent/chat` |
| 10 | Power BI semantic-model (no-LLM DAX) | SHIPPED | `server.js:3203,3364`; `powerbiDaxTemplates.js`, `powerbiDatasetClient.js` |
| + | Power BI Q&A embed surface | SHIPPED | `server.js:6435` `/powerbi/qna/embed-token` (MS NLP in MS tenant; PulsePlay mints token only) |

### 2.2 BI vendor adapters (axis Y)
| Vendor | Status | Evidence |
|--------|--------|----------|
| **Power BI** | **SHIPPED — real SDK** | `bi-adapters/powerbi/index.ts:35` imports `powerbi-client` (`playground/package.json:18`) |
| Native result canvas (PulsePlay-own, ECharts) | SHIPPED | `native/NativeBIAdapter.ts:53` |
| Databricks AI/BI | PARTIAL | iframe stub (`databricks-aibi/index.ts:89`) but server-side token mint is real (`server.js:4358`) |
| Tableau / Qlik / Looker / generic-iframe | STUB (iframe) | each `extends GenericIframeAdapter`; vendor SDKs intentionally **not installed** (`package.json:43`) |

This matches CLAUDE.md's honest "stubs are not production" disclaimer.

### 2.3 AI surfaces — **SHIPPED**
- **AI Insights** briefings, section taxonomy enforced in `proxy/lib/insightsValidator.js:270` (HEADLINE / KPI / TRENDS / RISKS / OPPORTUNITIES / RECOMMENDED ACTIONS / DRIVERS).
- **Ask Pulse** Q&A — `UnifiedAssistantSurface.tsx` + `playground/src/pulse/`.
- **Workbench** (3 tabs, SQL/markdown sections, presets) — `playground/src/workbench/`, `components/workbench/`; presets in `pulse/insightsPresetLibrary.ts`.

### 2.4 Native BI panel — **SHIPPED** (with one nuance)
- `pp-bi-panel` native chrome — `BIPanel.tsx:208`.
- `--pp-*` design tokens — `styles.css:9-43`; **dark mode SHIPPED** — `:root[data-pp-theme="dark"]` at `styles.css:106`, driven by `themeSync.ts` from the Settings toggle (`PreferencesAppearance.tsx`), applied pre-render `main.tsx:34`, test-pinned `themeSync.test.ts`.
- 3-peer-tab model + **single-pane float/dock** — `PulsePlayScreen.tsx:50-53`.
- **Nuance on "side-by-side":** a `BITileGrid` renders 1 / 2 / 2×2 layouts (`App.tsx:2899-2906`), but **all tiles share one `embedConfig`** — i.e. same-source/different-view, not independent multi-source comparison. *Independent multi-source side-by-side is ROADMAP (K.2).* (The briefing's "side-by-side comparison = roadmap" is therefore correct; the same-source tile grid exists but isn't a multi-dashboard compare.)

---

## 3 · EFFICIENCY — token / cost / latency / capital

> **Bottom line up front:** the **only ground-truth-measured saving** is the $0-token Power BI DAX path (provable per-request via an `llmCallCount:0` audit line). Everything else is *sound efficiency design* — caching, conversation reuse, code-splitting, perceived-latency staging — but carries **no before/after benchmark in the repo**. "Fewer tokens, better accuracy" is an *instrumented consumption gauge* (estimated for Genie), not a demonstrated reduction against a baseline. Say it that way.

| Mechanism | Status | Evidence / honest note |
|-----------|--------|------------------------|
| **$0-token deterministic DAX path** | SHIPPED (measured) | `startPowerBiConversation` `server.js:6248-6426` imports/calls **no LLM**; matcher `powerbiQuestionMatcher.js:290-350`; templates `powerbiDaxTemplates.js:97-229`; audit emits `mode:"powerbi-deterministic", llmCallCount:0` `server.js:6394-6396`. **Caveats:** global scope, **RLS/OLS not propagated** (`server.js:6381-6388`); only 4 templates — unmatched questions return a suggestion list (also $0). |
| Right-brain-per-task routing | PARTIAL (config, not dynamic) | Static branch on `profile.type` (`server.js:3203-3204`); translator via `getTranslator()` (`promptDispatcher.js:56`). "Route to the cheapest adequate backend" is an **operator config choice**, not an automated decision — **do not claim dynamic routing.** |
| Server-side staged "1-then-3" fan-out | SHIPPED | `sectionedOrchestrator.js:36-50,72-75` — HEADLINE first, parallel sections, one shared `conversation_id`. |
| Zero-token pre-flight gating | SHIPPED | `discoveryEngine.js:19` fuses schema+metadata+pack KPIs with "No LLM calls. No SQL execution" — greys out unreachable frames before any spend. |
| Client staged reveal | SHIPPED (UX only) | `pulse/state/stagedReveal.ts` reveals an *already-generated* single-shot answer on a schedule — improves **perceived** latency; **no token saving** (its own header says re-querying "would multiply cost+latency by N"). |
| Caching & reuse | SHIPPED (un-benchmarked) | `cfg()` 30s TTL `server.js:379-419`; `discoveryEngine` 60s cache; client `insightsCache.ts` localStorage TTL (survives report reopen). |
| Sustainability / token gauge | SHIPPED (consumption, not carbon) | `SustainabilityIndicator.tsx` ← `usageTracker.ts`: session token totals, **real** when backend reports usage (OpenAI/FM/Bedrock), **estimated `chars/4`** for Genie (`usageTracker.ts:101-129`), UI shows "~"/"est."; tiers lean ≤2k … very-heavy >50k. **No carbon/energy claim in code** — it measures *consumption*, not *savings vs a baseline*. |
| Bundle efficiency | SHIPPED | Vite `manualChunks` `vite.config.ts:83-108`; lazy adapter `import()` `registry.ts:83-119`; heavy libs import-on-use `insightsExporters.ts:256-280`. **Note:** no DuckDB-WASM imported today (CLAUDE.md over-claim). |

---

## 4 · SECURITY & GOVERNANCE — controls

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| 1 | Server-side embed-token issuance | SHIPPED (PBI/AI-BI); ROADMAP (others) | `server.js:4328` `/assistant/embed-token/:vendor`; PBI mint `server.js:3963`; secret "NEVER appears in responses, audit logs, or cache key" `server.js:3973-3975`; browser-supplied RLS identity **rejected** `server.js:3997` |
| 2 | Prompt sanitisation / injection-keyword strip | SHIPPED (defence-in-depth) | `promptRedaction.ts:23-44,124,153`; self-describes vendor prompt-hierarchy as the real fence |
| 3 | PII / field masking | SHIPPED (defence-in-depth ONLY) | `masking.ts:5-10` states verbatim: *"NOT a security guarantee — Unity Catalog column masks at the data layer are the real control."* |
| 4 | Allow-lists (origin/vendor/profile, fail-closed) | SHIPPED | `allowlist.js:135-145,156-163` — production refuses to start without one |
| 5 | SQL DML gate | PARTIAL (regex) | `sqlExecutor.js:115-134`, `sqlSectionPreview.js:48-166`; real fence is a UC SELECT-only warehouse role (`SECURITY.md:116`) |
| 6 | Rate limit + audit log | PARTIAL (in-memory / console) | per-IP Map 120/min single-process `server.js:1853-1890`; audit `console.log('[audit]')` `server.js:2058` — **no SIEM, not multi-instance-safe** |
| 7 | Auth modes | SHIPPED | `none|idp|shared-key|idp-or-shared-key` `server.js:1498`; refuses `none` in prod `server.js:1685-1694`. **Databricks Apps runs `PROXY_AUTH_MODE:"none"`** (`app.yaml:18-19`) — gated by the Databricks platform URL auth. |
| 8 | 4-status trust contract | SHIPPED (frontend, validator-emitted) | `artifactValidator.ts:6-9` "status emitted by THIS validator, NEVER by the LLM"; `llmClaimedStatus` recorded but never authoritative `:36-42`; labels `artifactStatus.ts:19-24`; `TrustBadge.tsx`. **Distinct** from `insightsValidator.js` (section-shape checker). |

**Net posture:** PulsePlay is honestly a *defence-in-depth pane of glass*. The **load-bearing fences are the org IdP, Unity Catalog policy, and vendor RBAC** (`SECURITY.md:279-281`). The trust-status contract and server-side token issuance are genuinely shipped and test-pinned.

---

## 5 · RISK REGISTER — the honest gaps (read with §1)

| # | Risk | Status | Detail |
|---|------|--------|--------|
| R1 | Field masking is prompt-context only, not the data boundary | Defence-in-depth | Real control = Unity Catalog column masks (`masking.ts:5-10`) |
| R2 | SQL DML gate is regex-based, bypassable | Partial | Relies on UC SELECT-only role (`sqlExecutor.js:115`) |
| R3 | Rate limit + audit are in-memory / console only | Partial | No SIEM, not multi-instance-safe; per-user limits pending (`server.js:1855,2058`) |
| R4 | AI answer quality validated for **structure, not factual correctness** | Roadmap | No ground-truth eval suite (`SECURITY.md:249`) |
| R5 | Vendor adapters are stubs except Power BI | Partial | Tableau/Qlik/Looker iframe-only |
| R6 | Free-Edition hosting runtime cap | Operational | App auto-stops on idle; daily restart cap blocks redeploys (observed 2026-05-28) |
| R7 | Multi-tenant isolation + public-OSS | By design out of scope | v1 single-tenant (`SECURITY.md:251`) |
| R8 | **RLS not propagated on the default PBI DAX path** | Partial | MS blocks SP + RLS; SP mode returns unscoped rows; RLS only with OBO `userAssertion` (`powerbiDatasetClient.js:220-228`). OLS unhandled. |
| R9 | Prompt-injection filter is heuristic; no model-level red-team classifier | Defence-in-depth | Adversarial chart-label injection acknowledged unguarded (`SECURITY.md:119-122`) |
| R10 | No mTLS / request signing / CVE PR gate / data-residency control | Roadmap | "Honest gaps" (`SECURITY.md:247-251`) |

**The three an exec should hear first:** R8 (RLS gap on the default DAX path), R3 (no SIEM/multi-instance), R4 (no factual-accuracy scoring yet).

---

## 6 · BENEFIT — per stakeholder (tied to market reality, see §7)

| Stakeholder | Benefit | Why it's real (internal) | Market tie (§7) |
|-------------|---------|--------------------------|------------------|
| Architecture / procurement | **No vendor lock-in** | 2-axis design decouples BI tool from AI brain (§2.1/§2.2) | PBI Copilot & Tableau Agent **forbid BYO-LLM**; OSI signals the market itself going vendor-neutral on semantics |
| Finance | **Reuse existing spend; no new licence** | Orchestrates owned Genie/FM/UC/BI; only new cost = small support team + pass-through compute | Fabric Copilot Capacity / Tableau+ are *add-on* spend; PulsePlay avoids a new per-seat AI licence |
| Security | **Central governance** | One proxy holds tokens, allow-lists, masking, audit (§4) | One trust contract across tools vs each vendor's siloed trust layer; aligns to NIST RMF / CSA Agentic Trust |
| End users | **One experience across every dashboard** | Same AI Insights / Ask Pulse / Workbench regardless of vendor | Directly addresses multi-tool sprawl that incumbents ignore (they only serve their own canvas) |
| Decision-makers | **Trusted, status-tagged answers** | 4-status contract emitted by the validator, never the LLM (§4.8) | Rides the **~5.5/10 confidence gap**; "deterministic, fail-loud, cited" is the board/auditor use case dbt's benchmark endorses |

---

## 7 · COMPETITIVE / MARKET positioning
> *From Lane D (online, May 2026), reconciled against `docs/research/MARKET_AND_STANDARDS.md`.*

### 7.1 Native vendor AI — strength vs the multi-tool limitation
| Vendor AI | Strong at | Structural limit for a multi-tool org |
|-----------|-----------|----------------------------------------|
| **Power BI Copilot / Fabric** | DAX gen, narrative summaries, page generation; quality scales with semantic-model metadata | Wired to Azure OpenAI — **cannot bring your own model**; sees only the connected model; per-tenant, PBI-only governance |
| **Tableau Pulse / Agent** | Best embed SDK; Enhanced Q&A, narratives, Einstein Trust Layer + zero-retention | Tableau states a Salesforce-managed LLM **"isn't supported"** — the team picks the model; locked to the Tableau surface |
| **Qlik Answers / Insight Advisor** | Agentic, RAG-grounded answers **with citations**; GA + MCP server early 2026 | Open on X (your AI → their data) but **not on Y**; grounding/governance live inside Qlik only |
| **ThoughtSpot Spotter (+ Semantics)** | "Search-token → SQL, not raw text-to-SQL" → traceable, low-hallucination; Metrics Catalog kills drift | Single-vendor canvas; closest in philosophy, but not multi-tool |
| **Databricks Genie (direct)** | NL over UC-governed data; inherits row/col security; reasoning traces | **Structured data only**; a data-side agent, not a multi-BI front door; acknowledges multi-turn hallucination risk |

**Confirmed in the vendors' own words:** none of the incumbents lets you fully **replace the AI brain while keeping their BI surface** (explicit for Power BI & Tableau). That is PulsePlay's clearest gap to occupy.

### 7.2 The trend PulsePlay rides
Semantic layer + governed NL-to-SQL + cited/trusted answers is *the* 2025-26 BI+AI direction. Gartner projects **~40% of analytics queries NL-generated by 2026**, yet surveyed data teams rate confidence in AI query results at **~5.5/10** — the **trust gap** is the headline problem. The cross-vendor response is the **Open Semantic Interchange (OSI)** spec — v1.0 finalized **27 Jan 2026** (Apache-2.0, YAML), backed by Snowflake, **Databricks, Qlik**, dbt Labs, AtScale, Salesforce — a vendor-neutral way to share metric/policy definitions with AI agents. *Action: PulsePlay's KB v2 provider-aware translator should track OSI as an input format.*

### 7.3 Is the 4-status trust contract aligned with industry direction? — **Yes, strongly**
- **Determinism + fail-loud beats clever text-to-SQL.** dbt's 2026 benchmark: semantic-layer answers hit **98–100% in-scope and fail with an error** rather than silently wrong; raw text-to-SQL is "plausible but incorrect" **~10–16%** of the time even on frontier models.
- **Confidence thresholds + blocking** are standard (AWS blocks below ~0.85 groundedness; finance ~0.9). **NIST AI RMF + GenAI Profile** and CSA's **Agentic Trust Framework (Feb 2026)** push "never present ungrounded output as fact."
- PulsePlay's **Verified / Grounded-draft / Suggestion / Blocked** maps ~1:1. **The differentiator:** PulsePlay applies *one* trust contract **across every vendor surface**; Qlik/ThoughtSpot/Genie each apply their own only within their own walls.

### 7.4 Honest competitive positioning
**Genuinely differentiated:**
- **Multi-BI host (Y-axis) is still an empty category** — no major vendor hosts a rival's canvas.
- **The (X × Y) combination** — Power BI Monday, Tableau Tuesday, *same approved brain* — nobody offers this.
- **One trust/governance contract spanning vendors** (central, not per-tool).
- **Bring-your-own-brain over surfaces that forbid it** (PBI, Tableau) — vendor-confirmed.

**Where incumbents already suffice (say this in the room):**
- **Single-vendor shops** get a faster, deeper native experience from Copilot / Tableau Agent. PulsePlay adds little there.
- **X-axis pluralism alone is no longer unique** — Qlik, ThoughtSpot, Sigma, Sisense all ship MCP "your-AI-our-data." PulsePlay's edge is plurality **across multiple vendors at once**, not plurality per se.
- **Grounding/citations are now table stakes** — PulsePlay must be *as good*, not assume it's ahead.

**Key sources (live May 2026):** Power BI Copilot semantic models (learn.microsoft.com); Tableau Agent FAQ "Salesforce-managed LLM isn't supported" (help.tableau.com); Qlik GA + MCP (qlik.com press); ThoughtSpot Spotter Semantics (thoughtspot.com press); Databricks Genie release notes 2026 (learn.microsoft.com); OSI finalized (snowflake.com blog); dbt semantic-layer vs text-to-SQL benchmark (docs.getdbt.com); NIST AI RMF (nemko/NIST).

### 7.5 Stale items to fix in `MARKET_AND_STANDARDS.md`
1. **Qlik MCP** "announced / early 2026" → now **GA (Feb 2026)** with the third-party-assistant MCP server. Update tense.
2. **Tableau** — add the explicit **"Salesforce-managed LLM isn't supported"** quote; it's the strongest BYO-brain evidence available.
3. **Add OSI (27 Jan 2026)** — a vendor-neutral *semantic* standard that complements the MCP thesis and validates PulsePlay's neutrality bet.
4. **ThoughtSpot Spotter Semantics (Mar 2026)** — capture the "search-token, not text-to-SQL, no-hallucination" mechanism as the trust bar competitors now set.

---

## 8 · MATURITY verdict — what to commit to vs frame as roadmap

**Commit to (shipped + tested):**
- The 2-axis architecture; 10 AI connector paths; the connector-agnostic proxy backbone.
- Power BI as a real SDK integration + the $0-token semantic-model DAX path.
- AI Insights, Ask Pulse, Workbench; native panel chrome with light/dark theming.
- Governance backbone: server-side tokens, allow-lists, masking/redaction, the 4-status trust contract.

**Frame as roadmap (do NOT claim done):**
- Deep SDK adapters for Tableau/Qlik/Looker (iframe today).
- Factual-accuracy scoring / ground-truth eval (structure is validated; correctness is not scored).
- Independent multi-source side-by-side comparison; the `proxy/connectors/` plugin system; streaming everywhere; SIEM-wired audit / multi-instance rate-limit; multi-tenant; public-OSS.

**One-sentence honest verdict:** *PulsePlay's architecture, governance backbone, and the Power BI + Genie experience are solid and tested; it is decision-support with an explicit trust status, not an oracle — and everything beyond Power BI on the BI axis is genuine roadmap.*

---

## Appendix A — CLAUDE.md / doc over-claims found (fix-list)
1. **`proxy/connectors/` plugin system does not exist.** `connectorManifests.js:1-14` is a *hardcoded* manifest describing routes already wired in `server.js`; "NO physical route extraction." Plugin system = ROADMAP. (CLAUDE.md "Status" implies it's scaffolded.)
2. **DuckDB-WASM** is listed as an available capability but is **not imported** in `playground/src` today.
3. **`docs/research/CODEBASE_AUDIT.md` is stale** (2026-05-10 / `5e1036d`): "8 backend paths", "~7 playground files", "server.js 4,298 lines". Reality at HEAD: 10 paths, dozens of dirs, `server.js` ≈ 8,500 lines. Use it for *posture*, not counts.
4. **Trust validator location:** it's frontend (`artifactValidator.ts` / `artifactStatus.ts` / `TrustBadge.tsx`), **not** `insightsValidator.js`. Earlier briefing prose implied the latter.
5. **Dark mode** is genuinely shipped (`styles.css:106` `data-pp-theme`) — a research lane initially mis-reported it absent by searching the wrong selector; verified present. No fix needed; recorded to prevent re-litigation.

## Appendix B — Method & provenance
Four research lanes at HEAD `4436b0f`, all completed: (A) capability inventory, (B) efficiency mechanisms, (C) security/governance + risk — offline, file:line evidence; (D) market/competitive — online, ~10 cited sources reconciled against `MARKET_AND_STANDARDS.md`. Conflicts between lanes were resolved by direct verification (see Appendix A #5). This is an internal analysis doc; the customer-facing briefing pack lives in `docs/briefing/` and should be reconciled against §8's commit/roadmap split before the next pitch.
