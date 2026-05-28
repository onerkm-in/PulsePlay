# PulsePlay Deep-Dive: Challenge, Benefit, Efficiency, Capability (plus Risk, Security, Competitive, Maturity)

> **Date:** 2026-05-28. **Verified at HEAD** `4436b0f` (branch `codex/f5-g0-native-layout-2026-05-21`).
> **Method:** four research lanes. Three were offline (in-repo, with file:line evidence) and one was online (market and standards). Every capability is tagged **SHIPPED / PARTIAL / ROADMAP** and cited.
> **Posture:** brutally honest. This document exists so the briefing survives executive cross-examination. Where CLAUDE.md or older docs over-claim, it is called out here (see Appendix A).

---

## 0. How to read this

- **SHIPPED**: wired and exercised in code at HEAD, with a file:line citation.
- **PARTIAL**: real, but with a material limit (regex-only, in-memory, single-source, and so on).
- **ROADMAP**: described or intended, but not in the code today.
- The four lenses the briefing must nail are Challenge, Benefit, Efficiency, and Capability. This document adds the rest: Security and Governance, an honest Risk Register, Competitive positioning, and a Maturity verdict.

---

## 1. CHALLENGE: the problem, and the hard bets

**The problem PulsePlay solves.** The organisation runs several BI tools (Power BI, Tableau, Qlik, Looker) and owns several AI services (Databricks Genie, Mosaic Foundation Models and agents, Azure OpenAI, AWS Bedrock). Yet every AI capability is trapped inside the tool that ships it. Power BI's AI only sees Power BI, you cannot bring your own approved model or governed Genie space, the "ask the data" experience differs from tool to tool, and governance fragments because each tool mints its own tokens.

**The hard bets PulsePlay makes, and why they are hard:**

1. **Vendor-neutral without becoming lowest-common-denominator.** Host any BI surface, yet still offer a deep experience (a real Power BI SDK today; others embed).
2. **Trustworthy answers.** Never present ungrounded output as fact. The status contract is enforced in code, not in the model's output (see Section 4, control 8).
3. **Orchestrate, do not rebuild.** No new LLM, agent framework, or warehouse; PulsePlay calls what the organisation already owns. The cost of this bet is that PulsePlay's value is choreography and governance, not a model moat.

> The honest counterweight to every "challenge solved" is the Risk Register in Section 5. Read the two together.

---

## 2. CAPABILITY: what is actually shipped

### 2.1 AI connector backend paths (axis X): 10 of 10 SHIPPED

CLAUDE.md's claim of 10 backend paths is accurate. Each has a live route in `proxy/server.js` (note: not in a `proxy/connectors/` folder, see Appendix A):

| # | Connector | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Databricks Genie | SHIPPED | default path `/assistant/conversations/start` |
| 2 | Azure OpenAI (chat) | SHIPPED | `server.js:5432`, `/openai/conversations/start` |
| 3 | Azure OpenAI (analytics) | SHIPPED | same route, `mode:'analytics'`, via `llmOrchestrator.js` |
| 4 | Bedrock Retrieve and Generate (RAG) | SHIPPED | `server.js:5687`, `bedrock.js:95` |
| 5 | Bedrock InvokeModel (direct) | SHIPPED | `bedrock.js:154` (native SigV4, no SDK) |
| 6 | Mosaic Foundation Model | SHIPPED | `server.js:6501`, `/foundation/section`, `foundationModelClient.js:125`; plus streaming `/foundation/conversations/start-stream` `server.js:6841` |
| 7 | Supervisor (real endpoint) | SHIPPED | `server.js:7938` |
| 8 | Supervisor (local fan-out) | SHIPPED | `server.js:7922` (fans out across spaces, Genie-bound) |
| 9 | Mosaic ResponsesAgent | SHIPPED | `server.js:7077`, `/responses-agent/chat` |
| 10 | Power BI semantic-model (no-LLM DAX) | SHIPPED | `server.js:3203,3364`; `powerbiDaxTemplates.js`, `powerbiDatasetClient.js` |
| + | Power BI Q&A embed surface | SHIPPED | `server.js:6435`, `/powerbi/qna/embed-token` (Microsoft NLP in the Microsoft tenant; PulsePlay mints the token only) |

