# Connector Platform Redesign — Proposal (2026-05-20)

> **Status:** DRAFT — seeking Codex's independent review before any code lands.
> **Audience:** Codex (primary reviewer), future-Claude, Rajesh.
> **Goal:** make PulsePlay's Setup screen + connector dispatch a single coherent, modular, portable design — solving both the IA confusion (`Settings → Setup → AI`) and the 7,000-line `proxy/server.js` monolith in one pass.
> **What this doc is:** a written-down brainstorm with explicit open questions. Not a decision yet.
> **What this doc is not:** an architecture decision record. The ADR comes after this conversation lands.

---

## 1. Context — why now

Across the 2026-05-20 session (cycles 11 → 15.5, PRs [#1](https://github.com/onerkm-in/PulsePlay/pull/1) through [#7](https://github.com/onerkm-in/PulsePlay/pull/7)) PulsePlay added Power BI semantic model as the **tenth AI backend path**, plus the Q&A embed surface, plus the cycle-14 cross-backend `discoveryContext` symmetry. Two things became clear at the same time:

1. **`proxy/server.js` is at ~7,500 lines** and the connector dispatch is increasingly entangled. Adding the PBI brain + Q&A added ~250 LOC inside the monolith. Two more cycles like this and the file crosses 8K — at which point IDE navigation, jump-to-def, and code review all degrade. Rajesh raised this on 2026-05-20: "if we keep each driver as a separate file which can be added or removed at any moment that would be real modular".
2. **Setup → AI is confusing for first-time authors.** Both the live regression (Claude) and the parallel UI regression (Codex) found:
   - The AI step has effectively one dropdown + one button, with a deep escape-hatch link to a 20+ field panel.
   - "Profile" hides connector type. Users pick `default` without knowing it's Genie. They can't pick PBI semantic-model because there's no surface that says "this is a thing PulsePlay supports — you just need to add one".
   - Power BI is two things (BI display **and** AI brain) but the IA pretends it's one.
   - "Setup needed" pill at top + "Configured" pill on the card can be on screen simultaneously — the two systems disagree about what "done" means.

These two problems share the same root cause: **the connector ecosystem is hardcoded into both `server.js` and `SetupGroup.tsx`**. Every new connector needs touches in two specific files, and adding a connector for a deployer is a manual `proxy/config.json` edit they can't discover.

The proposal: blend the modular-backend + Setup-redesign threads into one architecture where **adding a connector means dropping a file** and the UI auto-discovers it.

---

## 2. Current state, bluntly

### 2.1 Today's backend connector model

- 10 backend paths, all dispatched inside `proxy/server.js` (~7,500 LOC):
  - Genie / Azure OpenAI (chat + analytics) / Bedrock (RAG + direct) / Foundation Model / Supervisor / Supervisor-local / ResponsesAgent / Power BI semantic-model
- Each connector has a helper module in `proxy/lib/*.js` (good) but the **route registration, profile resolution, audit emit, and dispatch logic live in `server.js`** (bad).
- Profile detection is duck-typed: Genie is "has `spaceId` and no `type`", OpenAI is "has `azureOpenAiEndpoint`", etc. (`proxy/lib/connectorProbe.js#pickAdapter`).
- Connectors share helpers (audit log, profile resolver, allowlist check, `discoveryPromptInjector`, `packPromptInjector`) by virtue of all being in the same file. There's no explicit shared host API.

### 2.2 Today's frontend Setup model

- `playground/src/settings/groups/SetupGroup.tsx` — three inline cards (BI / AI / Pack).
- AI card surfaces a single `<select>` populated from `GET /api/assistant/profiles`.
- The connector TYPE is not visible to the user. The card's right column shows a status pill (`Configured` / `Not picked`) that comes from `setupReadiness.ts`.
- Bug B1 (caught by both regression passes): `/api/assistant/allowlist` returns `aiProfiles: []` despite the proxy having 3 profiles — shape mismatch where proxy returns `{default: [...], byGroup: {}}` but the client filters as a flat array. Setup ends up showing "No profiles available" while the proxy is healthy with 3.
- Bug B3: "Databricks docs" link is hardcoded next to the AI profile select, regardless of which connector type is active.

### 2.3 The deferred items that prompted this redesign

From the post-cycle agenda (`docs/AGENDA.md` "Next up"):

- Setup → AI bug fixes (B1 / B2 / B3)
- "Open Power BI Q&A" launch button (route exists, no UI entry point)
- Front-end UI for adding profiles (today requires editing `proxy/config.json` manually)
- Tab integration for PBI Q&A inside Pulse (touches `pulse/visual.tsx` `activeTab` — 20+ call sites)
- Plugin architecture Phase A (scaffolding only) and Phase B/C (per-connector migration)

The redesign in this doc, if accepted, **collapses most of those items into one architectural shift** instead of patching each separately.

---

## 3. The single load-bearing artifact: the **connector manifest**

The proposal hinges on every connector file exporting an object that combines two contracts:

- **Runtime contract** — what the proxy needs to dispatch a request to this connector.
- **Setup manifest** — what the UI needs to render a brand card and an "Add a profile" panel.

```js
// proxy/connectors/genie.js  ← drop this file in, the rest follows
module.exports = {
    // ─── Identity ────────────────────────────────────────────────────
    id: 'genie',
    displayName: 'Databricks Genie',

    // ─── Runtime contract (dispatch + probe) ─────────────────────────
    matchProfile(profile) { return !!profile?.spaceId && !profile.type; },
    async probe(profile, profileName, helpers) { /* ... */ },
    register(host) {
        host.app.post('/assistant/conversations/start', /* ... */);
        host.app.get('/assistant/conversations/:cid/messages/:mid', /* ... */);
    },
    async unregister(host) { /* optional cleanup */ },

    // ─── Setup manifest (surfaced via /assistant/connector-types) ────
    manifest: {
        category: 'lakehouse-native',
        icon: 'databricks-genie',
        tagline: 'Natural-language Q&A over Genie spaces',
        description: 'Databricks-native. Runs SQL against your warehouse with full provenance.',

        capabilities: {
            llm: true,
            deterministic: false,
            qnaEmbedSurface: false,
            streamingAnswer: true,
            ragGrounded: true,
        },

        profileSchema: {
            spaceId:     { required: true,  label: 'Genie space ID', help: 'GUID from your Genie space URL' },
            host:        { required: true,  label: 'Databricks workspace URL' },
            token:       { required: true,  secret: true, label: 'PAT (or use authMode: oauth-m2m)' },
            warehouseId: { required: false, label: 'SQL warehouse ID' },
        },

        setupSteps: [
            'Get your Genie space ID from the URL',
            'Generate a Databricks PAT or set up OAuth M2M',
            'Add a profile to proxy/config.json',
            'Restart the proxy',
        ],

        docsUrl: 'https://docs.databricks.com/en/genie/index.html',
    },
};
```

This is the **one artifact** that, if we agree on, lets everything else fall out cleanly.

---

## 4. How the loop closes

```
proxy/connectors/genie.js               ← deployer drops a file here
        │
        ▼
proxy/lib/connectorRegistry.js          ← boot-time directory scan
        │
        ▼
GET /assistant/connector-types          ← serves the manifest list (read-only)
        │
        ▼
playground/src/setup/ConnectorBrand     ← generic component renders any manifest
        │
        ▼
First-time author sees a brand card     ← without any code change above
```

**Drop `proxy/connectors/snowflake.js`** → backend serves a new manifest → Setup shows a Snowflake card. **Zero frontend code changes.**

**Delete `proxy/connectors/genie.js`** → backend stops serving it → UI drops the card. **Zero frontend changes.**

**Replace one connector with a newer version** → manifest can change schema → UI updates.

That's the modular promise made literal. The Setup screen becomes a *renderer* of the connector ecosystem, not a hand-coded catalog of it.

---

## 5. The host API — the connector ↔ proxy contract

Connectors only touch a single `host` object. This is what protects the modular promise — if `host` stays small, refactoring or replacing a connector can't break the rest of the proxy.

```js
// proxy/lib/connectorHost.js
function buildHost(app) {
    return {
        // Express + routing
        app,

        // Audit + error envelopes
        auditLog,
        sendProblem, createProblem,
        sendNoMatchingProfile,

        // Profile registry + resolution
        profileRegistry,
        profileByName,
        profileAllowedForRequest,

        // Shared transport helpers
        databricksRequest,            // Databricks REST (used by Genie, Supervisor, FM)
        spHashForProfile,             // Service-principal identity hashing for audit

        // Shared injection helpers (cycles 12-14)
        discovery: discoveryPromptInjector,  // composeUserMessageWithContext, composeSystemPromptWithContext, formatDiscoveryContext
        packs:     packPromptInjector,       // resolvePackContext, wrapAsGenieUserMessage

        // Shared validators / sanitizers
        validateFrame, prependFrameContext,
        sanitiseSlotName,

        // Latency-lever resolution (cycle 13)
        resolveValidationRetryBudget,   // proxy/lib/validationRetryBudget.js
    };
}
```

**Rule:** only add to `host` what at least two connectors need. Anything one-connector-specific stays inside that connector file. Otherwise `host` becomes the new monolith one layer down.

Cross-cutting features that already obey this rule:
- `discoveryPromptInjector` (cycle 14) — every backend route uses the same composers
- `packPromptInjector` — same
- `validationRetryBudget` (cycle 13) — extracted specifically for unit testability

Things that should stay connector-specific:
- DAX templates (only PBI semantic-model needs them)
- SigV4 signing (only Bedrock)
- Q&A embed token mint (only PBI)
- LangGraph supervisor wiring (only Supervisor)

---

## 6. The Setup UI becomes generic

```jsx
function Step2_AiBrain() {
    const { connectors } = useConnectorTypes();  // GET /assistant/connector-types
    const grouped = groupBy(connectors, c => c.manifest.category);

    return (
        <Wizard.Step title="Where does the AI think?" stepNumber={2} skippable>
            {Object.entries(grouped).map(([category, list]) => (
                <CategoryBlock key={category} title={CATEGORY_LABEL[category]}>
                    {list.map(connector => (
                        <ConnectorBrandCard
                            key={connector.id}
                            connector={connector}
                            profiles={connector.configuredProfiles}
                            onAddProfile={() => openProfileSetupDialog(connector)}
                            onSelectProfile={(profileName) => setActive(profileName)}
                        />
                    ))}
                </CategoryBlock>
            ))}
        </Wizard.Step>
    );
}
```

`ConnectorBrandCard` is a generic component. It **doesn't know "Genie" or "PowerBI" exist by name**. It just renders the manifest it's handed. The "Add a profile" dialog reads `manifest.profileSchema` and `manifest.setupSteps`, generates a JSON snippet, and shows the Microsoft / Databricks / AWS prereqs.

### 6.1 The proposed Setup IA

```
┌───────────────────────────────────────────────────────────────────────┐
│  PulsePlay Setup                                          Progress: ●○○│
│  Connect your dashboard + AI brain in 2 steps + an optional 3rd.       │
│  Both are optional — you can run with just a dashboard, just an AI,    │
│  or both.                                                              │
└───────────────────────────────────────────────────────────────────────┘

┌─ STEP 1 — Where do users LOOK? ──────────────────── [Skip this step] ─┐
│ Pick the BI tool whose dashboards you want to embed in the canvas.     │
│ Without this, the canvas stays empty.                                   │
│                                                                         │
│ [Power BI]  [Tableau]  [Qlik]  [Looker]  [Databricks AI/BI]            │
│ [Databricks Genie iframe]  [Generic iframe]  [None]                    │
│                                                                         │
│ ● Selected: Power BI — Embed URL: https://app.powerbi.com/...         │
│   [Test render]  [Open full BI settings]                                │
└───────────────────────────────────────────────────────────────────────┘

┌─ STEP 2 — Where does the AI THINK? ─────────────── [Skip this step] ─┐
│ Pick the AI brain that answers users' questions. Without this, AI      │
│ Insights and Ask Pulse stay disabled.                                   │
│                                                                         │
│ Lakehouse-native                                                        │
│ ┌──────────────────────────┐ ┌──────────────────────────┐              │
│ │ Databricks Genie         │ │ Mosaic AI Supervisor     │              │
│ │ 3 profiles · ● Default   │ │ 1 profile · ○ supervisor │              │
│ │ [Manage]                 │ │ [Use this]               │              │
│ └──────────────────────────┘ └──────────────────────────┘              │
│                                                                         │
│ Foundation models                                                       │
│ ┌──────────────────────────┐                                            │
│ │ Mosaic AI Foundation     │                                            │
│ │ 1 profile · ○ foundation │                                            │
│ │ [Use this]               │                                            │
│ └──────────────────────────┘                                            │
│                                                                         │
│ Cloud LLM                                                               │
│ ┌──────────────────────────┐ ┌──────────────────────────┐              │
│ │ Azure OpenAI             │ │ AWS Bedrock              │              │
│ │ 0 profiles · [+ Add]     │ │ 0 profiles · [+ Add]     │              │
│ └──────────────────────────┘ └──────────────────────────┘              │
│                                                                         │
│ No-LLM (deterministic)                                                  │
│ ┌──────────────────────────┐                                            │
│ │ Power BI semantic model  │                                            │
│ │ 0 profiles · [+ Add]     │                                            │
│ │ ↪ no LLM · DAX templates │                                            │
│ └──────────────────────────┘                                            │
│                                                                         │
│ ▸ Show all 10 brain types                                              │
└───────────────────────────────────────────────────────────────────────┘

┌─ STEP 3 — What does your data MEAN? (optional) ──────────────────────┐
│ Pick a vertical pack so the AI uses your industry's vocabulary, KPI    │
│ definitions, and metric direction rules.                                │
│                                                                         │
│ [None] [CPG/FMCG] [Retail] [Healthcare] [Financial Services] [...]    │
│                                                                         │
│ ● Selected: CPG/FMCG — Supply Chain                                    │
└───────────────────────────────────────────────────────────────────────┘

┌─ Status ──────────────────────────────────────────────────────────────┐
│ ✅ BI: Power BI configured (test render passed)                        │
│ ✅ AI: Databricks Genie / Default (probed — 12 tables, 4 KPIs)         │
│ ⚠️  Pack: CPG/FMCG selected but Smart Connect didn't infer one         │
│                                                                         │
│ [Open the playground →]                                                 │
└───────────────────────────────────────────────────────────────────────┘
```

### 6.2 Power BI's dual axis — explicit handling

PBI shows up in **both** registries because it's two separate modules:
- `bi-adapters/powerbi/index.ts` → Step 1 (BI display)
- `proxy/connectors/powerbi-semantic-model.js` → Step 2 (AI brain)

They have independent profiles + independent credentials. **If a deployer wants to share AAD SP credentials** between the embed token mint and the dataset access, the manifest can declare a `credentialBundle` field that both connectors read from — small config-side helper, no schema acrobatics.

For v1, we don't have to be fancy. Two separate profile fields. If the deployer wants to share creds, they paste them into both.

---

## 7. Phased rollout

| Slice | What | Effort | Ships |
|---|---|---|---|
| **S1** | Connector manifest spec ADR + `GET /assistant/connector-types` endpoint serving a HARDCODED `proxy/lib/connectorManifests.js` table (no dir scan yet) + new `ConnectorBrandCard` + new Setup step that uses it. Existing routes unchanged. | ~2 days | Working manifest-driven Setup UI without migrating any connector |
| **S2** | Migrate **one** connector to a real `proxy/connectors/<id>.js` file. Recommend Power BI semantic-model (newest, smallest blast radius). Boot-time scan starts here. Other 9 connectors stay in `server.js`. | ~1 day | Proves the directory-scan model end-to-end |
| **S3** | Migrate the remaining 9 connectors one PR at a time. Order: openai → foundation-model → supervisor → bedrock-direct → bedrock-rag → supervisor-local → responses-agent → genie (last, biggest blast radius). | ~3-5 days | Per-PR independently shippable |

**S1 alone gives the user-visible win** (the Setup redesign). S2 + S3 deliver the architectural promise (drop-in/drop-out).

We commit to S1 immediately. S2 + S3 are confirmed-but-deferred.

---

## 8. Open design questions

These are the explicit forks. Codex's view requested on each.

### Q1 — Soft migration vs hard cutover for profile-type detection

Today's `proxy/lib/connectorProbe.js#pickAdapter` duck-types: `profile.spaceId` → Genie. With manifests, every connector declares `matchProfile(profile)`. Two ways the migration plays out:

| Option | Behavior | Risk |
|---|---|---|
| **A — Hard cutover** | Every profile MUST declare `type` field. Startup validator fails fast on legacy configs. | High — every deployer migrates simultaneously |
| **B — Soft migration** | `matchProfile(profile)` is the legacy duck-type. Profiles may declare `type` OR be inferred. Over time deployers add explicit types. | Low — backward-compatible |

**Claude's vote:** B.
**Codex: agree / push back?**

### Q2 — Manifest required-fields scope

Proposed required fields: `id`, `displayName`, `category`, `icon`, `tagline`, `description`, `capabilities`, `profileSchema`, `setupSteps`, `docsUrl`.

Proposed deferred: input validation regexes, secret rotation hints, allowlist integration, example payloads.

**Codex: anything missing that should be required for v1? Anything required-list that should be optional?**

### Q3 — Profile editor: JSON snippet vs generated form vs server-write

| Option | UX | Security | Code cost |
|---|---|---|---|
| **A — JSON snippet** | Generated JSON to paste into config.json | Safest | Smallest |
| **B — Form preview** | Generated form from `profileSchema` + "Copy as JSON" button | Same as A | Medium |
| **C — Server-side write** | Form submits to `POST /admin/profiles` writing config.json | Needs shared-key + opt-in flag + audit | Largest |

**Claude's vote:** ship A in S1, layer B as a follow-up (B is a strict superset of A). C is a separate security cycle.
**Codex: same trajectory, or different?**

### Q4 — Categories taxonomy

Proposed:
- **Lakehouse-native** — Genie, Supervisor, Supervisor-local, ResponsesAgent (all Databricks)
- **Foundation models** — Mosaic AI Foundation Model
- **Cloud LLM** — Azure OpenAI (chat + analytics), Bedrock (direct + RAG)
- **No-LLM (deterministic)** — Power BI semantic model
- **Future** — direct-view-no-LLM (Rajesh's SQL-direct ask), demo / synthetic-data connector

**Codex: cleaner cuts you'd suggest? Should "Foundation models" merge into "Lakehouse-native" since FM is also Databricks?**

### Q5 — BI adapter parity in S1, or follow-up?

The same manifest pattern should apply to `bi-adapters/*` (Power BI / Tableau / Qlik / Looker / Databricks AI/BI / Genie-iframe / generic-iframe). The Setup wizard's Step 1 (BI) would then also be manifest-driven.

| Option | Effort delta on S1 | Risk |
|---|---|---|
| **A — BI parity in S1** | +1 day | More moving parts; harder to revert if S1 is wrong |
| **B — BI in a follow-up cycle** | +0 | BI Setup stays as-is for one more cycle |

**Claude's vote:** B. AI is the screaming pain; BI Setup works tolerably today.
**Codex: counter-argument?**

### Q6 — Wizard vs single-page Setup

Two UX options:
- **Wizard** (default for first-time): three steps with progress, "next/back" navigation.
- **Single-page** (default for power users): all three steps visible at once, scroll between them.

Possible compromise: **wizard by default + "Show all steps" toggle** that flattens to single-page.

**Codex: which is the right primary?**

### Q7 — What to do with Codex's WIP

Codex's parallel UI regression session left ~15 modified files + 4 new files in the working tree. They include `playground/src/settings/groups/SetupGroup.tsx +221 lines` and `playground/src/settings/__tests__/vendorMatrix.test.tsx +87 lines`.

With this redesign, **`SetupGroup.tsx` is going to be gutted and rewritten anyway**.

| Option | Recommendation |
|---|---|
| **A — Audit Codex's WIP first, extract any backend bug fixes (Bug B1 likely), then redesign** | Recommended — Bug B1 fix is independent of the redesign and valuable on its own |
| **B — Discard the WIP, let the redesign supersede** | Loses any value Codex added |
| **C — Land Codex's WIP first as its own PR, then redesign on top** | Slower; conflicts likely |

**Claude's vote:** A.
**Codex: how do you want your own WIP handled?**

---

## 9. Migration path for existing connectors

For each of the 10 existing backend paths, the migration to `proxy/connectors/<id>.js` looks like this:

1. **Extract the route handler** from `server.js` into the new file. The handler keeps the same Express signature; only `host.*` replaces direct module references.
2. **Extract the profile resolver** from `server.js` (e.g. `resolveFoundationModelProfile`) into the connector's `matchProfile`.
3. **Move the lib helper** (`proxy/lib/foundationModelClient.js`, `proxy/lib/bedrock.js`, etc.) into the connector folder OR keep it shared if multiple connectors use it (`proxy/lib/databricksRequest.js` stays in `host` because Genie + Supervisor + FM all use it).
4. **Add the `manifest` block** with the fields specified in §3.
5. **Add a `connector.test.js`** with the same fixtures + assertions the route had before.
6. **Delete the original route + resolver from `server.js`** in the same PR.
7. **Run the full test suite** — should be unchanged (same routes, same payloads, same audit emit).

Each migration is independently revertable (one file added, one section deleted from `server.js`).

---

## 10. Risks + tradeoffs

| Risk | Mitigation |
|---|---|
| `host` API grows to 50+ fields and becomes the new monolith one layer down | Rule: only add to `host` what at least two connectors need. Anything else stays in the connector. |
| Connector load order matters and we don't notice until production | Boot-time scan logs the list of connectors discovered + their registration order. Audit log emits on first request to each. |
| Two connectors claim the same route → silent override | Registry checks for route collisions at boot, fails loudly. |
| Connector crashes at load time → proxy refuses to start | Catch + log + skip the broken file. Boot succeeds with N-1 connectors. Audit log surfaces "1 connector failed to load: bedrock.js — TypeError at line 42". |
| Manifest schema drifts; old connectors stop working | Manifest gets a `version: 1` field. Registry rejects manifests with unsupported version + logs. |
| Frontend manifest schema diverges from backend | One TypeScript interface file shared between proxy + playground via a thin types package or via duplicated-and-tested contract. |
| Hot-reload (drop a file without restart) seems easy but is a footgun zoo | Don't promise it for v1. Restart-on-change is fine and matches deployer ops. |

---

## 11. What I'm specifically asking Codex

Please weigh in on:

1. **Q1-Q7 in §8.** Either agree, push back with a counter-position, or flag an option I didn't consider.
2. **Manifest field list (§3).** Anything you'd add, remove, or rename? Is `capabilities` the right grouping or should it be flatter?
3. **Host API surface (§5).** Is the proposed `host` object the right minimum? Anything that should be added that two connectors will need?
4. **Power BI dual-axis handling (§6.2).** Acceptable to ship two separate profiles for v1, or do you want `credentialBundle` in S1?
5. **Migration order in §7 / S3** (`openai → foundation-model → supervisor → bedrock-direct → bedrock-rag → supervisor-local → responses-agent → genie`). Genie last because it's the most integrated. Push back if you'd reorder.
6. **What I missed.** Anything in the proxy or the Setup UI that this redesign will collide with that I haven't anticipated?

If you broadly agree, +1 in a follow-up PR or comment and we proceed to S1. If you push back on the spec, write your view in this doc under a new "## Codex review" section so we can argue it out before any code lands.

---

## 12. Decision log (empty)

This section gets filled in after Codex review + Rajesh's call. Format:

```
### 2026-MM-DD — DECIDED
- Q1: <chosen option>
- Q2: <chosen option>
- ...
- Signed off by: Claude / Codex / Rajesh
```

---

## Appendix A — Cross-cycle context Codex may want

| Reference | What |
|---|---|
| [docs/HANDOVER.md](HANDOVER.md) | Top entry: "Session arc — 6 cycles shipped (Cycles 11 → 15.5)" |
| [docs/AGENT_SYNC.md](AGENT_SYNC.md) | `[DECISION]` block locking the modular direction on 2026-05-20 |
| [docs/AGENDA.md](AGENDA.md) | "Next up" — ordered open-work list including this redesign + deferred bugs |
| [docs/ARCHITECTURE.md](ARCHITECTURE.md) | "Ten runtime backend paths" table + "Connector plugin architecture" stub |
| [docs/PROXY_REFERENCE.md](PROXY_REFERENCE.md) | Section 1.8 Power BI semantic-model + route table |
| [CLAUDE.md](../CLAUDE.md) | Status block (test counts: proxy 1013/1013, playground 1103/1103) |

| File | Why it matters |
|---|---|
| `proxy/server.js` | The 7,500-line monolith this redesign breaks up |
| `proxy/lib/connectorProbe.js#pickAdapter` | Current duck-typed dispatcher — becomes the matchProfile delegation |
| `proxy/lib/discoveryPromptInjector.js` | Cycle-14 shared composers — becomes part of `host.discovery` |
| `proxy/lib/packPromptInjector.js` | Cycle-C shared pack-context resolver — becomes part of `host.packs` |
| `proxy/lib/validationRetryBudget.js` | Cycle-13 extracted lever helper — pattern for "extract for testability" |
| `playground/src/settings/groups/SetupGroup.tsx` | The Setup UI being redesigned |
| `playground/src/settings/settingsRoute.ts` | Allowlist hydration — where Bug B1 likely lives |
