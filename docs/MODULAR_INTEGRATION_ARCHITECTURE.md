# PulsePlay Modular Integration Architecture

> **Status:** Planning baseline as of 2026-05-16.
>
> **Scope:** Internal enterprise deployment. This extends the Databricks-forward strategy with an addable/removable building-block architecture. It does not turn PulsePlay into a commercial marketplace, a BI replacement, a vector database, or an LLM platform.
>
> **Companion docs:** [DATABRICKS_FORWARD_STRATEGY.md](DATABRICKS_FORWARD_STRATEGY.md), [ARCHITECTURE.md](ARCHITECTURE.md), [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md), [PROMPT_IR_ARCHITECTURE.md](PROMPT_IR_ARCHITECTURE.md), [CONNECTOR_PROBE_AND_SMART_CONNECT.md](CONNECTOR_PROBE_AND_SMART_CONNECT.md), [SETTINGS_SPEC.md](SETTINGS_SPEC.md), [ROADMAP.md](ROADMAP.md).

## Executive Verdict

PulsePlay should become an **integrated experience over a modular capability fabric**.

Users should feel one coherent place to work: find an approved asset, open it, ask questions, see evidence, adjust the view, and continue analysis. Engineers and admins should see independent building blocks: surfaces, AI connectors, knowledge providers, policy gates, prompt translators, evidence collectors, and evaluation harnesses.

The durable architecture rule is:

> Keep the user journey integrated. Keep every technical edge modular, discoverable, policy-gated, versioned, testable, and removable.

This is how PulsePlay can survive changing enterprise direction. If the organization moves further into Databricks, the Databricks-native blocks graduate. If Power BI stays longer, the bridge blocks remain. If another AI connector or knowledge provider appears, it plugs into contracts instead of becoming a fork.

## Research Signals Reviewed

External current-state anchors:

- [Databricks AI/BI](https://docs.databricks.com/aws/en/ai-bi) now groups dashboards, Genie Spaces, Databricks Apps, and Unity Catalog business semantics as related BI/AI resources.
- [Databricks Genie](https://docs.databricks.com/aws/en/genie-ui/) positions Genie as a single place to ask data questions, explore dashboards, and run apps, grounded through Unity Catalog.
- [Databricks Apps](https://docs.databricks.com/aws/en/dev-tools/databricks-apps/) supports Python/Node apps on serverless compute and integrates with Unity Catalog, Databricks SQL, and OAuth.
- [Databricks Apps resources](https://docs.databricks.com/aws/en/dev-tools/databricks-apps/resources) are configured resources such as Genie Spaces, SQL Warehouses, Model Serving endpoints, Unity Catalog tables, functions, volumes, and Vector Search indexes. The key lesson is portability and least-privilege access through declared resources, not hardcoded IDs.
- [Databricks app permissions](https://docs.databricks.com/gcp/en/dev-tools/databricks-apps/permissions) separates app access from data/resource authorization. PulsePlay should mirror that separation: UI permission is not data permission.
- [AI/BI dashboard embedding](https://docs.databricks.com/aws/en/dashboards/share/embedding) distinguishes embedding modes, auditability, viewer permissions, and service-principal scope. Embedded dashboard access must stay server-governed.
- [External AI/BI embedding](https://docs.databricks.com/gcp/en/dashboards/share/embedding/external-embed) uses user-scoped tokens and notes that Ask Genie is not available for external-user embedding, so natural-language integration may need the Genie Conversation API instead of assuming dashboard UI buttons exist.
- [Unity Catalog business semantics](https://docs.databricks.com/aws/en/business-semantics/) centralizes reusable metric views and agent metadata. This should become a first-class evidence and prompt grounding source.
- [Mosaic AI Vector Search](https://docs.databricks.com/aws/en/vector-search/vector-search) is Delta-backed, Unity Catalog-governed, endpoint/index based, filterable, and API-queryable. It is a strong first enterprise retrieval provider, not a reason to bake retrieval into a BI adapter.
- [Databricks Agent Framework](https://docs.databricks.com/aws/en/generative-ai/agent-framework/create-agent) and [agent deployment](https://docs.databricks.com/gcp/en/generative-ai/agent-framework/deploy-agent) support enterprise agent authoring, third-party frameworks, Unity Catalog registration, tracing, monitoring, and evaluation. PulsePlay should orchestrate these agents rather than becoming one.
- [Model Context Protocol](https://modelcontextprotocol.io/docs/learn/architecture) formalizes capability negotiation, tools, resources, prompts, lifecycle, and notifications. PulsePlay does not need to become MCP-only, but should copy the discipline: discover capabilities before using them.
- [OpenFeature](https://openfeature.dev/docs/reference/intro/) provides a vendor-agnostic provider model, evaluation context, hooks, and events for feature flags. That maps well to progressive block enablement and enterprise policy gates.
- [Backstage architecture](https://backstage.io/docs/overview/architecture-overview/) treats plugins as independently operated features with explicit API boundaries. The useful lesson for PulsePlay is plugin isolation, not copying Backstage.

Local anchors:

- [BIAdapter.ts](../playground/src/biPanel/BIAdapter.ts) already provides a surface contract and optional `getMetadata()`.
- [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md) separates PulsePacks from retrieval providers.
- [PROMPT_IR_ARCHITECTURE.md](PROMPT_IR_ARCHITECTURE.md) defines a provider-neutral prompt contract and per-backend translators.
- [CONNECTOR_PROBE_AND_SMART_CONNECT.md](CONNECTOR_PROBE_AND_SMART_CONNECT.md) defines connector-neutral probing and pack inference.
- [DATABRICKS_FORWARD_STRATEGY.md](DATABRICKS_FORWARD_STRATEGY.md) defines Databricks-native as the destination posture and Power BI as a bridge.

## Architecture Thesis

PulsePlay needs two layers moving at different speeds.

| Layer | What changes slowly | What changes quickly |
|---|---|---|
| Stable spine | Identity, policy, capability registry, event bus, prompt IR, grounding bundle, evidence model, test harness, audit shape | Specific providers and UI presentation |
| Swappable blocks | Contract shape and lifecycle states | Databricks assets, BI adapters, AI connectors, knowledge indexes, prompt translators, evidence collectors, feature flags |

The spine should be conservative and boring. The blocks can be progressive and aggressive.

## Target Shape

```text
User Journey
  Launchpad -> Surface -> PulsePlay AI -> Evidence -> Follow-up action

Stable Spine
  Identity
  Policy engine
  Capability registry
  Event/context bus
  Prompt IR dispatcher
  Knowledge grounding bundle
  Evidence/audit ledger
  Evaluation harness

Swappable Blocks
  Surface adapters
  AI connector adapters
  Knowledge source/index providers
  Prompt translators
  Tool/action providers
  Evidence collectors
  Feature gates
  Launchpad asset providers
```

The UI should never ask, "Is this Power BI or Databricks?" before deciding what is possible. It should ask the registry, "What capabilities does this block expose under this user's policy?"

## Building Block Catalog

| Block | Responsibility | Current PulsePlay shape | Needed evolution |
|---|---|---|---|
| Experience Shell | Routes, panes, Launchpad, Settings, Knowledge, user layout control | `App.tsx`, Settings, Knowledge browser, PaneChrome controls | Add Launchpad as the first screen for approved assets, recent sessions, guided frames, warehouse health, and migration workflows |
| Surface Adapter | Host what the user is looking at and expose normalized metadata/events/commands | `BIAdapter`, Power BI SDK adapter, iframe stubs | Add `SurfaceCapability` metadata; add Databricks AI/BI Dashboard, Genie Space, Databricks App, Unity Catalog asset browser spikes |
| AI Connector | Route user questions to approved reasoning backends | Proxy profiles and backend paths | Register connector capabilities, auth requirements, streaming support, tool support, prompt translator support, usage reporting |
| Knowledge Provider | Retrieve governed context without leaking provider logic | PulsePacks, pack injection, read-only Knowledge UI | Add `GroundingBundle`, retrieval profiles, Databricks Vector Search provider, Unity Catalog semantics provider, citation/eval path |
| Prompt Orchestrator | Convert user question, frame, surface context, and grounding into backend-native payloads | Prompt IR design exists; dispatcher is additive | Make Prompt IR dispatcher load-bearing route by route; preserve byte-identity regression for legacy Genie paths |
| Capability Registry | List all active blocks and what they can do under policy | Missing | New server-owned registry backing UI feature visibility, Settings validation, conformance tests, and Launchpad filtering |
| Policy Plane | Decide what is allowed before UI, retrieval, query, embed, or action execution | Allowlist, auth modes, redaction, CSP | Centralize decisions as `PolicyDecision` objects used by every block; keep browser UI as presentation only |
| Evidence Plane | Show why an answer exists and what it used | Usage indicator, partial metadata, audit IDs | Add evidence drawer: surface, filters, frame, SQL/query id, UC lineage/metric definitions, pack/retrieval citations, limitations |
| Structured Authoring | Standard prompt/guidance editing path for users and authors | Scattered textareas, Prompt IR docs, prompt redaction, frame-to-prompt wiring | Shared editor with required sections, parameter chips, schema validation, compiled middleware preview, and reusable contracts |
| Session/Memory | Persist project decisions, user preferences, and runtime state appropriately | Repo-local memory docs, localStorage preferences | Keep architecture/project memory in repo. Add runtime session/user memory only as governed enterprise storage with retention and reset |
| Evaluation Harness | Prove blocks work alone and together | Proxy/playground tests, adapter tests | Add block conformance suites: surface adapter, AI connector, knowledge provider, policy negative tests, evidence completeness |

## Building Block Contract

Every addable/removable block should be described by a small manifest. The manifest can start as JSON/YAML in repo config and later become a registry response.

```typescript
interface PulsePlayBlockManifest {
    id: string;
    kind:
        | "surface"
        | "ai-connector"
        | "knowledge-provider"
        | "prompt-translator"
        | "tool-provider"
        | "evidence-collector"
        | "launchpad-provider"
        | "policy-plugin";
    displayName: string;
    owner: string;
    version: string;
    lifecycle: "draft" | "pilot" | "active" | "deprecated" | "disabled" | "removed";
    capabilities: string[];
    requiredPolicies: string[];
    inputs: string[];
    outputs: string[];
    dependencies: string[];
    telemetry: {
        emitsEvents: string[];
        auditFields: string[];
    };
    conformance: {
        testSuite: string;
        lastVerifiedAt?: string;
        requiredForPilot: boolean;
    };
    rollback: {
        disableFlag: string;
        fallbackBlock?: string;
        dataMigration?: string;
    };
}
```

The manifest must be more than documentation. It should drive:

- Settings visibility.
- Launchpad asset filtering.
- UI capability rendering.
- Server-side route gates.
- Conformance test discovery.
- Evidence completeness checks.
- Deprecation and removal planning.

## Capability Registry

The highest-leverage missing foundation is a server-owned capability registry.

It should answer:

```text
For this user, tenant, environment, selected surface, selected connector, active pack,
and enterprise policy, what is available right now?
```

Suggested API shape:

```http
GET /assistant/capabilities
```

Response shape:

```typescript
interface CapabilityRegistryResponse {
    environment: "dev" | "test" | "pilot" | "production";
    user?: { id?: string; groups?: string[] };
    policyVersion: string;
    blocks: PulsePlayBlockManifest[];
    decisions: Array<{
        blockId: string;
        capability: string;
        allowed: boolean;
        reason: string;
        source: "allowlist" | "auth" | "feature-flag" | "resource-permission" | "runtime-health";
    }>;
}
```

This avoids brittle UI branching and helps explain why a feature is hidden, disabled, degraded, or active.

## Linear Plus Wider Spectrum Model

Rajesh's "linear + wider spectrum" framing maps cleanly to two work modes.

### Linear Spine

This is the non-negotiable sequence. It should move mostly in order because later blocks depend on it.

1. Capability registry.
2. Policy decision contract.
3. Surface context contract.
4. Prompt IR route migration.
5. GroundingBundle contract.
6. Evidence model.
7. Block conformance harness.
8. Launchpad as the unified entry point.

### Wider Spectrum

These lanes can expand in parallel once they plug into the spine.

| Lane | Examples | Rule |
|---|---|---|
| Databricks-native surfaces | AI/BI Dashboard, Genie Space, Databricks App, Unity Catalog asset, SQL result | First-class destination blocks |
| Bridge surfaces | Power BI, Tableau, Qlik, Looker | Current-state or migration blocks |
| AI connectors | Genie, Supervisor, Foundation Model, Azure OpenAI, Bedrock, future MCP-backed tools | Must accept the same question/context/grounding contract |
| Knowledge providers | PulsePacks, UC business semantics, Vector Search, SharePoint/S3/docs | Must return normalized GroundingBundle with citations and policy proof |
| Guided analysis | Executive brief, variance, risk scan, root cause, RFM, Pareto, BCG | Must be frame metadata, not hardcoded prompt text |
| Evidence collectors | SQL, query IDs, lineage, filters, prompt translator, token usage | Must be visible enough for controlled enterprise use |

The spine creates linear progress. The spectrum creates future optionality.

## Add/Remove Protocol

### Adding A Block

1. Add a manifest with lifecycle `draft`.
2. Implement the smallest contract adapter.
3. Add policy gates and a default-disabled feature flag.
4. Add conformance tests and at least one negative governance test.
5. Add evidence fields or explicitly mark "not available".
6. Expose it in Settings only after the registry says it is allowed.
7. Move to `pilot` only after targeted tests and manual smoke.
8. Move to `active` only after live enterprise validation.

### Removing A Block

1. Mark lifecycle `deprecated`.
2. Show replacement and impact in Settings/admin surfaces.
3. Disable new usage while preserving existing sessions if safe.
4. Add migration or fallback path.
5. Prove tests pass with the block absent.
6. Remove UI references, config references, docs references, then code.
7. Keep an audit note in HANDOVER and project memory.

Removal is a feature. If removing a block is scary, the block was not modular enough.

## Structured Authoring Surfaces

Rajesh's prompt/guidance requirement should be treated as part of the modular spine, not as cosmetic polish.

Any textarea that feeds the middleware should become a structured authoring surface:

- Required sections are visible before the user writes.
- Required and optional parameters are shown as chips or insert controls.
- The editor validates against the selected middleware contract.
- The user can preview exactly what will be sent.
- Advanced users can switch to raw YAML/JSON when the target is Prompt IR.
- The stored content remains parseable, audit-friendly, and reusable.

See [STRUCTURED_AUTHORING_STANDARD.md](STRUCTURED_AUTHORING_STANDARD.md) for the canonical UI and payload standard.

This matters because prompt and guidance content is now a building block. If it stays as unstructured text, agents and middleware will keep scraping strings. If it becomes sectioned and validated, Prompt IR translators, frame routing, knowledge retrieval, evidence, and future agent tooling can all use it safely.

## Memory And State Position

Project memory should be project-local.

For PulsePlay, durable architectural memory belongs in:

- [docs/memory/project_state.md](memory/project_state.md)
- focused `docs/memory/feature_*.md` files
- [docs/HANDOVER.md](HANDOVER.md)
- ADRs when a decision is architectural and durable

Runtime user memory is different. User preferences, recents, favorites, and session history may be useful, but they must be:

- scoped to the enterprise deployment,
- resettable by the user/admin,
- governed by retention policy,
- separated from project architecture memory,
- never used as a hidden policy bypass.

So the answer is: **yes, project memory should be part of the project.** User/session memory can exist only as a governed runtime block.

## Current Gaps

| Gap | Why it matters | Recommended owner |
|---|---|---|
| No Capability Registry | UI and routes still infer capabilities from local state and hardcoded assumptions | New spine lane |
| No block manifest/lifecycle | Add/remove work depends on tribal memory instead of an explicit contract | New docs + config lane |
| Launchpad missing | Users still start from canvas/settings rather than an approved asset home | Product anchor lane |
| Databricks asset model missing | Strategy says Databricks-forward, but no typed AI/BI Dashboard/Genie/App/UC asset config exists yet | Native surface lane |
| Knowledge retrieval not load-bearing | Packs exist, but retrieval provider adapters, ACL-trimmed search, citations, and GroundingBundle are not implemented | Knowledge plane lane |
| Prompt IR not fully load-bearing | Design exists, but live routes still need staged dispatcher migration | Phase 11b lane |
| Structured prompt/guidance authoring missing | Textareas do not consistently show required sections, parameter options, validation, or compiled middleware preview | UX + Prompt IR lane |
| Evidence is partial | Token usage and BI metadata exist; lineage, query IDs, citations, UC metric definitions, and limitations need a common UI | Evidence plane lane |
| Conformance is per-feature, not per-block | Future providers can drift without a standard contract suite | Test architecture lane |
| Settings provider grouping not implemented | Strategy says Native/Hybrid/Legacy, but UI still needs that posture-aware organization | Settings polish lane |

## Recommendations

### P0: Build The Spine Before More Surface Breadth

1. Add `docs/BLOCK_CONTRACTS.md` or a `config/block-manifests/` folder with the manifest schema above.
2. Implement `GET /assistant/capabilities` backed by allowlist, auth mode, profile registry, pack registry, and feature flags.
3. Add a conformance test harness that can run against one block kind at a time.
4. Make Settings and Launchpad consume registry decisions instead of duplicating capability logic.

### P1: Launchpad As The Integrated Front Door

Launchpad should be the first user-facing proof of the architecture:

- approved Databricks assets,
- approved bridge reports,
- recent/favorite sessions,
- active connector and pack,
- warehouse health,
- guided analysis frames,
- evidence readiness status,
- migration/bridge prompts where applicable.

This is not a marketing page. It is the operational control surface for the modular system.

### P1: Databricks-Native Asset Block

Create a typed `AssetConfigStore` instead of stretching `BIEmbedConfig`.

Suggested first types:

```typescript
type InsightAssetKind =
    | "databricks-aibi-dashboard"
    | "databricks-genie-space"
    | "databricks-app"
    | "unity-catalog-table"
    | "unity-catalog-metric-view"
    | "sql-query"
    | "legacy-powerbi-report";
```

This lets Power BI remain a bridge without forcing Databricks-native assets through a report-shaped config.

### P1: Evidence Drawer

Every answer should eventually expose:

- selected surface and active filters,
- selected frame and Prompt IR translator,
- connector profile and model/agent path,
- knowledge pack and retrieval profile,
- citations and source ACL proof,
- SQL/query id/result shape where available,
- Unity Catalog metric/lineage references where available,
- token/cost usage,
- limitations and partial failures.

### P2: MCP-Compatible Edge

PulsePlay should not wait for every tool ecosystem to standardize, but the block model should be MCP-friendly:

- tools map to `tool-provider` blocks,
- resources map to `knowledge-provider` or `surface-context` blocks,
- prompts map to Prompt IR templates/translators,
- MCP capability notifications map to registry refresh events.

### P2: Feature Gates With Expiry

Use the OpenFeature-style model as the shape:

- provider-neutral API,
- evaluation context,
- hooks for audit/telemetry,
- provider events for changes.

Every experimental block should have an owner, expiry/review date, and removal plan.

## What Not To Do

- Do not rename `BIAdapter` immediately. Evolve it additively until a real non-visual surface forces a separate contract.
- Do not make Power BI the product center. Keep it robust as a bridge.
- Do not make Databricks a hardcoded assumption in the UI. Make it the priority implementation of neutral contracts.
- Do not put retrieval inside BI adapters.
- Do not let browser UI enforce policy alone.
- Do not build a custom vector database, LLM platform, or BI engine.
- Do not add connectors without conformance tests and evidence behavior.

## Next Architecture Cycle

Recommended order:

1. Draft block manifest schema and registry response contract.
2. Implement minimal capability registry using existing allowlist/profile/pack data.
3. Update Settings grouping to Native Databricks / Hybrid Bridge / Legacy External BI using registry decisions.
4. Design Launchpad against the registry contract.
5. Add `StructuredAuthoringEditor` for prompt/guidance fields, starting with Settings AI guidance or Prompt IR authoring.
6. Add typed Databricks asset config store.
7. Start Databricks AI/BI Dashboard or Genie Space spike behind the surface adapter contract.
8. Make Prompt IR dispatcher load-bearing for one live route, with byte-identity regression.
9. Add GroundingBundle runtime after registry/policy decisions are available.

That sequence gives PulsePlay a stable spine first, then lets the wider spectrum expand without breaking the user journey.