### 2.2 BI vendor adapters (axis Y)

| Vendor | Status | Evidence |
|--------|--------|----------|
| **Power BI** | **SHIPPED (real SDK)** | `bi-adapters/powerbi/index.ts:35` imports `powerbi-client` (`playground/package.json:18`) |
| Native result canvas (PulsePlay-own, ECharts) | SHIPPED | `native/NativeBIAdapter.ts:53` |
| Databricks AI/BI | PARTIAL | iframe stub (`databricks-aibi/index.ts:89`), but the server-side token mint is real (`server.js:4358`) |
| Tableau, Qlik, Looker, generic-iframe | STUB (iframe) | each extends `GenericIframeAdapter`; vendor SDKs are intentionally not installed (`package.json:43`) |

This matches CLAUDE.md's honest "stubs are not production" disclaimer.

### 2.3 AI surfaces: SHIPPED

- **AI Insights** briefings. The section taxonomy is enforced in `proxy/lib/insightsValidator.js:270` (HEADLINE, KPI, TRENDS, RISKS, OPPORTUNITIES, RECOMMENDED ACTIONS, DRIVERS).
- **Ask Pulse** Q&A, in `UnifiedAssistantSurface.tsx` and `playground/src/pulse/`.
- **Workbench** (3 tabs, SQL and markdown sections, presets), in `playground/src/workbench/` and `components/workbench/`; presets live in `pulse/insightsPresetLibrary.ts`.

### 2.4 Native BI panel: SHIPPED (with one nuance)

- `pp-bi-panel` native chrome: `BIPanel.tsx:208`.
- `--pp-*` design tokens: `styles.css:9-43`. Dark mode is SHIPPED via `:root[data-pp-theme="dark"]` at `styles.css:106`, driven by `themeSync.ts` from the Settings toggle (`PreferencesAppearance.tsx`), applied before first render at `main.tsx:34`, and test-pinned in `themeSync.test.ts`.
- The 3-peer-tab model and single-pane float/dock: `PulsePlayScreen.tsx:50-53`.
- Nuance on "side-by-side": a `BITileGrid` renders 1, 2, and 2x2 layouts (`App.tsx:2899-2906`), but all tiles share one `embedConfig`. That is same-source, different-view, not independent multi-source comparison. Independent multi-source side-by-side is ROADMAP (item K.2). The briefing's framing of "side-by-side comparison is roadmap" is therefore correct: the same-source tile grid exists, but it is not a multi-dashboard compare.

---

## 3. EFFICIENCY: token, cost, latency, capital

> **Bottom line up front.** The only ground-truth-measured saving is the $0-token Power BI DAX path, which is provable per request via an `llmCallCount:0` audit line. Everything else is sound efficiency design (caching, conversation reuse, code-splitting, perceived-latency staging), but it carries no before-and-after benchmark in the repo. "Fewer tokens, better accuracy" is an instrumented consumption gauge (estimated for Genie), not a demonstrated reduction against a baseline. Say it that way.

