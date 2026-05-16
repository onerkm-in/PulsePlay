# PulsePlay Databricks-Forward Strategy

> **Status:** Canonical planning baseline as of 2026-05-16. This supersedes the discussion draft in `docs/AGENT_SYNC.md` and should guide roadmap, settings IA, and future adapter work.
>
> **Scope:** Internal enterprise deployment. PulsePlay is an experience and orchestration layer over enterprise-approved analytics assets, AI connectors, and governed knowledge. It is not trying to become a BI product, an LLM platform, or a public commercial marketplace.

## Executive Position

PulsePlay should be **Databricks-forward, bridge-friendly, and adapter-safe**.

The enterprise direction is moving away from Power BI report dependence and toward Databricks as the analytics center: Genie Spaces, AI/BI Dashboards, Databricks Apps, Unity Catalog assets, SQL Warehouses, governed metrics, and enterprise model serving. Power BI remains important because it is current-state reality, but it is a transition bridge, not the permanent center of gravity.

The product statement is:

> PulsePlay is a governed analytics experience layer that can run over Databricks-native assets first, while preserving adapter-based bridges to Power BI and other BI tools during transition.

## Posture Vocabulary

| Posture | Meaning | PulsePlay response |
|---|---|---|
| Shift left | Databricks-native destination: AI/BI Dashboards, Genie Spaces, Databricks Apps, Unity Catalog tables/views/metrics, SQL Warehouses, notebooks and query results | Make Databricks assets first-class surfaces and give them the best launch, evidence, and guided-analysis experience. |
| Shift middle | Hybrid transition: Databricks is strategic, but Power BI or other BI tools still exist in pockets | Preserve the adapter contract, support migration and parity workflows, and make current state safe without making it the north star. |
| Shift right | Report-led external BI future | Not the forward plan. Support only as current-state or bridge where the enterprise still requires it. |

Decision rule: new differentiating work should bias toward shift-left and shift-middle. Shift-right work is allowed only when it protects the current enterprise environment, reduces migration risk, or keeps the bridge secure.

## Architecture Guardrails

PulsePlay still needs the two-axis architecture, but the surface axis should be understood more broadly.

| Axis | Current implementation | Forward concept |
|---|---|---|
| Surface axis | `BIAdapter` implementations for Power BI, Tableau, Qlik, Looker, generic iframe | Insight surfaces: AI/BI Dashboard, Genie Space, Databricks App, Unity Catalog asset, SQL query or notebook result, legacy BI report |
| Reasoning axis | Proxy profile types and routes: Genie, Supervisor, Foundation Model, Azure OpenAI, Bedrock, and related backend paths | Enterprise-approved AI connectors that consume the same question, context, frame, and grounding contracts |
| Knowledge plane | PulsePacks, pack registry, prompt injection, Knowledge Base browser | Governed context substrate across PulsePacks, Unity Catalog, SharePoint/S3/docs, vector search, BI metadata, and citations |

Keep `BIAdapter` as the implementation name for now. Do not rename the codebase to `InsightSurfaceAdapter` yet. The useful move is additive capability widening, not churn:

- `getMetadata()` for visible measures, dimensions, filters, and view identifiers.
- Future `getLineage()` for Unity Catalog lineage and source provenance.
- Future `getMetricDefinitions()` for governed metric contracts.
- Future `listAssets()` or a separate asset-browser service for workspaces, dashboards, Genie Spaces, apps, and favorites.
- Future capability flags for command support, event support, introspection quality, auditability, and lineage availability.

If PulsePlay later hosts non-visual assets that do not mount into a panel at all, introduce a separate asset contract at that point. Until then, optional capability methods on `BIAdapter` keep old adapters working.

## Product Experience

PulsePlay should feel like the place users go to start governed analysis, not just a blank canvas with a chat box.

The next user-facing anchor is a **PulsePlay Home / Launchpad**:

- Recent and favorite Databricks assets.
- Genie Spaces, AI/BI Dashboards, Databricks Apps, SQL Warehouses, and approved legacy reports.
- Active warehouse health, active knowledge pack, and recent sessions.
- Recommended analysis frames such as executive brief, variance, risks, Pareto, RFM, BCG, supply chain, finance, HR, IT, and sustainability.
- Role-aware views for business users, analysts/authors, admins/governance, and developer/support users.

Launchpad should be operational, not a marketing page. It should help the user choose an approved surface, understand readiness, and begin an analysis path quickly.

## Trust And Evidence

Every answer should make its grounding visible. The evidence model should include:

- Source surface: dashboard, Genie Space, app, Unity Catalog asset, SQL query, notebook result, or legacy BI report.
- Active filters, selected frame, and visible metadata from the surface adapter.
- SQL, query id, execution result shape, and row limits where available.
- Knowledge pack, sub-vertical, retrieval profile, and citations when retrieval lands.
- Unity Catalog lineage and metric definitions when Databricks-native adapters land.
- Confidence, limitations, partial failures, and request/audit id.
- Token and cost visibility through the existing session usage indicator.

This is the defensible difference: users should know why PulsePlay answered the way it did.

## Settings And Governance

