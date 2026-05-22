# PulsePlay — External References (signed)

> **Purpose.** A single, living catalogue of every web source the research-first workflow has consulted. Every entry carries a URL (the **signature**) so future sessions can re-verify or chase the source. Append-only — never reorder or remove entries.
>
> **Rule that produced this doc.** `feedback_research_first.md` — *"spawn multiple research agents to do check for more detailed reference and then we will brainstorm and resume the work"* + *"for above spawn agents for both online and offline assessment and review"*. Online-track agents accumulate web findings here; offline-track findings live elsewhere (code archaeology in `docs/research/<topic>_<date>.md`, screenshots in `D:\Working_Folder\Artifacts\Pulse_ref\`).
>
> **How to add entries.** When an agent returns web findings: append a section at the bottom with date header, topic, and one entry per source (URL · title · one-line takeaway · where applied). Don't merge with prior entries — even duplicate URLs go in again if a new context cites them, so the chain of consultation is auditable.

---

## Topic index (newest first)

- [2026-05-22 — Power BI Q&A readiness assessment + deprecation finding (CRITICAL)](#2026-05-22--power-bi-qa-readiness-assessment--deprecation-finding-critical)
- [2026-05-22 — G3 initial-render flicker: preventing CLS in staged AI chat reveal](#2026-05-22--g3-initial-render-flicker-preventing-cls-in-staged-ai-chat-reveal)
- [2026-05-22 — Databricks Genie + Unity Catalog column metadata propagation](#2026-05-22--databricks-genie--unity-catalog-column-metadata-propagation)
- [2026-05-22 — Azure App Service deep deployment findings](#2026-05-22--azure-app-service-deep-deployment-findings)
- [2026-05-22 — Azure App Service configuration challenges](#2026-05-22--azure-app-service-configuration-challenges)
- [2026-05-22 — Chart axis label humanization + value formatting (G2)](#2026-05-22--chart-axis-label-humanization--value-formatting-g2)
- [2026-05-22 — Auto-route vs click-to-switch when chart shape is wrong (G4)](#2026-05-22--auto-route-vs-click-to-switch-when-chart-shape-is-wrong-g4)
- [2026-05-22 — Azure Databricks Apps enterprise installation guide](#2026-05-22--azure-databricks-apps-enterprise-installation-guide)
- [2026-05-22 — Executive briefing card patterns (Ask Pulse narrative regression)](#2026-05-22--executive-briefing-card-patterns-ask-pulse-narrative-regression)
- [2026-05-22 — Chart rationale popover design (data-shape-aware narrative + warnings)](#2026-05-22--chart-rationale-popover-design-data-shape-aware-narrative--warnings)

---

## 2026-05-22 — Power BI Q&A readiness assessment + deprecation finding (CRITICAL)

**Context.** User asked "every leaf should be checked no leaf unturned" on Power BI Q&A readiness as an AI source for PulsePlay. 5 parallel agents (2 offline + 3 online) ran the full 7-step research-first cycle. **The single most important finding: Microsoft officially deprecated Power BI Q&A on 2025-12-01 with retirement on 2026-12-31.**

### Authoritative Microsoft sources (deprecation evidence)

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://powerbi.microsoft.com/en-us/blog/deprecating-power-bi-qa/ | Power BI Updates Blog — Deprecating Power BI Q&A (2025-12-01) | **OFFICIAL ANNOUNCEMENT.** Q&A retired entirely December 2026. ALL surfaces (reports / dashboards / mobile / embedded / Q&A Setup). Migration target: Copilot. | The single most-load-bearing fact in this research |
| https://mc.merill.net/message/MC1218421 | Microsoft 365 Message Center notice MC1218421 (2026-01-16) | Tenant-admin notice with hard end-of-life 2026-12-31. Includes the `powerbi.qna.embed()` JS SDK path. | Confirms enterprise-customer-facing sunset date |
| https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-copilot-enhancements | Microsoft Learn — Enhance Q&A with Copilot | Microsoft's named migration path. Q&A docs now lead with red deprecation banner. | Migration architecture target |
| https://learn.microsoft.com/en-us/power-bi/developer/embedded/qanda | Microsoft Learn — Q&A in Power BI embedded analytics | Embed surface: `type:'qna'`, single dataset only, two modes (Interactive / ResultOnly). Auth: AAD token OR embed token. | The specific surface PulsePlay implements at `/powerbi/qna` |
| https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/embed-q-and-a | Microsoft Learn — Embed a Q&A visual (JS SDK reference) | `ILoadQnaConfiguration` shape; `setQuestion(string): Promise<void>`; `visualRendered` event; **no new features 2024-2026** (pure maintenance mode). | Confirms zero Microsoft investment in Q&A SDK |
| https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-tooling-advanced | Microsoft Learn — Edit Q&A linguistic schema | `.lsdl.yaml` format, authored in Power BI Desktop ONLY, no programmatic deploy API. **Now opens with deprecation banner.** | Why investing in linguistic-schema tooling is a stranded asset |
| https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-limitations | Microsoft Learn — Q&A limitations | Object-level security unsupported on AAS live-connect; composite models only index import/DirectQuery; opaque "We weren't able to load suggestions" failures. | Practical failure modes |
| https://learn.microsoft.com/en-us/power-bi/developer/embedded/embed-tokens | Microsoft Learn — Permission tokens for embed | A/EM/P-SKU for embed-for-customers; F64+/Pro/PPU for embed-for-organization. Q&A NOT "free" for SaaS. | Licensing reality check |
| https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-introduction | Microsoft Learn — Copilot for Power BI overview | Migration target. Available F2+ since 2025-04-28. **NOT yet supported in App-Owns-Data / embed-for-customers JS SDK**. | The migration gap that creates a "dead zone" risk |
| https://learn.microsoft.com/en-us/fabric/enterprise/fabric-copilot-capacity | Microsoft Learn — Fabric Copilot Capacity | F2+ availability for Copilot (loosened 2025-04-28). Excludes trial SKUs. Region-gated. | Copilot license gating for the migration |
| https://learn.microsoft.com/en-us/power-bi/developer/embedded/cloud-rls | Microsoft Learn — Cloud RLS with embedded | `effectiveIdentity` (username + roles) passed at `GenerateToken` time; RLS applies to Q&A queries. | RLS is supported; that's not the issue |
| https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/refresh-token | Microsoft Learn — Refresh access token in Power BI embedded | Embed-for-customers (app-owns-data) does NOT support automatic token refresh in client ≥2.20.1. Multi-tenant SaaS must hand-roll. | PulsePlay's existing 5-min-before-expiry refresh in PowerBiQnA.tsx is correct |
| https://powerbi.microsoft.com/en-us/blog/power-bi-january-2026-feature-summary/ | Power BI January 2026 Feature Summary | Wave 2 release notes confirming Copilot consolidation. Zero Q&A entries. | Microsoft investment signal (silence on Q&A is the signal) |

### Practitioner + community sources

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://www.magnetismsolutions.com/news/power-bi-qampa-to-retire-by-december-2026-what-you-need-to-know | Magnetism Solutions — Power BI Q&A to Retire | Independent confirmation of Dec 2026 sunset. | Validates Microsoft announcement |
| https://sumproduct.com/news/no-more-qa-in-power-bi/ | SumProduct — No More Q&A in Power BI | MVP reaction: matter-of-fact, no nostalgia. | Sentiment signal: community already moved on |
| https://medium.com/@kyle.hale/the-5-key-differences-between-databricks-genie-and-power-bi-copilot-67ea663e128e | Kyle Hale (Databricks) — Genie vs Power BI Copilot | Genie answers across full semantic model + emits SQL; Copilot is scope-bounded to existing visuals. **Q&A isn't even in his shortlist** — already legacy. | Comparative strategic context |
| https://community.fabric.microsoft.com/t5/Developer/Embedded-Q-amp-A-only-displays-quot-We-weren-t-able-to-load/m-p/327419 | Fabric Community — Embedded Q&A loading failures | Opaque "We weren't able to load suggestions" failures, no usable error envelope. | Failure mode in production |
| https://github.com/microsoft/powerbi-client-react | microsoft/powerbi-client-react (official) | Lists `qna` as supported type. v2.0.0 (Jan 2025) is last release; no Q&A-specific changes. **No dedicated Q&A sample in the official demo.** | Microsoft's own investment signal |
| https://venturebeat.com/data-infrastructure/snowflake-launches-cortex-analyst-an-agentic-ai-system-for-accurate-data-analytics | VentureBeat — Snowflake Cortex Analyst (vendor benchmark) | Cortex Analyst ~90% accuracy vs Genie ~79% vs raw GPT-4o ~51% on text-to-SQL. Q&A not benchmarked. | Q&A is pre-LLM technology |
| https://www.neenopal.com/blog/NaturalLanguageProcessing | NeenOpal — Q&A NLP analysis | Q&A's traditional NLP cannot reason, cannot multi-step, depends on hand-tuned synonyms. | Q&A's intrinsic ceiling |
| https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-best-practices | Microsoft Learn — Q&A best practices | Linguistic schema authoring "requires time and effort" with ongoing synonym maintenance. | Why authoring is high-cost low-payback |
| https://arxiv.org/abs/2404.14618 | arXiv 2404.14618 — Small model fallback / cost routing | Up to 40% fewer big-model calls with hybrid routing. Patterns apply to LLM-LLM, not Q&A-LLM. | Hybrid pattern doesn't help here |

### PulsePlay in-tree state (offline-agent findings)

**Already implemented (75% scaffolded):**

| Layer | Where | Status |
|---|---|---|
| Proxy route | [proxy/server.js:5969](../../proxy/server.js) `POST /powerbi/qna/embed-token` | Production-ready. `llmCallCount: 0` audit-logged. |
| Embed-token mint | [proxy/lib/powerbiDatasetClient.js:342](../../proxy/lib/powerbiDatasetClient.js) `generateQnAEmbedToken()` | Calls `/v1.0/myorg/groups/{id}/datasets/{id}/GenerateToken`. Supports RLS. |
| Connector manifest | [proxy/lib/connectorManifests.js:98](../../proxy/lib/connectorManifests.js) `powerbi-dataset-qna` | Marked `maturity: "beta"`, `capabilities.llm: false`. |
| Frontend client | [playground/src/lib/powerbiQnAClient.ts](../../playground/src/lib/powerbiQnAClient.ts) | Sanitizes profile names; handles Problem+JSON errors. |
| Embed component | [playground/src/components/PowerBiQnA.tsx](../../playground/src/components/PowerBiQnA.tsx) | Lazy-loads `powerbi-client` SDK; 5-min-before-expiry token refresh. |
| Full-page route | [playground/src/powerbi/PowerBiQnARoute.tsx](../../playground/src/powerbi/PowerBiQnARoute.tsx) | Mounted at `/powerbi/qna`. |
| Settings launcher | [playground/src/settings/groups/AiGroup.tsx](../../playground/src/settings/groups/AiGroup.tsx) | Conditional Leaf when `isPowerBiSemanticModel === true`. |
| Tests | proxy 5 + frontend 7 (total 12) | All passing. |

**Missing (25% — not catastrophic):**

| Layer | Where | Status |
|---|---|---|
| Pulse-tab integration | Pulse visual `activeTab` state machine | Would be 3rd tab alongside Chat / Insights. Deferred per HANDOVER. |
| Connector registry entry | [playground/src/pulse/backend/connectorRegistry.ts](../../playground/src/pulse/backend/connectorRegistry.ts) | Intentionally absent — Q&A isn't an "AI connector," it's Microsoft's NLP in their tenant. |
| Author first-time setup form | Settings UI | Today: must configure `powerbi-semantic-model` profile FIRST, then "Power BI Q&A" Leaf appears. |
| `/powerbi/qna/health` endpoint | proxy | Spec exists in S2 contract; not yet built. |
| **EOL countdown marker** | UI + docs | **NEW REQUIREMENT** — surface scheduled for retirement 2026-12-31; users + authors must know. |

### Synthesis takeaway

- **Microsoft retires Power BI Q&A on 2026-12-31.** 7 months from today. ALL surfaces — including the `powerbi.qna.embed()` JS SDK path PulsePlay uses.
- **PulsePlay's existing Q&A implementation is 75% complete** and production-ready for the next 7 months. The proxy embed-token mint, the React component, the full-page route — all work.
- **Practitioner community has already migrated to Copilot.** Zero recent (2025-2026) third-party Q&A case studies. No MVP defends Q&A. Microsoft has shipped no Q&A features since 2024.
- **Migration target (Copilot) has a gap:** Copilot is NOT yet supported in App-Owns-Data / embed-for-customers JS SDK. There may be a dead zone between Dec 2026 (Q&A off) and Copilot-for-ISV-embed ship date.
- **PulsePlay's `powerbi-semantic-model` backend (already shipped as #10)** is the durable replacement for "deterministic NL over PBI" use cases. No Microsoft dependency. No sunset.

### Decision recorded 2026-05-22 (pending user direction)

**Recommended path (all 5 agents converge):**

1. **Keep the existing Q&A surface as a tactical bridge through Dec 2026.** Don't delete what works.
2. **Add an EOL countdown to the UI** + a banner in Settings → AI → Power BI Q&A: *"Microsoft is retiring this feature on December 31, 2026. PulsePlay will continue to mint embed tokens until that date."*
3. **DO NOT invest in linguistic-schema authoring, featured-questions curation, or Q&A-specific tooling.** Stranded asset.
4. **DO NOT add Q&A to the Pulse-tab system as a permanent 3rd tab.** Acceptable as a transitional setting.
5. **Mark `proxy/connectors/powerbi-dataset-qna` as `EOL: 2026-12-31`** in the manifest. Plan deletion for Q1 2027.
6. **Plan Copilot-for-PBI-embed adoption** when Microsoft ships ISV/SaaS support. Until then, route durable "NL over PBI" through the existing `powerbi-semantic-model` backend.

---

## 2026-05-22 — G3 initial-render flicker: preventing CLS in staged AI chat reveal

**Context.** User reported the Ask Pulse briefing card "first sync was off" — initial render flicker, skeleton → partial → final visible jump. Offline agent mapped six concrete in-tree culprits; online agent researched industry consensus on streaming-response stability.

### Industry consensus sources

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://www.smashingmagazine.com/2026/04/designing-stable-interfaces-streaming-content/ | Smashing Magazine — Designing Stable Interfaces For Streaming Content | Five patterns: append-don't-rebuild, rAF buffering, defer-incomplete-structures, scroll-intent threshold, reduced-motion one-paint. | Streaming reveal architecture |
| https://web.dev/articles/content-visibility | web.dev — content-visibility | `content-visibility: auto` + `contain-intrinsic-size: auto <h>` — browser remembers last-rendered size, ideal for stacked briefing cards. | Section-card containment |
| https://web.dev/articles/defining-core-web-vitals-thresholds | web.dev — Defining Core Web Vitals Thresholds | CLS thresholds: 0.1 = good, 0.25 = needs improvement; internal data ≥ 0.15 perceived as disruptive. | Target CLS budget |
| https://uxpatterns.dev/glossary/s/skeleton-screen | UX Patterns — Skeleton Screen | Sizing rules: skeleton must match 95th percentile of content; skeletons shown < 300 ms INCREASE perceived disruption. | Skeleton sizing + min-latency gate |
| https://www.sitepoint.com/streaming-backends-react-controlling-re-render-chaos/ | SitePoint — Streaming Backends & React | Network layer should NEVER directly drive React renders. Buffer outside state, flush snapshots at display cadence. | Cadence-gated reveal pattern |
| https://www.erwinhofman.com/blog/skeleton-loading-and-perceived-performance-cro/ | Erwin Hofman — Skeleton Loading and Perceived Performance | < 300 ms loads anti-pattern; users prefer "instant partial content in a STABLE frame" over "slightly slower full render." | Justification for min-height pre-allocation |
| https://www.npmjs.com/package/react-loading-skeleton | react-loading-skeleton (npm) | Production sizing guidance for skeleton placeholders. | Reference implementation |
| https://playbook.ebay.com/design-system/components/loading-skeleton | eBay Playbook — Loading Skeleton | Match skeleton to FINAL content dimensions, not arbitrary widths. | Eliminates the 92/78/85% width mismatch in PulsePlay's current skeleton |
| https://help.tableau.com/current/online/en-us/pulse_intro.htm | Tableau — About Tableau Pulse | Insight cards have fixed-height frame with "empty insight" affordance — height preserved even when content sparse. | Pre-allocated frame pattern |
| https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-smart-narrative | Microsoft Learn — Create Smart Narrative | Desktop: placeholder symbols preserve height. Service: placeholders hidden (accepting small CLS at publish-time). | Two-mode rendering reference |
| https://react.dev/reference/react-dom/flushSync | react.dev — flushSync | Synchronous commit; useful to measure DOM before painting next stage. CAVEAT: breaks `<ViewTransition>` + conflicts with router `startTransition`. | Render-batching trade-off |
| https://react.dev/reference/react/ViewTransition | react.dev — ViewTransition | Animates state changes; pairs with `useTransition` for non-urgent reveals. | Optional perceptual polish |

### In-tree culprits (offline-agent findings)

| # | Where | What's wrong | Visibility |
|---|---|---|---|
| 1 | [visual.tsx:10493-10495](../../playground/src/pulse/visual.tsx) skeleton bars at 92% / 78% / 85% | Hardcoded widths don't match final content; visible horizontal jump on swap | HIGH |
| 2 | [visual.less:8123-8150](../../playground/src/pulse/style/visual.less) `.gn-insights-section` | No `min-height`. Placeholder ~49-65px; real content 70-120px+ → vertical jump on swap | HIGH (2-4× height variance) |
| 3 | [visual.less:3488-3490](../../playground/src/pulse/style/visual.less) `.gn-chart-container` | No `min-height`. ECharts mounts, container grows post-render | MEDIUM |
| 4 | [progressIndicator.tsx:50-66](../../playground/src/pulse/progressIndicator.tsx) → placeholder transition | Progress indicator collapses (~120px), cards above jump up before placeholder→content swap | MEDIUM |
| 5 | [visual.less:8131-8157](../../playground/src/pulse/style/visual.less) `.gn-insights-section` animation | 300ms reveal + 6px lift per section; React key change forces DOM recycle | LOW (subtle stutter) |
| 6 | [visual.tsx:10622](../../playground/src/pulse/visual.tsx) `renderSectionBody` | Body content height varies wildly per section type (prose / table / KPI strip / chart) — placeholder doesn't model the variance | HIGH |

### Synthesis takeaway

**Two complementary patterns** (online agent's recommendation):

1. **Pattern 1 (structural, kills CLS):** CSS Grid with `grid-template-rows` + `min-height` per row sized to 95th-percentile content. Skeleton placeholders render INTO the grid rows from the start; content swaps in place. `aspect-ratio` on chart slot + `content-visibility: auto` on section stack so browser memoizes per-section sizes after first render.

2. **Pattern 2 (perceptual, kills the "jump" feel):** Cadence-gated reveal driven OUTSIDE React state. Sections arrive into a buffer; rAF loop commits one stage per ~300 ms tick via `startTransition`. HEADLINE keeps "ship first" priority; rest reveals on fixed rhythm.

Pattern 1 is the cheaper, more durable fix. Pattern 2 makes the feel buttery. **Both compose without conflict.**

**Minimum-viable fix (offline agent's 2 small changes):**

- Add `min-height: 65px` to placeholder sections in CSS.
- Add `min-height: 350px` to `.gn-chart-container` (320 chart + 30 axis overflow).
- Bonus: unify skeleton bar widths to a single consistent `~90%` (eliminates horizontal micro-flicker).

**Acceptance signal:** Web Vitals CLS ≤ 0.1 on briefing render. Manual eye-test: no visible cards jumping during the skeleton → content transition.

---

## 2026-05-22 — Databricks Genie + Unity Catalog column metadata propagation

**Context.** Asked whether the "backend complement to G2" (UC `COMMENT` on columns) would actually translate to friendly chart labels in PulsePlay. Two research agents (offline in-tree + online Databricks docs) ran in parallel. Findings corrected three of my initial guesses.

### Authoritative Databricks sources

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://docs.databricks.com/aws/en/genie/best-practices | Databricks — Curate an effective Genie Space (Best practices) | *"Genie relies on quality table and column descriptions to understand what the data represents."* UC `COMMENT` IS consumed by Genie — but for prompt context, not result labels. | Corrects initial guess that UC comments weren't used |
| https://docs.databricks.com/aws/en/ai-bi/release-notes/2026 | Databricks — AI/BI release notes 2026 (April 2 entry) | Space authors can set `column_configs.display_name` on **stored** table/view columns. **"Display names appear in query results and in downloaded CSVs."** First-class friendly-label feature, shipped 2026-04-02. STORED COLUMNS ONLY. | The actual lever for backend-driven friendly labels |
| https://docs.databricks.com/aws/en/genie/knowledge-store | Databricks — Build a knowledge store for more reliable Genie Spaces | Knowledge store = friendly column names + canonical metrics + business definitions; scoped to space, doesn't overwrite UC. | Architecture layer for canonical labels |
| https://docs.databricks.com/aws/en/genie/tune-quality | Databricks — Tune Genie Space quality | Column synonyms + format assistance + edit descriptions are space-level annotations distinct from UC. | Space-level annotation surface |
| https://www.databricks.com/blog/data-dialogue-best-practices-guide-building-high-performing-genie-spaces | Databricks blog — From Data to Dialogue: Building High-Performing Genie Spaces | Example SQL queries act as "style templates" — Genie learns preferred alias styles but does NOT guarantee them for LLM-invented derived columns. | Justification for hybrid (backend + frontend) approach |
| https://github.com/databricks-solutions/vibe-coding-workshop-template/blob/main/data_product_accelerator/skills/semantic-layer/03-genie-space-patterns/SKILL.md | Databricks Solutions — Vibe Coding Workshop: Genie Space Patterns | Official guidance: synonyms belong in `column_configs[].synonyms`, NOT in UC `COMMENT` strings; UC `COMMENT` is for business definitions/grain/valid-values. | Separation of concerns between UC and Genie space |
| https://www.aimpointdigital.com/blog/talk-to-your-data-but-make-it-count-operationalizing-the-semantic-layer-in-databricks | Aimpoint Digital — Operationalizing the Semantic Layer in Databricks | Practitioner view: semantic layer is plumbing; presentation-layer humanization stays the consumer's responsibility. | Confirms frontend humanization as durable floor |

### Synthesis takeaway

- **UC `COMMENT` does NOT change rendered column names.** It feeds Genie's NL→SQL prompt context (helps Genie pick the right columns + write correct SQL) but doesn't replace the column name in the response shape.
- **The real friendly-label lever is `column_configs.display_name`** (Genie Space annotation, shipped 2026-04-02). Stored columns only — does NOT cover LLM-invented derived columns (the `prev_order_count`, `sales_change_pct`, `margin_change_pp` cases that motivated G2).
- **PulsePlay's plumbing is dead code.** [`genieSpaceTypes.ts:65-68`](../../playground/src/pulse/genieSpaceTypes.ts) defines `ColumnConfig.description` but the proxy strips columns to `{ name, type }` in `enrichQueryResults` and the frontend models `queryResult.columns` as `string[]`. The metadata channel is closed; opening it is a real code change (~3-4 hr).
- **Hybrid is the only viable architecture.** Backend `display_name` for stored columns + frontend humanization for derived columns. Industry consensus across Databricks docs + practitioner blogs treats presentation-layer humanization as the consumer's job regardless of semantic-layer effort.
- **Cost ladder:**
  - UC `COMMENT` on canonical columns: ~30 min in SQL. Doesn't change rendering. Improves Genie SQL quality.
  - Genie Space `display_name` for stored columns: ~1-2 days (Databricks UI work) for a 10-table dataset.
  - Sample SQL queries + SQL Expressions in Genie: ~2-4 hr — *encourages* (doesn't guarantee) LLM to mimic friendly aliasing.
  - PulsePlay code to consume `display_name`: ~3-4 hr (proxy enrichment + frontend type + chart-label override).

### Decision recorded 2026-05-22

User direction (pending — research presented as `(c) Hybrid` recommendation). Backlog framing:

- Frontend G2 humanization (`acc3a89`) remains the floor and ships TODAY.
- Backend `display_name` adoption queued as opportunistic future work — only worth doing alongside an actual Databricks-side Genie space configuration effort.

---

## 2026-05-22 — Azure App Service Configuration Challenges

**Context.** Rajesh asked to attempt Azure App Service hosting after the Databricks Apps deployment and then asked to document the App Service configuration challenges and guidance. The result is [DEPLOY_AZURE_APP_SERVICE.md](../DEPLOY_AZURE_APP_SERVICE.md), a docs-only runbook focused on monorepo/Oryx build, startup command, App Service Authentication vs PulsePlay proxy auth, Key Vault references, diagnostics exposure, package layout, scale, slots, and logging.

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs | Microsoft Learn — Configure Node.js apps in Azure App Service | Node version, startup command, PM2 foreground mode, app settings, logs, and URL rewrites are the key Node App Service levers. | Runtime/startup guidance |
| https://learn.microsoft.com/en-us/azure/app-service/deploy-zip | Microsoft Learn — Deploy files to Azure App Service | ZIP contents must be at the app root; deployment uses Kudu and can run build automation. | ZIP/package-layout guidance |
| https://learn.microsoft.com/en-us/azure/app-service/configure-common | Microsoft Learn — Configure an App Service app | App settings are injected as environment variables, encrypted at rest, and trigger restarts when changed. | App settings guidance |
| https://learn.microsoft.com/en-us/azure/app-service/reference-app-settings | Microsoft Learn — Environment variables and app settings in Azure App Service | App Service exposes many platform env vars and Key Vault reference status metadata. | Config diagnostics |
| https://learn.microsoft.com/en-gb/azure/app-service/app-service-key-vault-references | Microsoft Learn — Use Key Vault references as app settings | Managed identity plus Key Vault Secrets User access lets app settings resolve secrets without code changes. | Secret storage guidance |
| https://learn.microsoft.com/en-us/azure/app-service/overview-authentication-authorization | Microsoft Learn — Authentication and authorization in Azure App Service | Easy Auth can require authentication before requests reach the app and injects identity headers, but app-level authorization still needs deliberate design. | Auth challenge section |

---

## 2026-05-22 — Chart axis label humanization + value formatting (G2)

**Context.** Ask Pulse Chart tab renders raw SQL column names like `prev_order_count`, `sales_change_pct`, `margin_change_pp` in legends + axes; values display as raw floats (`0.05747126436781609`). Most of these are Genie-invented SQL aliases (not stable DB columns), so backend-only solutions don't fully cover the case. Research scope: industry humanization conventions + value formatting per unit type.

### Industry humanization + formatting sources

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://help.tableau.com/current/pro/desktop/en-us/data_clean_adm.htm | Tableau — Field Type Detection and Naming Improvements | Auto-converts underscores to spaces + Title Case; force-uppercases short letter-only tokens (`QTY`). Tableau-style: don't expand prefixes you can't prove. | Algorithmic fallback (tier 3) — snake_case → Title Case |
| https://docs.thoughtspot.com/cloud/10.8.0.cl/worksheets | ThoughtSpot Cloud — Worksheets | Automatic Title Case + underscore replacement on column add. Also auto-generates synonyms for NL search. | Synonym layer (future enhancement) |
| https://cloud.google.com/looker/docs/reference/param-field-label | Looker — `label` for fields | First-class label/synonym field on every column; defaults to field name if author hasn't supplied one. Labels are authorial, not algorithmic. | Backend (UC comment) path |
| https://tabulareditor.com/blog/naming-conventions-for-power-bi-semantic-models | Tabular Editor — Naming Conventions for Power BI Semantic Models | Recommended pattern: `<Metric> <Modifier> <Unit?>` (e.g. "Sales YoY Change", "Gross Margin %"). Modifier first, unit last. | Registry entries for `_yoy`/`_qoq`/`_change`/`_pct` |
| https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-tooling-advanced | Microsoft Learn — Edit Q&A Linguistic Schema | Power BI Q&A uses a linguistic schema (synonyms + labels) authored alongside the model. | Backend semantic-model parallel path |
| https://docs.sqlbi.com/dax-style/dax-naming-conventions | SQLBI — DAX Naming Conventions | YoY/QoQ/MoM/WoW/YTD/QTD/MTD as standard recognized acronyms — preserve casing. | Registry casing rules |
| https://service-manual.ons.gov.uk/content/numbers/percentages | ONS Service Manual — Percentages and Percentage Points | "Percentage points" in narrative; " pp" compressed for chart labels. Always show unit somewhere. | Value formatter for `_pp` suffix |
| https://www.datawrapper.de/academy/custom-number-formats-that-you-can-display-in-datawrapper | Datawrapper — Custom Number Formats | `0.0%` for percent, `$0,0.[00]a` for abbreviated currency, `123.4k` for big counts. Always show the unit. | Value formatter targets |
| https://d3js.org/d3-format | D3 — d3-format spec | De-facto standard for format-spec mini-language; ECharts wraps similar conventions in `formatter`. | Format string syntax for `axisLabel.formatter` |
| https://docs.getdbt.com/best-practices/how-we-style/1-how-we-style-our-dbt-models | dbt — How we style our dbt models | Friendly form in `meta:` / `description:` YAML; BI layer reads it. | Long-term backend parallel path |

### Synthesis takeaway

- **Three-tier cascade**: (1) Registry of common analytics tokens (`prev → Prior`, `pct → %`, `yoy → YoY`, `cnt → Count`, `amt → Amount`, `pp → pp`) — deterministic, audit-friendly, zero LLM cost. (2) LLM-emitted `columnLabels: { raw: friendly }` map — opt-in, validator-gated. (3) Algorithmic snake → Title Case fallback — guarantees no raw `prev_order_count` ever displays.
- **Value formatting per unit** keyed off the same suffix registry: `_pct/_rate` → d3 `.1%` (`0.057 → 5.7%`); `_pp` → `+.1f pp`; `_amt/_revenue/_cost` → `$,.0f` with SI prefix on axes; `_count/_qty/_cnt` → `,.0f`.
- **Gold mine**: PulsePlay's `chartAutoPick.ts` already has `detectColumnUnit()` + `UNIT_LABELS` from the chart-rationale upgrade. Currently only used in popover text; needs wiring into `buildEChartsOption.ts` axis + tooltip formatters.
- **Brutal-honesty caveat**: Without a semantic model, PulsePlay cannot perfectly distinguish `_change` (delta) from `_change_pct` (ratio) from `_change_pp` (already in percentage points). Registry MUST encode all three explicitly; ambiguous columns get a no-transform passthrough rather than a wrong guess.

---

## 2026-05-22 — Auto-route vs click-to-switch when chart shape is wrong (G4)

**Context.** Ask Pulse chart-rationale popover currently emits informational warnings like "Only 1 row of data — KPI tile shows the value more clearly. Try: KPI tile" but offers no clickable action. The question: silent auto-route to suggested view, OR add a one-click button? Research scope: industry conventions + UX research on auto-switching trust.

### Industry chart-suggestion sources

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://help.tableau.com/current/pro/desktop/en-us/buildauto_showme.htm | Tableau — Use Show Me to Start a View | "Show Me doesn't automatically switch chart types when data changes." Highlights suggested chart in orange outline; user clicks to apply. | Decision against auto-route |
| https://docs.thoughtspot.com/6.0/end-user/search/lock-chart-type.html | ThoughtSpot — Disable automatic selection of chart type | Auto-picks "best fit" on FIRST render only; explicit lock once user overrides. "Disable automatically select my chart" setting. | Stickiness pattern (session-scoped, not cross-session) |
| https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-smart-narrative | Microsoft Learn — Smart Narrative Visual | "Try: KPI card" surfaces as text/button in Copilot pane; never silently swaps a visual. | Click-to-switch button pattern |
| https://support.google.com/looker-studio/faq/7219787 | Looker Studio Troubleshooting (data shape mismatch) | Shows error empty state on mismatch; user picks from chart catalog manually. No auto-suggest button in the warning. | Confirms "user picks, not the system" |
| https://vizml.media.mit.edu/assets/2019-VizML-CHI.pdf | VizML (CHI 2019) — ML Approach to Visualization Recommendation | Academic — ML-based viz recommendation; emphasizes the human-in-the-loop principle for AI-suggested charts. | Justification for keeping user in control |
| https://idl.cs.washington.edu/files/2023-Draco2-VIS.pdf | Draco 2 — Extensible Platform to Model Visualization Design | Modeling viz design; same principle of suggest-then-apply. | Theoretical backing |
| https://blog.logrocket.com/ux-design/user-preference-settings-ai-powered-designs | LogRocket — How much choice should we give users in AI-powered designs? | "UX designers should offer ways to override or adjust AI-predicted user interactions." | Override-ability is a user right |
| https://docs.thoughtspot.com/software/10.1.0.sw/chart-types | ThoughtSpot — Chart Types | Inventory of chart types + when each fits. | Reference for suggestedView → ChartKind mapping |
| https://www.datawrapper.de/charts | Datawrapper — Charts overview | Opinionated chart selection at CREATION only; never re-routes mid-edit. | Confirms "no mid-edit auto-switch" |
| https://tabulareditor.com/blog/kpi-card-best-practices-dashboard-design | Tabular Editor — Better KPI Visualizations in Power BI | KPI card best practices — when KPI is the right choice over a chart. | KPI-tile suggestion contexts |
| https://zapier.com/blog/turn-off-smart-compose/ | Zapier — How to turn off Smart Compose | Gmail Smart Compose UX: Tab to accept, keep typing to ignore. Suggest-then-apply, never apply-then-ask-forgiveness. | Pattern parallel to click-to-switch |

### Synthesis takeaway

- **No major BI tool silently auto-switches charts**. Tableau, Power BI, Looker, ThoughtSpot, Datawrapper all explicitly chose against this; they had the same option.
- **Robust pattern**: suggest → one-click apply → easy undo. Mirrors Gmail Smart Compose (Tab to accept).
- **Stickiness rule**: respect explicit user override for the session/conversation; re-evaluate on a fresh conversation.
- **Severity gradient**: implicit pattern is "escalate the affordance, not the automation" — info = label only, caution = button, error = forced empty state with manual CTA. Never auto-switch.
- **PulsePlay recommendation locked**: click-to-switch button inside warning card. `suggestedView` text becomes `<button>` that calls `setChartType(...)` on the parent. User-confirmed direction 2026-05-22.

---

## 2026-05-22 — Executive briefing card patterns (Ask Pulse narrative regression)

**Context.** Ask Pulse on the deployed Databricks App was rendering executive briefings ("Summarize current performance...") with broken alignment — labels far left, content slammed far right (classic `flex justify-between` accident). Two research agents ran in parallel: industry-standard executive-briefing layouts + design-system component references. The recommended path (option 1: full card with tabs-always-show) was approved by user.

### Industry best-practice patterns

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://help.tableau.com/current/online/en-us/pulse_insights_platform_insight_types.htm | Tableau Pulse — Insights Platform | One composite card with internal sections; KPI strip on top + stacked AI-narrative sections below. Direct competitor pattern. | Briefing card structure decision |
| https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-smart-narrative | Microsoft Learn — Smart Narrative Visual | Power BI ships the AI narrative inside a single visual container with internal formatting; no per-section split. | Confirms single-card pattern |
| https://carbondesignsystem.com/patterns/status-indicator-pattern/ | Carbon Design System — Status Indicator Pattern | Red = critical, orange = threshold breached, yellow = non-service-affecting warning, green = success. Pairs colour with directional symbols for a11y. | Colour semantics for risk/opportunity/recent-change |
| https://carbondesignsystem.com/components/notification/style/ | Carbon Design System — Notification Style | Inline notification = coloured left accent strip + neutral bg (alt to tinted-bg pattern). | Border-treatment alternate pattern |
| https://tabulareditor.com/blog/kpi-card-best-practices-dashboard-design | Tabular Editor — KPI Card Best Practices | Pair colour with directional arrows/icons so signal survives colour-blindness. Specific KPI-card layout numbers. | KPI tile structure + a11y rationale |
| https://www.datawrapper.de/blog/text-in-data-visualizations | Datawrapper — Text in Data Visualizations | Labels must sit "as close to the elements they explain as possible." The two-column label-left/content-right-aligned pattern is the canonical anti-pattern for narrative content. | Justification for replacing flex with grid; never use `space-between` |
| https://medium.com/eightshapes-llc/cards-and-composability-in-design-systems-8845ecbee50e | Eight Shapes — Cards and Composability | Card-as-stacked-container pattern: media/header > title > body > actions. Industry convention. | Card-internal section ordering |
| https://m1.material.io/components/cards.html | Material Design — Cards | Foundational stacking pattern; 16-24px padding; rounded corners; subtle shadow. | Outer card sizing |
| https://www.stan.vision/journal/ui-card-design-examples-best-practices-and-common-patterns | Stan.vision — UI Card Design Patterns | Body text ≥16px for accessibility; standard padding numbers (24px outer, 16px section gaps). | Typography sizing decision |

### Design-system component references

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://ui.shadcn.com/docs/components/alert | shadcn/ui — Alert | Uses **CSS grid** (`grid-cols-[auto_1fr]`), NOT flex. 16px padding × 12px vertical, 8px radius, 16px icon, 12px icon→text gap. The single biggest layout fix. | Replaces broken `.gn-kpi-row` flex pattern |
| https://ant.design/components/alert/ | Ant Design — Alert | Hex palette: info #e6f4ff/#91caff · success #f6ffed/#b7eb8f · warning #fffbe6/#ffe58f · danger #fff2f0/#ffccc7. Tinted bg + 1px coloured border. | Section bg/border palette |
| https://www.tremor.so/docs/ui/card | Tremor — Card | KPI tile spec: `rounded-lg border p-6 shadow-xs` (24px internal padding). | KPI tile sizing |
| https://tailwindcss.com/plus/ui-blocks/application-ui/data-display/stats | Tailwind UI — Stats / KPI blocks | KPI strip pattern: label (sm muted) over big metric (text-3xl bold), inline directional arrow + delta, prior period in parens text-muted sm. | KPI tile content layout |
| https://refine.dev/blog/material-ui-card/ | Refine — MUI Card spec | Standardised padding numbers (24px outer, 16-20px section gaps, 8px icon→label). | Spacing tokens |
| https://www.figma.com/community/file/879668624364329411/insight-cards | Figma community — Insight Cards | Concrete Figma template with full insight-card dimensions + variants. | Design reference; download for finer specs if needed |
| https://www.figma.com/community/file/1130917765288346079/kpi-charts | Figma community — KPI Charts | Figma template for KPI-with-trend cards. | KPI tile visual reference |
| https://impeccable.style/antipattern-examples/thick-border-cards | Impeccable Style — Thick Border Cards anti-pattern | 8px+ accent stripes are an anti-pattern; 4px max for left-border accents. | Constrains border width |

### Synthesis takeaway

- **Layout primitive:** CSS Grid `grid-cols-[auto_1fr]`, never `flex justify-between` for label+content rows.
- **Structure:** Single composite card; sections stacked vertically (KPI strip → headline → risk → opportunity → recent change → action); 16-20px between sections.
- **Colour palette (final hex):** Risk amber/red bg + border (`#fffbe6/#ffe58f` or `#fff2f0/#ffccc7`); Opportunity `#f6ffed/#b7eb8f`; Recent change `#e6f4ff/#91caff`; Action filled `#1a6fd4` solid + white text.
- **Icons:** 16px Lucide-style (`alert-triangle`, `trending-up`, `activity`, `arrow-right`), 8px gap to label.
- **Typography:** Section labels 12-13px uppercase 600 weight; body 14-16px; KPI primary 28-32px 700 weight.
- **Padding:** Outer card 24px; section gaps 16-20px; icon→label 8px; label→body 4-6px.

---

## 2026-05-22 — Chart rationale popover design (data-shape-aware narrative + warnings)

**Context.** Earlier same-day session shipped the "Why did we pick this chart?" popover upgrade (commit `d81ef08`). Online research covered competitor patterns + design-system tooltip-popover conventions + Figma component shapes. The full detail is preserved in commit `d81ef08`'s diff + the `docs/research/DWD_FOR_BI_DEEP_SCAN_2026-05-22.md` offline component. Sources retroactively logged here for future re-verification.

### Industry best-practice patterns (chart rationale / "why this chart")

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://www.tableau.com/visualization/data-visualization-best-practices | Tableau — Data Visualization Best Practices | Auto-pick rationale must explain chart choice in user's data terms, not just rule names. | Personalised narrative ("Your data has X rows and Y numeric columns...") |
| https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-q-and-a-explorer | Power BI Q&A Explorer | Chart suggestions surface alongside the chart itself with a brief why. | Popover anchor pattern (button next to chart, not separate panel) |
| https://cloud.google.com/looker/docs/best-practices/dashboard-design | Looker — Dashboard Design Best Practices | Warning when chart shape doesn't match data shape (mixed units, mixed signs, donut with negatives). | 8 warning templates in `generateWarnings()` |
| https://material.io/components/tooltips/web | Material Design — Tooltips (Web) | Tooltip-popover card sizing: 320-340px width, soft shadow, 12-14px body. | ChartRationalePill popover sizing |
| https://www.untitledui.com/components/alerts | Untitled UI — Alert Components | Severity-coded card with coloured left border + icon + title + body + suggested action. | Warning card structure (info/caution/warning palette) |

### Design-system component references (chart rationale)

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://ui.shadcn.com/docs/components/tooltip | shadcn/ui — Tooltip | Anchor + 6px gap + soft shadow; click-to-pin pattern (hover for ephemeral, click for sticky). | ChartRationalePill open/close behaviour |
| https://ant.design/components/popover/ | Ant Design — Popover | `below-left` and `below-right` placements; auto-flip when clipped. | `popoverPlacement` prop in ChartRationalePill |
| https://m3.material.io/styles/color/the-color-system/color-roles | Material 3 — Color Roles | `errorContainer` / `secondaryContainer` token usage for warning bands. | Warning palette CSS vars (`--pp-caution-bg`, `--pp-warning-bg`) |

### Synthesis takeaway (chart rationale session)

- Speak about the AUTO-pick, never the user override (anti-pattern: "you picked X, we'd pick Y" framing).
- Sourced narrative: short narrative + sibling alternatives + structured warnings + "avoid for this shape" KB rule.
- Severity-coded warning cards (info=blue, caution=amber, warning=red), left-border + icon + title + body + optional "Try:" suggestion.

---

## How to extend this doc

When a research agent returns web findings:
1. **Don't replace** existing entries — append a new dated section at the bottom.
2. **One row per URL.** If two agents cited the same URL in the same session, list it once in this doc but note both contexts.
3. **Include a takeaway sentence** — future sessions need to know *why* this URL mattered without re-reading the source.
4. **Cross-link to where it was applied** — commit SHA, design proposal file, or feature memory.
5. **Update the topic index** at the top.

If a URL turns out to be dead, broken, or wrong, add a `*[verified-dead 2026-MM-DD]*` annotation but do not remove — the dead URL is itself evidence.

---

## 2026-05-22 — Azure Databricks Apps Enterprise Installation Guide

**Context.** Rajesh asked for a single installation guide after the first live PulsePlay Databricks Apps deploy was not straightforward. A research agent inspected the local deploy guide, long-form lessons, app manifest, and older proxy-only README while the main session verified current Azure Databricks Apps docs. The result is the refreshed [DEPLOY_DATABRICKS_APP.md](../DEPLOY_DATABRICKS_APP.md) plus a superseded signpost in [proxy/README.databricks-app.md](../../proxy/README.databricks-app.md).

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/ | Microsoft Learn — Azure Databricks Apps overview | Apps run on Databricks serverless infrastructure, integrate with UC/SQL/OAuth, are billed while running, and require Premium workspace support. | Prerequisites and scope |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/configure-env | Microsoft Learn — Set up Databricks Apps workspace and development environment | Workspace must be in a serverless-supported region and network policy must allow outbound access to `*.databricksapps.com`; CLI 0.229+ required. | Enterprise prerequisites and network blockers |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/key-concepts | Microsoft Learn — Key concepts in Databricks Apps | App resources are environment-specific and app permissions are separate from app/user authorization. | Auth model and resource ownership |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/deploy | Microsoft Learn — Deploy a Databricks app | Git deploys can target branch, tag, or commit; private repos require SP Git credential; troubleshooting calls out env/resource resolution and Private Link egress. | Create/deploy sequence |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/app-runtime | Microsoft Learn — Configure app execution with app.yaml | `app.yaml` owns `command` and `env`; apps must receive runtime config through env/resource references. | `app.yaml` guidance |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/environment-variables | Microsoft Learn — Define environment variables in a Databricks app | Use `valueFrom` for resource-backed values; secrets should never be hardcoded in app config. | Secret/resource binding section |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/resources | Microsoft Learn — Add resources to a Databricks app | Add resources through app configuration/UI or bundles; app SP needs least-privilege access to existing resources. | Resource binding stance |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/auth | Microsoft Learn — Configure authorization in a Databricks app | User authorization is public preview and requires scopes/consent; app authorization uses the app SP. | Auth model decision table |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/permissions | Microsoft Learn — Configure permissions for a Databricks app | `CAN USE` / `CAN MANAGE` app permissions do not equal data authorization; apps cannot be anonymous/public. | Permission and access checklist |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/monitor | Microsoft Learn — Logging and monitoring for Databricks Apps | Use stdout/stderr, external logging/APM where needed, and system audit tables for app security events. | Ops checklist |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/best-practices | Microsoft Learn — Best practices for Databricks Apps | App compute is for UI/control plane; bind to `0.0.0.0:$DATABRICKS_APP_PORT`, avoid privileged operations, minimize cold start. | Challenge matrix |
| https://learn.microsoft.com/en-us/azure/databricks/resources/limits | Microsoft Learn — Azure Databricks resource limits | Enterprise resource limits differ from Free Edition; Databricks Apps quota is workspace-scoped. | Free Edition vs enterprise caution |

---

## 2026-05-22 — Azure App Service Deep Deployment Findings

**Context.** Rajesh asked for a deep multi-agent research document before planning a clean PulsePlay deployment on Azure App Service. Four research slices covered repo/package readiness, current Microsoft App Service docs, Azure account/cost guardrails, and enterprise auth/security. The result is [AZURE_APP_SERVICE_DEPLOYMENT_FINDINGS_2026-05-22.md](AZURE_APP_SERVICE_DEPLOYMENT_FINDINGS_2026-05-22.md).

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://learn.microsoft.com/en-us/azure/app-service/overview-hosting-plans | Microsoft Learn — Azure App Service plans | Free/Shared use shared compute; Basic+ uses dedicated compute. | SKU recommendation and F1/B1 framing |
| https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits | Microsoft Learn — Azure subscription/service limits | App Service Free has tight CPU/storage limits and Linux support differs by tier. | Personal-account cost guardrails |
| https://azure.microsoft.com/en-us/pricing/details/app-service/linux/ | Microsoft Azure — App Service on Linux pricing | Linux F1 free is smoke-only scale; B1 is the lowest practical paid sandbox. | SKU/cost caveats |
| https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs | Microsoft Learn — Configure Node.js apps in App Service | Node apps need dependencies, startup command, PM2 foreground mode if used, and build automation awareness. | Runtime/startup/package plan |
| https://learn.microsoft.com/en-us/azure/app-service/deploy-zip | Microsoft Learn — Deploy files to App Service | ZIP package contents must be rooted at the app root, not a nested repo folder; Kudu can run build automation when enabled. | Curated ZIP package guidance |
| https://learn.microsoft.com/en-us/azure/app-service/reference-app-settings | Microsoft Learn — App settings/env var reference | `SCM_DO_BUILD_DURING_DEPLOYMENT` enables ZIP build automation; platform settings are exposed as env vars. | App settings checklist |
| https://learn.microsoft.com/en-us/azure/app-service/configure-common | Microsoft Learn — Configure App Service app settings | App settings are environment variables and encrypted at rest. | Lab settings vs production secret posture |
| https://learn.microsoft.com/en-us/azure/app-service/overview-authentication-authorization | Microsoft Learn — App Service Authentication / Easy Auth | Easy Auth can authenticate before app code, but app authorization still needs deliberate design. | Easy Auth vs proxy-auth blocker |
| https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-user-identities | Microsoft Learn — Access user claims in app code | App Service can inject authenticated user claims headers. | Possible future Easy Auth header trust mode |
| https://learn.microsoft.com/en-us/azure/app-service/overview-managed-identity | Microsoft Learn — Managed identity in App Service | Managed identity represents the app for Azure resources, not the end user. | Key Vault and per-user auth distinction |
| https://learn.microsoft.com/en-us/azure/app-service/app-service-key-vault-references | Microsoft Learn — Key Vault references as app settings | Key Vault references let App Service resolve secrets via managed identity; network-restricted vaults need VNet routing. | Production secrets guidance |
| https://learn.microsoft.com/en-us/azure/app-service/troubleshoot-diagnostic-logs | Microsoft Learn — App Service diagnostic logging | Linux app logs can stream from file system; logging/storage choices can add cost. | Logs/App Insights caution |
| https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/avoid-charges-free-account | Microsoft Learn — Avoid charges with Azure free account | Free accounts start with limited-time credit and need portal/billing checks before spend. | Approval gate before resource creation |
| https://learn.microsoft.com/azure/databricks/dev-tools/databricks-apps/auth | Microsoft Learn — Databricks Apps authorization | User authorization can forward a user token and enforce Unity Catalog permissions, but is public preview. | Databricks Apps vs App Service comparison |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/environment-variables | Microsoft Learn — Databricks Apps environment variables | Use `valueFrom` for app resources/secrets instead of plaintext values. | Databricks baseline comparison |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/secrets | Microsoft Learn — Databricks Apps secret resources | Secret resources inject env vars; use separate scopes where possible. | Databricks secret guidance |
| https://learn.microsoft.com/azure/databricks/dev-tools/databricks-apps/networking | Microsoft Learn — Databricks Apps networking | Databricks Apps supports IP lists, private connectivity, NCC, and network policies. | Enterprise hosting comparison |
