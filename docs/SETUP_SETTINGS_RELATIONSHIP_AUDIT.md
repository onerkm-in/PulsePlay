# PulsePlay Setup And Settings Relationship Audit

> **Status:** Deep audit baseline as of 2026-05-16.
>
> **Scope:** Current setup/settings options, existing connectors, relationship/dependency flow, progressive disclosure, and aesthetic interaction improvements for dropdowns/textareas. This is internal-enterprise guidance, not a public product plan.
>
> **Companion docs:** [SETTINGS_SPEC.md](SETTINGS_SPEC.md), [MODULAR_INTEGRATION_ARCHITECTURE.md](MODULAR_INTEGRATION_ARCHITECTURE.md), [STRUCTURED_AUTHORING_STANDARD.md](STRUCTURED_AUTHORING_STANDARD.md), [DATABRICKS_FORWARD_STRATEGY.md](DATABRICKS_FORWARD_STRATEGY.md), [CONNECTOR_PROBE_AND_SMART_CONNECT.md](CONNECTOR_PROBE_AND_SMART_CONNECT.md).

## Executive Verdict

PulsePlay has the right Settings tree, but it still needs a stronger **relationship model**.

The current UI exposes the pieces: BI provider, embed config, AI provider, probe, pack, preferences, security, diagnostics, reset. The missing layer is a clear explanation of how those pieces depend on one another:

```text
Governance -> Surface -> Embed mode -> AI connector -> Knowledge pack -> Discovery frames -> Answer evidence
```

The user should not have to understand this graph. PulsePlay should show it as readiness, dependencies, and next actions.

The biggest architectural gap is still the capability registry. The biggest UX gap is Power BI embed setup complexity. The biggest state gap is duplicated ownership between App state, Settings store, embed store, wizard draft state, and Pulse visual settings.

## Current Relationship Graph

| Node | Depends on | Unlocks | Current owner |
|---|---|---|---|
| Governance / allowlist | Proxy config, auth mode, user/group context | Which providers, origins, reports, profiles, packs, and license features are visible | Proxy `/assistant/allowlist`; Settings store |
| BI provider | Allowlist `biProviders` | Embed form, adapter selection, BI event/metadata capability | App `activeVendor`, partially Settings |
| Embed config | BI provider, origins, workspace/report/tenant allowlists, token mode | BIPanel mount, Power BI SDK capabilities, live BI metadata | `embedConfigStore`, `EmbedConfigForm` |
| BI authentication mode | Embed config, AAD tenant, service principal profile, user session | Secure preview, SSO, backend-issued embed token, edit/view permissions | `EmbedConfigForm`, proxy embed-token route |
| AI provider | Allowlist `aiProfiles`, proxy profile metadata | Probe, conversation route, warehouse warmup, Prompt IR translator path | App `activeConnector`, Settings `activeAiProfile` |
| Model / agent | AI provider type and profile fields | Genie space, Supervisor fan-out, Foundation Model endpoint, OpenAI/Bedrock path | Proxy profile registry |
| Connection probe | AI provider, proxy route, backend auth | Metadata snapshot, pack suggestion, readiness | `/assistant/probe`, `TestConnectionPanel` |
| Knowledge pack | Pack registry, allowlist, probe inference | Prompt injection, Knowledge browser, Discovery frames, first question hints | Settings store + App local state |
| Preferences | User preference only | Layout, panels, tile count | Settings store + App local state |
| System/Advanced | Runtime health and local state | Recovery, export, reset, support diagnostics | Settings groups |

## What Exists Today

### BI Surfaces

| Surface | Current state | Honest capability | Recommended setup shape |
|---|---|---|---|
| Power BI | Real `powerbi-client` adapter, secure iframe fallback, backend-issued token route | Strongest BI integration; SDK events/commands/metadata available when SDK mode is used | Mode cards: Quick preview, AAD SSO, Service principal. Show prerequisites, policy gates, and capabilities unlocked by each |
| Tableau | Iframe fallback through `GenericIframeAdapter` | Renders URL only; no Tableau SDK events/commands yet | Label as limited iframe mode. Future: Tableau Embedding API adapter + server-side trusted/JWT setup |
| Qlik | Iframe fallback | Renders URL only; no `qlik-embed`/selection API yet | Label as limited iframe mode. Future: qlik-embed auth, app/sheet/object IDs, selection/event capability |
| Looker | Iframe fallback | Renders URL only; no signed/cookieless embed route yet | Label as limited iframe mode. Future: signed/cookieless embed server route + Embed SDK events |
| Generic iframe | Real escape hatch | Refresh/fullscreen only; no introspection | Keep as explicit limited fallback |
| Databricks AI/BI Dashboard | Strategy only | Not implemented as a surface | Future first-class Databricks-native asset block |
| Genie Space surface | Strategy only; AI connector exists | Not implemented as a visual surface | Future question-first asset block |
| Databricks App | Strategy only | Not implemented as a hosted surface | Future app resource block |
| Unity Catalog asset / SQL result | Supporting routes exist in proxy | No asset browser/lineage surface yet | Future Launchpad + asset-config store |

