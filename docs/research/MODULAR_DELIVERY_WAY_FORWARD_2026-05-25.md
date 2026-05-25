# Modular Delivery Way Forward

> **Status:** Decision recommendation for Claude/Codex/Rajesh, created 2026-05-25.
>
> **Scope:** Internal enterprise PulsePlay, Path C. This is **not** a public marketplace, plugin store, SaaS extension ecosystem, or public-OSS packaging plan.
>
> **Short answer:** Rajesh's understanding is directionally right, but the best v1 answer is **not** "make every end user plug modules manually." Keep PulsePlay as one coherent app. Make the technical edges modular, lazy, manifest-driven, policy-gated, testable, and later build-prunable.

## Claude Copy-Paste Summary

Use this block if Claude is being brought into the conversation:

```text
PulsePlay modularity decision, 2026-05-25:

Do not interpret "plugin" as a public marketplace or runtime remote-JS ecosystem.
PulsePlay remains Path C: internal-org first, public OSS later.

Rajesh's goal is valid: a deployment that only needs Power BI + Genie should not force users or platform teams to carry every BI/AI path in the hot runtime. But there are four different "sizes":
1. Browser download size - already partly solved by Vite dynamic imports and manual chunks.
2. Static artifact size - still includes emitted chunks unless we add build-time pruning.
3. Proxy/server code size - currently one Express proxy with hardcoded connector manifests and many route bodies in server.js.
4. Operational size - user/deployer complexity, test matrix, security review, SBOM, rollback.

Recommended path:
1. Default v1: one integrated product build, lazy-loaded frontend chunks, server-side profiles, allowlists, and capability registry. Users pick Surface + Assistant; they do not install modules.
2. Near term: make the proxy modular internally with manifest-backed connector modules under proxy/connectors/, registered through a small host API. Keep existing routes stable during migration.
3. Near term: evolve BI adapter registry and AI connector registry into one capability/block registry that Settings/Launchpad consume.
4. Later: add platform-owned build profiles such as powerbi-genie or databricks-native to prune frontend adapters, packs, connector manifests, and optional dependencies for hardened deployments.
5. Defer runtime module federation / marketplace / remote plugins to public-OSS-later unless Rajesh explicitly changes strategy.

Power BI + Genie should be a first-class product cell, not a hardcoded fork:
Surface = Power BI adapter, Assistant = Genie profile, optional Pack = CPG/etc.
The same contracts must support future Tableau + Genie, native + Foundation Model, Power BI + Supervisor, etc.
```

## Direct Answer To Rajesh

Yes, the mental model is right: PulsePlay should let a team run only the parts it needs, such as **Power BI as the BI surface** and **Databricks Genie as the AI connector**.

The nuance: there are two levels of modularity.

| Level | What the user experiences | What engineers/platform teams manage | v1 recommendation |
|---|---|---|---|
| Product modularity | Pick a BI surface, pick an AI assistant, pick a pack | Profiles, allowlists, manifests, capability registry | **Must ship** |
| Delivery modularity | Smaller artifact for a specific deployment | Build profiles, dependency pruning, variant tests, SBOM per variant | **Add later, not first** |

The ideal user should never have to think "install the Power BI module, then install the Genie module." They should see one PulsePlay experience where the available choices are already filtered to what their org enabled.

## Current Repo Reality

PulsePlay already has some modularity.