| Mechanism | Status | Evidence and honest note |
|-----------|--------|--------------------------|
| **$0-token deterministic DAX path** | SHIPPED (measured) | `startPowerBiConversation` (`server.js:6248-6426`) imports and calls no LLM; the matcher is `powerbiQuestionMatcher.js:290-350`; templates are `powerbiDaxTemplates.js:97-229`; the audit emits `mode:"powerbi-deterministic", llmCallCount:0` (`server.js:6394-6396`). **Caveats:** it answers at global scope, so RLS and OLS are not propagated (`server.js:6381-6388`); only 4 templates exist, and unmatched questions return a suggestion list (also $0). |
| Right-brain-per-task routing | PARTIAL (config, not dynamic) | A static branch on `profile.type` (`server.js:3203-3204`); the translator is chosen via `getTranslator()` (`promptDispatcher.js:56`). "Route to the cheapest adequate backend" is an operator configuration choice, not an automated decision. **Do not claim dynamic routing.** |
| Server-side staged "1-then-3" fan-out | SHIPPED | `sectionedOrchestrator.js:36-50,72-75`: HEADLINE first, then parallel sections, all reusing one shared `conversation_id`. |
| Zero-token pre-flight gating | SHIPPED | `discoveryEngine.js:19` fuses schema, metadata, and pack KPIs with "No LLM calls. No SQL execution", and greys out unreachable frames before any spend. |
| Client staged reveal | SHIPPED (UX only) | `pulse/state/stagedReveal.ts` reveals an already-generated single-shot answer on a schedule. It improves perceived latency only; there is no token saving (its own header notes that re-querying "would multiply cost and latency by N"). |
| Caching and reuse | SHIPPED (un-benchmarked) | `cfg()` has a 30s TTL (`server.js:379-419`); `discoveryEngine` has a 60s cache; the client `insightsCache.ts` uses a localStorage TTL that survives a report reopen. |
| Sustainability and token gauge | SHIPPED (consumption, not carbon) | `SustainabilityIndicator.tsx` reads `usageTracker.ts`: session token totals, real when the backend reports usage (OpenAI, Foundation Model, Bedrock), and estimated as `chars/4` for Genie (`usageTracker.ts:101-129`). The UI shows a tilde and an "est." marker; tiers run from lean (up to 2k) to very-heavy (over 50k). No carbon or energy claim exists in code: it measures consumption, not savings against a baseline. |
| Bundle efficiency | SHIPPED | Vite `manualChunks` (`vite.config.ts:83-108`); lazy adapter `import()` (`registry.ts:83-119`); heavy libraries imported on first use (`insightsExporters.ts:256-280`). Note: no DuckDB-WASM is imported today (a CLAUDE.md over-claim). |

---

## 4. SECURITY AND GOVERNANCE: controls

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| 1 | Server-side embed-token issuance | SHIPPED (Power BI and AI/BI); ROADMAP (others) | `server.js:4328`, `/assistant/embed-token/:vendor`; the Power BI mint is at `server.js:3963`; the secret "NEVER appears in responses, audit logs, or cache key" (`server.js:3973-3975`); a browser-supplied RLS identity is rejected (`server.js:3997`) |
| 2 | Prompt sanitisation and injection-keyword stripping | SHIPPED (defence-in-depth) | `promptRedaction.ts:23-44,124,153`; it describes the vendor prompt-hierarchy as the real fence |
| 3 | PII and field masking | SHIPPED (defence-in-depth only) | `masking.ts:5-10` states verbatim that this is not a security guarantee, and that Unity Catalog column masks at the data layer are the real control |
| 4 | Allow-lists (origin, vendor, profile; fail-closed) | SHIPPED | `allowlist.js:135-145,156-163`; production refuses to start without one |
| 5 | SQL DML gate | PARTIAL (regex) | `sqlExecutor.js:115-134`, `sqlSectionPreview.js:48-166`; the real fence is a Unity Catalog SELECT-only warehouse role (`SECURITY.md:116`) |
| 6 | Rate limit and audit log | PARTIAL (in-memory and console) | a per-IP Map at 120 per minute, single-process (`server.js:1853-1890`); the audit is `console.log('[audit]')` (`server.js:2058`). There is no SIEM wiring, and it is not multi-instance-safe. |
| 7 | Auth modes | SHIPPED | `none`, `idp`, `shared-key`, `idp-or-shared-key` (`server.js:1498`); it refuses `none` in production (`server.js:1685-1694`). The Databricks Apps deployment runs with `PROXY_AUTH_MODE:"none"` (`app.yaml:18-19`), gated by the Databricks platform URL auth. |
| 8 | The 4-status trust contract | SHIPPED (frontend, validator-emitted) | `artifactValidator.ts:6-9` states the status is emitted by the validator and never by the LLM; `llmClaimedStatus` is recorded but never authoritative (`:36-42`); labels are in `artifactStatus.ts:19-24` and rendered by `TrustBadge.tsx`. This is distinct from `insightsValidator.js`, which is a section-shape checker. |