### AI Connectors

| Connector | Current state | Honest capability | Key setup gap |
|---|---|---|---|
| Databricks Genie | Primary runtime path | Works through current v0 assistant path and probe | Keep canonical; improve setup readiness and warehouse/space permission readout |
| Supervisor local | Backend exists | Fan-out/synthesis path exists | Standardize `spaces` semantics as profile names vs space IDs |
| Supervisor real | Backend exists | Serving-endpoint agent path exists | Needs unified capability/readiness view |
| Foundation Model | Backend exists for section reasoning | Health/section routes exist | Wizard health path should route consistently under `/api` or use `/assistant/probe` |
| Azure OpenAI chat | Backend exists | Profiles can list | v0 UI can overpromise unless route dispatch is unified by profile type |
| Azure OpenAI analytics | Backend exists with SQL orchestration | Useful when schema context is configured | Config/env field parity and setup validation need tightening |
| Bedrock RAG | Backend exists | Minimal probe only | No rich KB metadata/citation readiness yet |
| Bedrock direct | Backend exists | Direct model route exists | Same runtime dispatch visibility gap |
| Generic profile | Inventory only | Should not be shown as a usable assistant connector | Hide unless explicitly marked usable |

### Knowledge And Databricks-Forward Assets

| Asset | Current state | Gap |
|---|---|---|
| PulsePacks | Installed pack registry, picker, matcher, Knowledge browser | No governed retrieval/citations yet |
| Pack matcher | Probe plus local pack vocabulary | Shallow compared with Smart Connect target |
| Discovery frames | Reachability exists and frame payload is bridged | Needs editable parameter builder and Prompt IR translator specialization |
| Databricks SQL / Unity Catalog | Supporting SQL/warehouse paths exist | No UC asset browser, lineage, metric view connector, or evidence drawer |
| Vector Search / governed retrieval | Architecture only | No provider adapter or `GroundingBundle` runtime |

## Relationship Problems To Fix

| Problem | Why it hurts users | Fix |
|---|---|---|
| BI Provider is mostly read-only in Settings while App picker changes real state | Settings says single source of truth but the app still owns key decisions | Make Settings the owner or explicitly mark the leaf as status-only |
| AI Provider exists in Settings and App independently | User can pick one in Settings while the running sidebar still uses another | Unify through one setup facade/store |
| Pack selection exists in Settings, App, probe inference, and wizard | The pack can look active in one place but not drive another | One `SetupState` facade should own pack and broadcast updates |
| Power BI modes are exposed as one dense form | Novice authors see too many identity/token concepts at once | Mode cards with prerequisites and progressive fields |
| Validation is mostly on apply | Users learn about bad IDs after trying to load | Inline validation with extracted URL chips and field-level readiness |
| Wizard re-run depends on first-run predicate | Existing embed config can suppress a requested re-run | Add explicit `forceWizard` behavior |
| `Done & ask` promise is ahead of implementation | The button suggests auto-submission but App drops the value | Wire it or hide the promise |
| Non-Genie connectors can appear in picker before unified runtime dispatch is obvious | UI can overpromise backend behavior | Capability registry should expose usable runtime route per connector type |
| System/BI license posture is duplicated | Repeated copy can drift | Shared read-only license component |
| Advanced reset misses some owned keys | Reset section can leave state behind | Include `pulseplay:bi-embed-config` in BI reset and dispatch store events |

## Progressive Setup Model

PulsePlay should use four layers, not one giant settings page.

### 1. Setup Home

Show readiness cards:

- BI surface
- AI connector
- Knowledge pack
- Governance
- Runtime/evidence

Each card has:

- status: `Ready`, `Partial`, `Blocked`, `Not configured`
- one next action
- dependency hint
- last probe/check timestamp
- admin-needed badge where the user cannot self-fix

### 2. Guided Setup

The wizard should stay short:

1. Role / work mode.
2. Surface + AI connector.
3. Minimal connection setup.
4. Pack + first question.

Advanced fields should deep-link to Settings, not appear by default.

### 3. Settings Details

Settings should remain the control room:

- BI
- AI
- Preferences
- System
- Advanced

But each leaf should show relationship badges:

- Requires
- Unlocks
- Governed by
- Last verified
- Owner/admin

### 4. Advanced / Support

Raw IDs, localStorage, support bundles, MSAL sign-out, and destructive reset should stay out of the novice path.

## Standard Setup Pattern For Every Connector

Every connector should follow this lifecycle:

```text
Declare -> Bind resources -> Validate config -> Verify auth -> Verify permission -> Probe runtime -> Show capabilities -> Enable actions
```