- BI surfaces are behind the `BIAdapter` contract and loaded through dynamic imports in [registry.ts](../../playground/src/biPanel/registry.ts). The code comment already says Vite code-splits per vendor.
- The Vite build manually splits heavy optional libraries and the Power BI SDK into cacheable chunks in [vite.config.ts](../../playground/vite.config.ts).
- `playground/package.json` intentionally includes `powerbi-client` while omitting Tableau/Qlik/Looker SDKs until those adapters graduate.
- AI connector selection is profile-driven through the proxy, with `/assistant/profiles` and `/assistant/connector-types` describing configured profiles and connector manifests.
- `proxy/lib/connectorManifests.js` and `proxy/lib/connectorRegistry.js` are S1 manifest scaffolding, but route implementations still mostly live in [server.js](../../proxy/server.js).
- [MODULAR_INTEGRATION_ARCHITECTURE.md](../MODULAR_INTEGRATION_ARCHITECTURE.md) already locks the bigger rule: integrated journey, modular technical edges.
- [CONNECTOR_PLATFORM_REDESIGN_2026-05-20.md](../CONNECTOR_PLATFORM_REDESIGN_2026-05-20.md) already made the right call: manifest-backed discovery first, physical drop-in runtime later.

Brutal honesty: today PulsePlay can be **configured** as Power BI + Genie and can avoid **downloading inactive BI chunks**, but it does not yet produce a physically slim "only Power BI + Genie" deployable.

## What "Size" Means

These are often conflated; keep them separate.

| Size concern | Current state | What helps |
|---|---|---|
| Initial browser download | Already helped by dynamic imports and manual chunks | Keep lazy loading; move more optional surfaces behind imports |
| Static `dist` folder size | All emitted chunks still exist in the deployment artifact | Build profiles later |
| Proxy/container size | One proxy ships all route code today | `proxy/connectors/` extraction, optional manifest loading |
| Runtime attack surface | Hidden UI is not security | Server-side allowlists, auth, policy decisions, route gates |
| Dependency/SBOM surface | Root dependencies still count even if chunks are lazy | Optional deps and slim build variants later |
| User complexity | Low if one integrated app | Do not push module installation to users |
| Test complexity | Low with one build, high with many variants | Add variants only after conformance harness exists |

## Evaluated Options

### A. One Build, Lazy Chunks, Config Gates

One React build, one proxy, lazy-loaded BI/vendor chunks, server profiles, allowlists, and capability registry.

**Verdict:** default for internal v1.

This matches the current code and is the lowest operational burden. The user's browser should only fetch active chunks. The server remains the policy authority. The tradeoff is that the deployed artifact may still contain unused chunks and server routes.

### B. Build-Time Slim Distributions

Platform chooses modules at build/package time, for example:

```text
PULSEPLAY_BUILD_PROFILE=powerbi-genie
PULSEPLAY_MODULES=surface:powerbi,assistant:genie,pack:cpg-fmcg
```

**Verdict:** later optimization after manifests and conformance tests are stable.

This can reduce static artifact size, dependency surface, and SBOM scope. But it creates a variant matrix. Every new combination needs build/test/provenance discipline, and support gets harder if every business unit has a slightly different binary.

### C. Runtime Plugin / Module Federation / Marketplace

Load remote UI or connector modules at runtime from independent builds.

**Verdict:** defer.

Official Module Federation docs describe separate builds consumed at runtime, and newer runtimes support dynamic registration/loading. That is powerful, but in PulsePlay it means remote JavaScript enters a sensitive host that knows user context, BI state, and assistant state. It needs signing, trust registry, CSP changes, rollback, version negotiation, type contracts, and kill switches. This is not v1 work.

### D. Per-Connector Microservices / Micro-Frontends

Each connector becomes separately deployed infrastructure.

**Verdict:** do not use as product architecture now.

The deployment split should remain the one already documented in [HOSTING_OPTIONS.md](../HOSTING_OPTIONS.md): static frontend, Node proxy, platform-owned data/AI plane. Splitting every connector into its own service adds auth propagation, CORS, logs, network policy, release coordination, and duplicated governance for little current gain.

## Recommended Architecture

PulsePlay should use a **three-ring modularity model**.