**Net posture.** PulsePlay is honestly a defence-in-depth pane of glass. The load-bearing fences are the organisation IdP, Unity Catalog policy, and vendor RBAC (`SECURITY.md:279-281`). The trust-status contract and the server-side token issuance are genuinely shipped and test-pinned.

---

## 5. RISK REGISTER: the honest gaps (read with Section 1)

| # | Risk | Status | Detail |
|---|------|--------|--------|
| R1 | Field masking is prompt-context only, not the data boundary | Defence-in-depth | The real control is Unity Catalog column masks (`masking.ts:5-10`) |
| R2 | The SQL DML gate is regex-based and bypassable | Partial | It relies on a UC SELECT-only role (`sqlExecutor.js:115`) |
| R3 | Rate limit and audit are in-memory and console only | Partial | No SIEM, not multi-instance-safe; per-user limits are pending (`server.js:1855,2058`) |
| R4 | AI answer quality is validated for structure, not factual correctness | Roadmap | There is no ground-truth evaluation suite (`SECURITY.md:249`) |
| R5 | Vendor adapters are stubs except Power BI | Partial | Tableau, Qlik, and Looker are iframe-only |
| R6 | Free-Edition hosting runtime cap | Operational | The app auto-stops on idle, and a daily restart cap blocks redeploys (observed 2026-05-28) |
| R7 | Multi-tenant isolation and public-OSS | Out of scope by design | v1 is single-tenant (`SECURITY.md:251`) |
| R8 | RLS not propagated on the default Power BI DAX path | Partial | Microsoft blocks Service-Principal plus RLS; SP mode returns unscoped rows; RLS is honoured only with an OBO `userAssertion` (`powerbiDatasetClient.js:220-228`). OLS is unhandled. |
| R9 | The prompt-injection filter is heuristic; there is no model-level red-team classifier | Defence-in-depth | Adversarial chart-label injection is acknowledged as unguarded (`SECURITY.md:119-122`) |
| R10 | No mTLS, request signing, CVE PR gate, or data-residency control | Roadmap | These are listed as honest gaps (`SECURITY.md:247-251`) |

**The three an executive should hear first:** R8 (the RLS gap on the default DAX path), R3 (no SIEM and no multi-instance support), and R4 (no factual-accuracy scoring yet).

---

## 6. BENEFIT: per stakeholder (tied to market reality, see Section 7)

| Stakeholder | Benefit | Why it is real (internal) | Market tie (Section 7) |
|-------------|---------|---------------------------|-------------------------|
| Architecture and procurement | **No vendor lock-in** | The 2-axis design decouples the BI tool from the AI brain (Sections 2.1 and 2.2) | Power BI Copilot and Tableau Agent forbid bring-your-own-LLM; the OSI standard signals that the market itself is going vendor-neutral on semantics |
| Finance | **Reuse existing spend; no new licence** | It orchestrates the Genie, Foundation Model, Unity Catalog, and BI assets already owned; the only new cost is a small support team plus pass-through compute | Fabric Copilot Capacity and Tableau+ are add-on spend; PulsePlay avoids a new per-seat AI licence |
| Security | **Central governance** | One proxy holds tokens, allow-lists, masking, and audit (Section 4) | One trust contract across tools, versus each vendor's siloed trust layer; it aligns to the NIST RMF and CSA Agentic Trust framework |
| End users | **One experience across every dashboard** | The same AI Insights, Ask Pulse, and Workbench surfaces regardless of vendor | It directly addresses the multi-tool sprawl that incumbents ignore, since each one serves only its own canvas |
| Decision-makers | **Trusted, status-tagged answers** | The 4-status contract is emitted by the validator, never by the LLM (Section 4, control 8) | It rides the roughly 5.5-out-of-10 confidence gap; "deterministic, fail-loud, cited" is the board and auditor use case that dbt's benchmark endorses |

---

## 7. COMPETITIVE AND MARKET positioning

> From Lane D (online, May 2026), reconciled against `docs/research/MARKET_AND_STANDARDS.md`.

### 7.1 Native vendor AI: strength versus the multi-tool limitation