| Step | User-facing output |
|---|---|
| Declare | Connector appears as an available block only if policy allows it |
| Bind resources | User/admin sees host, asset ID, endpoint, warehouse, app, dashboard, or pack binding |
| Validate config | Field-level validation before save/load |
| Verify auth | Clear identity/token mode and who owns the permission |
| Verify permission | Shows required vs observed permission |
| Probe runtime | Status, metadata, warnings, pack suggestion |
| Show capabilities | What this connector can do: events, metadata, commands, streaming, citations, edit |
| Enable actions | Only render actions the connector can actually perform |

## Connector-Specific Setup Recommendations

| Connector | Recommendation |
|---|---|
| Power BI | Convert the embed mode select into three cards: Quick preview, AAD SSO, Service principal. Each card shows required IDs, who owns auth, policy gates, and unlocked capabilities |
| Tableau | Keep URL-only setup clearly labelled as iframe fallback. Future card should add Connected App/JWT and Embedding API v3 readiness |
| Qlik | Keep URL-only fallback. Future card should include tenant, app, sheet/object, OAuth/impersonation readiness, and qlik-embed UI type |
| Looker | Keep URL-only fallback. Future card should include Looker host, content type, signed/cookieless embed mode, and server-side signing status |
| Generic iframe | Keep minimal URL setup, but show "limited introspection" badge |
| Genie | Show space, warehouse, auth mode, probe health, and pack inference in one readiness card |
| Foundation Model | Show endpoint, auth mode, model serving permission, and structured-output support |
| Supervisor | Show child profiles/spaces as a dependency table with per-child probe result |
| OpenAI / Bedrock | Show as configured profiles only when runtime route and probe support are clear in the capability registry |
| PulsePacks | Show pack, sub-vertical, prompt context, and what is used today vs planned retrieval |

## Dropdown And Textarea Depth Standard

Rajesh asked for stronger visual depth so dropdowns and text areas are easier to identify, pick, and segregate. The implementation direction is:

- Raised control surface with a subtle shadow.
- Inset top highlight so fields feel pressable/active.
- Slight gradient from white to very light slate.
- Strong focus ring on keyboard/mouse focus.
- Textareas get a lightly lined background to signal editable writing space.
- Keep radius modest and enterprise-grade.

Implemented now:

- [styles.css](../playground/src/styles.css) adds shared depth variables and applies them to vendor/connector/pack/frame selects, embed inputs, AI sidebar input, Settings inputs, and textareas.
- [FirstRunWizard.tsx](../playground/src/components/FirstRunWizard.tsx) applies the same visual language to the first-question textarea.

Follow-up:

- Move wizard inline styling into shared classes.
- Reuse the same control tokens inside the future `StructuredAuthoringEditor`.

## Recommended Implementation Order

1. **P0 — Setup state facade.** One owner for vendor, connector, pack, embed config, and wizard completion. App and Settings consume the same state.
2. **P0 — Fix wizard re-run and probe route.** Add explicit force re-run behavior and route all probes under `/api` or through `/assistant/probe`.
3. **P0 — Runtime truth for connectors.** Do not show a connector as "ready" unless the active UI route can actually use it.
4. **P1 — Power BI mode cards.** Replace the dense select/form with progressive cards and inline validation.
5. **P1 — Setup Home readiness cards.** Surface the relationship graph as five cards with dependencies and next actions.
6. **P1 — Capability registry.** Expand `/assistant/capabilities` beyond the current shell response into policy-aware block/capability decisions.
7. **P1 — Structured authoring editor.** Start with Settings AI guidance or wizard first question.
8. **P1 — Frame builder.** Replace the frame select with parameter chips, missing-context badges, and compiled prompt preview.
9. **P2 — Knowledge preview.** Add "set active pack", sample question actions, and retrieval preview once `GroundingBundle` lands.
10. **P2 — Role-aware surface gating.** Hide developer/support/admin details from business users unless policy/persona permits.

## References Reviewed

- [Databricks dashboard embedding](https://docs.databricks.com/aws/en/dashboards/share/embedding)
- [Databricks Apps resources](https://docs.databricks.com/aws/en/dev-tools/databricks-apps/resources)
- [Databricks Genie setup](https://docs.databricks.com/aws/en/genie/set-up)
- [Power BI report embedding](https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/embed-report)
- [Tableau embedding authentication](https://help.tableau.com/current/api/embedding_api/en-us/docs/embedding_api_auth.html)
- [Qlik qlik-embed authentication](https://qlik.dev/embed/qlik-embed/authenticate/connect-qlik-embed/)
- [Looker signed embedding](https://docs.cloud.google.com/looker/docs/embed-enable)
- [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture)
- [OpenFeature providers](https://openfeature.dev/docs/reference/concepts/provider/)