| Ring | Purpose | Who sees it | Timing |
|---|---|---|---|
| Ring 1: Runtime capability registry | What is enabled for this user/deployment right now | UI, proxy, Settings, Launchpad | Now |
| Ring 2: Internal module files | Make BI adapters, AI connectors, packs, policy hooks independently maintainable | Engineers | Next |
| Ring 3: Build profiles | Produce slim deployables for hardened/business-unit builds | Platform team | Later |

The user-facing model stays simple:

```text
Surface: Power BI / Databricks AI-BI / Native / Tableau / ...
Assistant: Genie / Supervisor / Foundation Model / Azure OpenAI / ...
Context Pack: CPG / Retail / SaaS / ...
```

The internal model becomes:

```text
blocks/
  surfaces/
  ai-connectors/
  packs/
  knowledge-providers/
  prompt-translators/
  evidence-collectors/
  policy-hooks/
```

That does not require moving the repo to a monorepo package maze immediately. Start with manifests and disjoint module folders.

## Concrete Way Forward

### Phase 0 - Lock Vocabulary

Use these terms consistently:

| Term | Meaning | Not this |
|---|---|---|
| BI adapter / surface adapter | What the user is looking at | AI brain |
| AI connector | What answers questions | BI embed |
| PulsePack | Domain/business context bundle | Vector database or connector |
| Block | Internal modular capability with manifest/lifecycle | Public plugin-store package |
| Capability registry | Server-owned answer to "what is available now?" | UI-only feature flag |
| Build profile | Platform-owned slim distribution | User-installed module |

### Phase 1 - Keep One App, Make Capability Truth Server-Owned

Settings, Launchpad, and the assistant should consume the same registry response. It should answer:

```text
For this user, deployment, profile, surface, pack, auth mode, allowlist, and runtime health:
what blocks are capable, available, enabled, disabled, degraded, or forbidden?
```

This can extend the existing `/assistant/connector-types` and `/assistant/capabilities` work instead of inventing a new public plugin API.

### Phase 2 - Extract Proxy Connectors Internally

Move from hardcoded manifest table + route bodies in `server.js` to repo-local modules:

```text
proxy/connectors/genie/index.js
proxy/connectors/foundation-model/index.js
proxy/connectors/powerbi-dataset-dax/index.js
```

Each module exports:

```js
module.exports = {
  manifest,
  matchProfile(profile) {},
  probe(profile, helpers) {},
  registerRoutes(host) {},
};
```

The host owns route registration, auth envelope, audit envelope, problem details, rate limits, request IDs, and allowlist checks. Connector modules should not receive raw unchecked power over the whole Express app unless there is a reviewed escape hatch.

### Phase 3 - Make BI Adapter Discovery Manifest-Backed

The BI side already uses dynamic imports. The next improvement is to make the registry data-driven:

```text
bi-adapters/powerbi/adapter.manifest.json
bi-adapters/native/adapter.manifest.json
bi-adapters/databricks-genie/adapter.manifest.json
```

Do not switch to remote loading. Keep local dynamic imports. Vite supports glob imports that default to lazy dynamic imports and split chunks during build, which maps well to repo-local adapter discovery.

### Phase 4 - Add Build Profiles Only After Conformance Exists

After the registry and conformance tests exist, add build profiles such as:

| Build profile | Included surfaces | Included AI connectors | Packs |
|---|---|---|---|
| `powerbi-genie` | Power BI, native fallback | Genie, optional Supervisor | Selected packs |
| `databricks-native` | Native, Databricks AI/BI, Databricks Genie | Genie, Foundation Model, Supervisor | Selected packs |
| `full-internal` | All supported internal modules | All supported internal connectors | All approved packs |

Build profiles must be created by platform/deployment owners, not by normal viewers/authors.

Minimum bar before this:

- Manifest schema is stable.
- Missing module tests pass.
- Settings hides absent blocks without broken links.
- Proxy boots fail-closed when production config references a missing required block.
- SBOM/license output is per variant.
- Smoke fixtures cover at least `full-internal`, `powerbi-genie`, and `databricks-native`.