| Vendor AI | Strong at | Structural limit for a multi-tool organisation |
|-----------|-----------|--------------------------------------------------|
| **Power BI Copilot / Fabric** | DAX generation, narrative summaries, page generation; quality scales with semantic-model metadata | Wired to Azure OpenAI, so you cannot bring your own model; it sees only the connected model; governance is per-tenant and Power-BI-only |
| **Tableau Pulse / Agent** | The best embed SDK; Enhanced Q&A, narratives, the Einstein Trust Layer, and zero retention | Tableau states that a Salesforce-managed LLM "isn't supported", so the team picks the model; it is locked to the Tableau surface |
| **Qlik Answers / Insight Advisor** | Agentic, RAG-grounded answers with citations; GA plus an MCP server in early 2026 | Open on X (your AI reaching their data) but not on Y; grounding and governance live inside Qlik only |
| **ThoughtSpot Spotter (plus Semantics)** | "Search-token to SQL, not raw text-to-SQL", which makes answers traceable and low-hallucination; the Metrics Catalog kills metric drift | A single-vendor canvas; closest in philosophy, but not multi-tool |
| **Databricks Genie (direct)** | NL over Unity-Catalog-governed data; it inherits row and column security; reasoning traces | Structured data only; it is a data-side agent, not a multi-BI front door, and it acknowledges multi-turn hallucination risk |

**Confirmed in the vendors' own words:** none of the incumbents lets you fully replace the AI brain while keeping their BI surface (this is explicit for Power BI and Tableau). That is the clearest gap for PulsePlay to occupy.

### 7.2 The trend PulsePlay rides

The semantic layer, governed natural-language-to-SQL, and cited, trusted answers are the dominant 2025-26 BI-plus-AI direction. Gartner projects that roughly 40 percent of analytics queries will be NL-generated by 2026, yet surveyed data teams rate their confidence in AI query results at about 5.5 out of 10. The trust gap is the headline problem. The cross-vendor response is the Open Semantic Interchange (OSI) specification, with v1.0 finalised on 27 January 2026 (Apache-2.0, YAML) and backed by Snowflake, Databricks, Qlik, dbt Labs, AtScale, and Salesforce. It is a vendor-neutral way to share metric and policy definitions with AI agents. Action: PulsePlay's KB v2 provider-aware translator should track OSI as an input format.

### 7.3 Is the 4-status trust contract aligned with industry direction? Yes, strongly

- **Determinism and fail-loud beat clever text-to-SQL.** In dbt's 2026 benchmark, semantic-layer answers reach 98 to 100 percent in-scope and fail with an error rather than returning a silently wrong result, whereas raw text-to-SQL is "plausible but incorrect" about 10 to 16 percent of the time even on frontier models.
- **Confidence thresholds plus blocking are standard.** AWS blocks below roughly 0.85 groundedness, and finance tightens to about 0.9. The NIST AI RMF and GenAI Profile, and CSA's Agentic Trust Framework (February 2026), all push the same principle: never present ungrounded output as fact.
- PulsePlay's Verified, Grounded-draft, Suggestion, and Blocked statuses map almost one-to-one onto this. The differentiator is that PulsePlay applies one trust contract across every vendor surface, whereas Qlik, ThoughtSpot, and Genie each apply their own only within their own walls.

### 7.4 Honest competitive positioning

**Genuinely differentiated:**

- Multi-BI host (the Y-axis) is still an empty category: no major vendor hosts a rival's canvas.
- The combination of BI vendor and AI brain (Power BI on Monday, Tableau on Tuesday, the same approved brain behind both) is something nobody else offers.
- One trust and governance contract spanning vendors (central, not per-tool).
- Bring-your-own-brain over surfaces that forbid it (Power BI, Tableau), now vendor-confirmed.

**Where incumbents already suffice (say this in the room):**

- Single-vendor shops get a faster, deeper native experience from Copilot or Tableau Agent. PulsePlay adds little there.
- X-axis pluralism alone is no longer unique. Qlik, ThoughtSpot, Sigma, and Sisense all ship an MCP "your AI, our data" option. PulsePlay's edge is plurality across multiple vendors at once, not plurality in itself.
- Grounding and citations are now table stakes. PulsePlay must be as good, not assume it is ahead.