Settings should keep the five current groups, but provider presentation should evolve from a flat list to posture-aware grouping:

- Native Databricks: Genie Spaces, AI/BI Dashboards, Databricks Apps, Unity Catalog assets, SQL Warehouses.
- Hybrid bridge: Power BI reports backed or governed by Databricks assets, migration/parity workflows, bridge metadata.
- Legacy external BI: Tableau, Qlik, Looker, generic iframe, and other report-led tools only where allowed.

The allowlist remains the enterprise boundary. Browser UI must never be the only enforcement layer. Server-side allowlist, production auth, redaction, CSP, route guards, and audit logging remain load-bearing in every posture.

## What Existing Work Still Buys Us

Nothing important is wasted.

| Shipped foundation | Forward role |
|---|---|
| First-run wizard and personas | Seeds role-aware onboarding and Launchpad defaults. Needs hardening before pilot. |
| Two-axis abstraction | Keeps surfaces independent from AI connectors. |
| `BIAdapter.getMetadata()` | Starts the capability-discovery pattern needed for Databricks-native surface adapters. |
| Prompt IR and translators | Keeps pack knowledge provider-neutral across Genie, Foundation Model, Supervisor, and future connectors. |
| Discovery Loop and FramePicker | Makes guided analysis operational instead of free-text only. |
| Frame-to-prompt wiring | Carries user analysis intent into backend requests; translator specialization remains future work. |
| `useEmbedConfig` and embed config store | Provides the persistence/live-update pattern, but Databricks asset config should get a typed schema rather than reusing BI config blindly. |
| Allowlist, production auth, and support redaction | Required for Databricks-native enterprise deployment. |
| PaneChrome and viewport controls | Gives users control over AI/BI panes and can extend to Launchpad or other panes when the shell evolves. |
| Warehouse pre-warm and keepalive | Directly improves Genie and Databricks SQL user experience. |
| Knowledge packs and Knowledge Base browser | Gives a provider-neutral content substrate before full retrieval arrives. |
| Sustainability indicator | One evidence slice: token/cost awareness. It does not replace provenance, lineage, or citations. |
| Settings IA | The right control-room foundation for a controlled enterprise environment. |

## Priority Shifts

Higher priority now:

- Canonical Databricks-forward strategy and roadmap alignment.
- Launchpad / Home as the entry point.
- Databricks asset browser and native surface adapter spikes.
- Genie Space and AI/BI Dashboard capability discovery.
- Unity Catalog lineage, metrics, and governed knowledge integration.
- Migration / Bridge mode for Power BI estates.
- Trust and evidence affordances for every answer.
- Wizard hardening so first-run cannot bypass governance or confuse users.

Lower priority now:

- Tableau, Qlik, and Looker SDK graduation unless an enterprise deployment standardizes on them.
- Vendor-card brand polish.
- Deep Power BI Copilot interop.
- Power BI-specific UI polish that does not improve security, migration, metadata, or current-state reliability.

Still load-bearing:

- Power BI bridge hardening.
- Production auth.
- Allowlist fail-closed behavior.
- Redaction and support bundle safety.
- Live credentialed smoke against real enterprise Power BI and Databricks environments.

## Roadmap Implications

### Near Term

1. Keep the current Power BI + Genie/Supervisor cell safe enough for internal pilot.
2. Fix the wizard risks: draft validation, re-run flow, focus trap, and probe path/lifecycle behavior.
3. Keep the Databricks-forward doc linked from architecture, roadmap, and settings.
4. Run live credentialed smoke against enterprise Power BI, Genie/Supervisor, IdP/JWKS, and allowlist config.

### Next Product Anchor

Build PulsePlay Home / Launchpad before a full native adapter rewrite. Launchpad creates the place where Databricks assets, migration workflows, role-aware onboarding, warehouse health, recent sessions, and trust/evidence affordances can live.

### Native Surface Expansion

After Launchpad, spike the first Databricks-native surface:

- AI/BI Dashboard adapter if the goal is visual parity with current report usage.
- Genie Space surface if the goal is question-first analysis.
- Unity Catalog asset browser if the goal is governed metrics, lineage, and source discovery.

The spike should prove `getMetadata()` plus at least one additional capability, not just render an iframe.

### Migration / Bridge Mode

Power BI estates need a controlled path forward:

- Inventory report pages, KPIs, filters, and datasets.
- Map report content to Unity Catalog tables, SQL Warehouses, metric definitions, and AI/BI Dashboard candidates.
- Generate Genie starter questions and pack mappings.
- Validate parity and surface gaps before migration claims success.

## Definition Of Strategic Alignment

A lane is strategically aligned only if it improves at least one of these:

- Works in Databricks-native mode without Power BI.
- Still works in hybrid mode while Power BI exists.
- Makes migration away from Power BI easier, safer, or more measurable.
- Preserves adapter boundaries and does not leak vendor logic across layers.
- Improves governance, lineage, auditability, redaction, or access control.
- Improves first-time usability for non-engineering users.
- Creates evidence users can trust.

If a proposed lane does not move one of these, it is polish or deferrable support work, not destination investment.