### Phase 5 - Defer Runtime Marketplace

Runtime module federation, remote plugin loading, public registry discovery, and third-party extension contracts belong in [PUBLIC_OSS_AGENDA.md](../PUBLIC_OSS_AGENDA.md) unless Rajesh explicitly changes strategic direction.

## Power BI + Genie Specific Shape

For the first production-grade cell:

```text
Surface: Power BI report/dashboard through BIAdapter
Assistant: Databricks Genie profile through proxy connector
Context: optional PulsePack
Evidence: request id, profile, space id, BI metadata, prompt frame, SQL/query artifacts when available
Policy: proxy allowlist + IdP + Power BI token route + Databricks permissions
```

This should not become a hardcoded "PowerBI-Genie product fork." It should be one well-tested combination of the same axes every future combination uses.

Expected behavior:

- A Power BI + Genie deployment shows only relevant setup choices by default.
- Browser loads Power BI-related chunks only when the Power BI surface mounts.
- Genie calls go through the proxy; Databricks credentials never enter the browser.
- Tableau/Qlik/Looker SDKs are not added as root dependencies until real SDK adapters graduate.
- If a slim `powerbi-genie` build profile exists later, it prunes unrelated chunks/manifests at build time.

## What Claude Should Not Build

- Do not build module federation or remote plugin loading now.
- Do not create a public plugin marketplace.
- Do not make users install modules manually.
- Do not split every connector into a separate service.
- Do not move policy decisions into the browser.
- Do not put retrieval/vector search logic inside BI adapters.
- Do not create build profiles before missing-module and conformance tests exist.
- Do not treat docs planning baselines as shipped runtime behavior.

## Acceptance Criteria For The Next Real Implementation Slice

A good first slice after this doc would be small and testable:

1. Add a focused ADR or update the connector manifest ADR if one exists.
2. Add `docs/memory/feature_modular_architecture.md`.
3. Add an explicit capability/block registry contract that covers BI adapters, AI connectors, packs, and build profile metadata.
4. Keep existing routes working.
5. Add tests that prove a configured profile can be listed without leaking secrets.
6. Add tests that prove absent/disabled blocks are hidden or degraded honestly.
7. Add at least one missing-module test before any build pruning.

## External Source Checks

These checks were used only to validate packaging patterns, not to change PulsePlay strategy:

- Vite `import.meta.glob` docs: matched modules are lazy-loaded by default via dynamic import and split into separate build chunks. This supports repo-local manifest/glob discovery for adapters.
  <https://vite.dev/guide/features.html#glob-import>
- Vite build docs: production builds compute dependencies for dynamic imports and support build manifests/license output; current Vite also warns that `rollupOptions` is evolving in newer versions, so future Vite upgrades should re-check chunk config.
  <https://vite.dev/config/build-options.html>
- Webpack Module Federation docs: separate builds can consume remote modules at runtime. Powerful, but it introduces remote container/version/runtime concerns that are not justified for PulsePlay v1.
  <https://webpack.js.org/concepts/module-federation/>
- Module Federation runtime docs: dynamic runtime registration/loading is possible, which reinforces that this is a deliberate architecture tier, not a casual refactor.
  <https://module-federation.io/guide/runtime/>
- OpenFeature specification: evaluation context and hooks are useful precedent for feature/capability decisions with context, hooks, telemetry, and provider neutrality.
  <https://openfeature.dev/specification/sections/evaluation-context/>
  <https://openfeature.dev/specification/sections/hooks/>

## Bottom Line

Ship one product. Make its blocks honest and removable.

For v1, the way forward is:

```text
One integrated PulsePlay build
+ lazy frontend chunks
+ server-owned capability registry
+ repo-local connector modules
+ conformance tests
+ optional platform-owned slim build profiles later
- runtime marketplace/module federation now
```

That gives Rajesh the practical outcome he wants without burying the pilot under premature plugin-platform work.