**Key sources (live May 2026):** Power BI Copilot semantic models (learn.microsoft.com); the Tableau Agent FAQ, "Salesforce-managed LLM isn't supported" (help.tableau.com); Qlik GA plus MCP (qlik.com press); ThoughtSpot Spotter Semantics (thoughtspot.com press); Databricks Genie release notes 2026 (learn.microsoft.com); OSI finalised (snowflake.com blog); the dbt semantic-layer versus text-to-SQL benchmark (docs.getdbt.com); NIST AI RMF (nemko and NIST).

### 7.5 Stale items to fix in `MARKET_AND_STANDARDS.md`

1. **Qlik MCP** has moved from "announced, early 2026" to GA (February 2026), with the third-party-assistant MCP server. Update the tense.
2. **Tableau:** add the explicit "Salesforce-managed LLM isn't supported" quote; it is the strongest bring-your-own-brain evidence available.
3. **Add OSI (27 January 2026),** a vendor-neutral semantic standard that complements the MCP thesis and validates PulsePlay's neutrality bet.
4. **ThoughtSpot Spotter Semantics (March 2026):** capture the "search-token, not text-to-SQL, no-hallucination" mechanism as the trust bar competitors now set.

---

## 8. MATURITY verdict: what to commit to versus what to frame as roadmap

**Commit to (shipped and tested):**

- The 2-axis architecture, the 10 AI connector paths, and the connector-agnostic proxy backbone.
- Power BI as a real SDK integration, plus the $0-token semantic-model DAX path.
- AI Insights, Ask Pulse, and Workbench; the native panel chrome with light and dark theming.
- The governance backbone: server-side tokens, allow-lists, masking and redaction, and the 4-status trust contract.

**Frame as roadmap (do not claim it is done):**

- Deep SDK adapters for Tableau, Qlik, and Looker (iframe today).
- Factual-accuracy scoring and ground-truth evaluation (structure is validated; correctness is not scored).
- Independent multi-source side-by-side comparison; the `proxy/connectors/` plugin system; streaming everywhere; SIEM-wired audit and multi-instance rate-limiting; multi-tenant; and public-OSS.

**One-sentence honest verdict.** PulsePlay's architecture, governance backbone, and Power BI plus Genie experience are solid and tested; it is decision-support with an explicit trust status, not an oracle, and everything beyond Power BI on the BI axis is genuine roadmap.

---

## Appendix A. CLAUDE.md and doc over-claims found (fix-list)

1. **The `proxy/connectors/` plugin system does not exist.** `connectorManifests.js:1-14` is a hardcoded manifest describing routes that are already wired in `server.js` ("NO physical route extraction"). The plugin system is ROADMAP. CLAUDE.md's Status section implies it is scaffolded.
2. **DuckDB-WASM** is listed as an available capability but is not imported in `playground/src` today.
3. **`docs/research/CODEBASE_AUDIT.md` is stale** (2026-05-10, commit `5e1036d`): it says "8 backend paths", "about 7 playground files", and "server.js 4,298 lines". Reality at HEAD is 10 paths, dozens of directories, and a `server.js` of roughly 8,500 lines. Use it for posture, not for counts.
4. **Trust validator location.** It lives in the frontend (`artifactValidator.ts`, `artifactStatus.ts`, `TrustBadge.tsx`), not in `insightsValidator.js`. Earlier briefing prose implied the latter.
5. **Dark mode is genuinely shipped** (`styles.css:106`, `data-pp-theme`). A research lane initially reported it absent because it searched for the wrong selector; it was then verified present. No fix is needed; it is recorded here to prevent re-litigation.

## Appendix B. Method and provenance

There were four research lanes at HEAD `4436b0f`, all completed: (A) the capability inventory, (B) efficiency mechanisms, and (C) security, governance, and risk, all offline with file:line evidence; and (D) the market and competitive lane, online, with about 10 cited sources reconciled against `MARKET_AND_STANDARDS.md`. Conflicts between lanes were resolved by direct verification (see Appendix A, item 5). This is an internal analysis document. The customer-facing briefing pack lives in `docs/briefing/` and should be reconciled against the commit-versus-roadmap split in Section 8 before the next pitch.
