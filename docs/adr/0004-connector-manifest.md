# ADR-0004 — Connector manifest as the single load-bearing artifact

- **Status:** Accepted 2026-05-20 (S1 in flight)
- **Deciders:** Claude (proposer), Codex (reviewer), Rajesh (approver)
- **Supersedes:** none
- **Superseded by:** —
- **Related:** [docs/CONNECTOR_PLATFORM_REDESIGN_2026-05-20.md](../CONNECTOR_PLATFORM_REDESIGN_2026-05-20.md), [ADR-0003 Supervisor stagger](0003-supervisor-stagger.md)

## Context

Pre-S1, PulsePlay had ten backend paths declared piecemeal in `proxy/server.js` (a 7,500-line monolith). The frontend Setup screen hand-coded the connector catalogue (provider picker, brand cards, snippet text). Adding a new connector meant editing server.js + the React Setup component + at least two docs.

Q9 (split-when-settings-differ) raised the connector count from 10 → 12 (Power BI splits into Dataset-DAX + Q&A; OpenAI splits into chat + analytics; Bedrock splits into direct + RAG). The bottleneck moved from "we have ten of these" to "we have twelve and growing — every new one is two PRs and four files."

The connector platform redesign proposal (PR #8) blended two threads:
1. Setup IA confusion ("I don't see the connector" — Rajesh, live UI validation 2026-05-20)
2. Plugin/connector architecture refactor (drop-in / drop-out per-connector modules)

The proposal hinges on one artifact carrying BOTH the runtime contract (proxy dispatch) and the Setup manifest (UI brand card + profileSchema + setupSteps).

## Decision

Adopt the **connector manifest** as the single load-bearing artifact. Every connector exports an object validated against `proxy/lib/connectorManifestSchema.js` containing:

- **Identity:** `id`, `version`, `displayName`, `tagline`, `description`, `icon`
- **Taxonomy:** `category` (microsoft/azure/aws/databricks/demo) × `maturity` (stable/beta/preview) × `capabilities` (boolean map)
- **Profile contract:** `profileType` + `profileTypes` (soft-migration aliases), `profileSchema` (typed field descriptors with `kind` + `required` + `secret` flags)
- **Setup contract:** `setupSteps` (ordered checklist), `docsUrl`, optional `sharedCredentialHint` + `envPrefix`
- **Route metadata:** `routes` (method + path + purpose) — declared in S1; physical handler extraction lands in S2

S1 ships:

| Artifact | Role |
|---|---|
| `proxy/lib/connectorManifestSchema.js` | Validator with allowlists for category/maturity/field-kind/route-purpose |
| `proxy/lib/connectorManifests.js`      | Hardcoded table of all 12 manifests; validates at module load |
| `proxy/lib/connectorRegistry.js`       | `listManifests({filter}) / getManifest(id) / matchProfileToConnectors(profile) / describeRuntimeState({profiles})` |
| `GET /assistant/connector-types`       | Discovery endpoint serving `{manifests, runtime}` |
| `playground/src/lib/connectorManifests.ts` | Client types + `useConnectorManifests()` hook + snippet generators |
| `playground/src/setup/ConnectorBrandCard.tsx` | Three-state card (active / configured-degraded / available) |
| `playground/src/setup/ConnectorBrandGrid.tsx` | Category-grouped grid; single consumer of the hook |

S2 starts moving connectors into `proxy/connectors/<id>.js` files (Foundation Model first — narrowest route surface, no AAD). S3 finishes the migration in dependency order; Genie last because it has the biggest blast radius.

## Consequences

### Positive

- **Modular at both ends.** Drop `proxy/connectors/snowflake.js` → backend serves a new manifest → Setup shows a Snowflake card. **Zero frontend changes.** Delete it → card disappears.
- **One artifact, one truth.** The brand card text, the JSON snippet, the env-var snippet, and the runtime route descriptor all derive from the same manifest. Editing one drift-prone field in two places is no longer possible.
- **Soft migration preserved.** Legacy `type: "powerbi-semantic-model"` profiles automatically appear under BOTH new cards (DAX + Q&A) flagged `legacyCombined: true`. No deployer break.
- **Secret hygiene enforced at the contract.** `profileSchema.field.kind === "secret"` requires explicit `secret: true`; validator rejects mismatches. `describeRuntimeState()` returns only `secretStatus: present/missing/n/a`, never the value.
- **Three-state surface visibility.** Available-but-not-configured connectors are visible alongside configured ones, addressing the "I don't see the connector" failure mode.

### Negative

- **Twelve cards is a lot to scan.** Category grouping (Microsoft / Azure / AWS / Databricks / Demo) keeps related cards adjacent, but a designer's eye is still needed for visual density follow-up.
- **Two-stage migration.** S1 ships the UI win without moving any connector. S2 + S3 deliver the architectural promise. During the transition, the manifest table is the source of truth even though connector code still lives in `server.js`.
- **Auth duplication for v1.** Deployers paste AAD SP creds twice (PBI DAX + PBI Q&A) until follow-up `credentialRef:` ships. `sharedCredentialHint: "powerbi-aad-sp"` flags the duplication in the UI so deployers know they're allowed to reuse the SP.

### Neutral

- **The Demo card has no route handler yet.** Manifest declares it; a follow-up cycle ships the handler. UI surfaces the card today.
- **`host.registerRoute({...})` API is reserved but not implemented in S1.** S2 introduces it as the default route surface; raw `host.app` stays as escape hatch for SSE / multipart.

## Alternatives considered

| Option | Reason rejected |
|---|---|
| Keep hand-coding the Setup component, just add Q9's two new cards | Punts the problem one cycle; the next connector ask runs into the same wall. |
| Build a full plugin system with directory scan in one PR | Couples the UX win (S1) to the architectural refactor (S2+S3). Codex's review recommended honest scoping: ship the user-visible win first. |
| Per-connector hardcoded TypeScript types instead of a runtime manifest | Loses the "drop a file → UI updates without code change" property. The manifest IS data; it can come from disk in S2. |
| Wizard-by-default Setup | Q6 — returning users and developers need compare-at-a-glance. Single-page with opt-in "Guide me" is the chosen primary. |

## Verification

S1 acceptance tests in `proxy/tests/connectorManifests.test.js` (48 jest cases) and `playground/src/setup/__tests__/ConnectorBrandCard.test.tsx` (16 vitest cases) cover:

- Manifest table integrity (12 entries, vendor-grouped, no duplicates).
- Q9 PBI/OpenAI/Bedrock splits + Q9 Genie-stays-single.
- PBI canonical field names (`aadTenantId` etc) + omission of inert fields (`templateAllowList`, `tokenLifetimeMinutes`) per Codex's Q9 cleanup.
- Q1 soft-migration: typed and untyped profiles route to the right cards.
- `legacyCombined` flag set when one profile.type matches multiple cards.
- Secret values NEVER appear in `describeRuntimeState()` output.
- Three-state UI: active / configured-degraded / available.
- Snippet generators (JSON + env-var) emit `YOUR_*` placeholders, never literal values.
- Discovery endpoint returns `{manifests, runtime}` shape and renders fail-closed in the UI when unreachable.
