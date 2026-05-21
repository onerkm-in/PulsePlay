# Settings, Author, and Viewer UX Structuring Scan

Status: scan and sequencing note, 2026-05-21
Scope: current Settings, Setup, root viewer shell, and near-term native-adapter planning. This is not an implementation spec and does not delete or rename existing options.

## Executive Verdict

The current Settings architecture is worth keeping. The code already has a modular Settings shell, deep links, a Setup group, a readiness model, status chips, copy links, tests, and clear ownership direction. The flaw is not that Settings is weak. The flaw is that Settings is still organized around implementation modules more than around the two people using it:

- **Author:** wants to make a deployment work, choose data/BI/AI defaults, validate trust boundaries, and preview what users will see.
- **Viewer:** wants to ask, inspect, trust the answer, and recover from empty/error states without seeing deployment machinery.

The best path is a role-and-scope layer over the existing Settings system, not a rewrite. Keep the routes, keep every option, keep the additive posture. Add a better model for who owns a setting, when it matters, and how the UI should expose it.

## What Is Already Strong

- **Settings shell structure.** `SettingsShell` already gives us a real settings product surface: rail, search, deep links, status strip, copy links, and grouped content.
- **Setup is the right entry point.** `SetupGroup` and `setupReadiness.ts` already encode the idea that authors need a guided path before they need every detailed control.
- **The two-axis model is visible.** AI connector and BI vendor are separately configurable, which preserves the project spine.
- **F5/F5.1 solved an important viewer contract.** Requested surface vs effective surface is now explicit. That same thinking should be applied to Settings: requested author intent vs deployable runtime truth.
- **Native adapter direction is clean.** Native remains renderer-only. That lets Settings describe native as a surface mode, not as a new data/query workbench.

## Main Structural Gap

Settings currently mixes four scopes in one visual language:

| Scope | Examples | UX problem today |
|---|---|---|
| Deployment policy | allowlist, license posture, governance status | Shown beside author choices even when read-only or unavailable |
| Author defaults | BI vendor, AI profile, pack, layout preset, enabled surfaces | Correctly editable, but scattered across Setup, BI, AI, Preferences |
| Viewer preference | last surface, layout feel, theme, split position | Mixed with author deployment defaults |
| Support/developer controls | diagnostics, export bundle, localStorage reset, performance levers | Visible in the same tone as normal author setup |

This is why some screens feel heavier than they need to. The product does not need fewer controls. It needs controls labeled by ownership and staged by intent.

## Role Model

### Viewer

The viewer should see the application, not the configuration system. The shell should expose:

- Current surface: AI Insights, Ask Pulse, Dashboard.
- Trust status in plain language: governed, restricted, unavailable, or degraded.
- Scope/evidence access when useful.
- Empty/loading/error states that tell the viewer what to do next.
- Setup or contact-admin action only when the deployment is not usable.

Bad idea: showing provider catalogues, warehouse terms, allowlist internals, or embed-token copy to a viewer-facing blocked state.

### Author

The author should see a guided configuration flow first, then details. The author path should answer:

- What data/BI surface am I showing?
- Which AI connector answers questions?
- Which knowledge pack or Databricks source grounds the response?
- What will the viewer see by default?
- Is governance enforced and tested?
- Can I preview the exact viewer state?

Bad idea: making the author start in an implementation inventory of controls.

### Admin or Deployer

The admin/deployer owns policy, secrets, host settings, source allowlists, and proxy health. In the browser, these should mostly be read-only:

- policy source and status
- configured hosts and vendors
- governance attestation mode
- proxy health
- audit/log links
- safe support bundle export

Bad idea: browser controls that imply the author can fix server-side policy, tokens, or governance from the frontend.

### Support or Developer

Support controls are valuable, but they need a different tone and placement:

- diagnostics
- reset scoped state
- export support bundle
- performance levers
- local development toggles

Bad idea: placing developer levers in the same visual hierarchy as author setup.

## Current UX Findings

### P1 - Add a Settings Role and Scope Contract

Every setting needs metadata: role, scope, lifecycle stage, source of truth, and whether it is editable, read-only, derived, or blocked. Without this, screens will keep accreting controls that are individually valid but collectively hard to trust.

Suggested pure model:

```ts
type SettingRole = "viewer" | "author" | "admin" | "support";
type SettingScope = "deployment-policy" | "author-default" | "viewer-preference" | "session-runtime" | "developer";
type SettingLifecycle = "connect" | "ground" | "shape" | "verify" | "operate" | "recover";

interface SettingLeafDescriptor {
  id: string;
  group: string;
  role: SettingRole[];
  scope: SettingScope;
  lifecycle: SettingLifecycle;
  sourceOfTruth: "settingsStore" | "embedConfigStore" | "pulseVisualSettings" | "proxy" | "runtime";
  editMode: "editable" | "readOnly" | "derived" | "blocked";
}
```

This can live as a pure module first, for documentation/tests, before it drives UI.

### P1 - Make the Save Bar Honest

`SettingsSaveBar` currently behaves like a save/discard system, but many settings already write live to localStorage or runtime stores. That makes "Save changes" semantically soft, and "Discard" can be misleading if live state has already changed.

Best fix: either make Settings truly draft-based for author changes, or rename the pattern to something honest such as "Changes applied locally" with "Review changes" and "Reset section." A fake save affordance is worse than no save affordance because it teaches authors the wrong mental model.

### P1 - Treat Fail-Closed as a First-Class UI State

In a headless DOM pass with the proxy down, Setup correctly reported governance allowlist failure, but still rendered provider choices and downstream setup controls. That is useful for local development, but in production it weakens the trust story.

Recommended behavior:

- **Policy unavailable, production:** show a blocked setup state with "Check proxy" and support details. Do not imply the author can choose around governance.
- **Policy unconfigured, dev/internal:** allow zero-config options, but label the state as development/unconfigured.
- **Policy available:** show normal author setup.

Bad idea: rendering the same controls for "policy not configured" and "policy fetch failed." Those are not equivalent.

### P1 - Add Mobile Settings Navigation Back

`SETTINGS_SPEC.md` expects a compact top tab strip below narrow widths. Current CSS hides the rail below 640px. That leaves small screens with weaker navigation across Settings groups.

Fix: convert the left rail to a horizontal segmented group or select-style nav on narrow screens. Do not rely on search as the only way to move.

### P1 - Add a Unified Authoring State Facade

The current Settings story spans `settingsStore`, `embedConfigStore`, `pulseVisualSettingsStore`, runtime shell state, allowlist data, pack data, and proxy health. That is manageable in code, but not as a mental model.

Add a pure authoring facade:

```ts
interface AuthoringStateSnapshot {
  biSurface: {
    requestedVendor: string;
    effectiveVendor: string;
    configured: boolean;
    blockedReason?: string;
  };
  assistant: {
    requestedProfile: string;
    effectiveProfile?: string;
    configured: boolean;
    blockedReason?: string;
  };
  knowledge: {
    requestedPack?: string;
    effectivePack?: string;
    configured: boolean;
  };
  viewerExperience: {
    requestedSurface: string;
    effectiveSurface: string;
    layoutPreset: string;
    fallbackReason?: string;
  };
}
```

This should power Setup Home, the setup pill, Settings status, and System health. One snapshot, many presentations.

### P2 - Replace Dense Control Pages with Mode Cards

The BI page especially needs author-oriented mode cards:

- Native result canvas
- Generic iframe preview
- Power BI quick preview
- Power BI SSO or service principal
- Tableau/Qlik/Looker iframe today, SDK later

Each card should show readiness, capability level, governance requirements, and next action. Only after a mode is selected should the dense fields appear.

Bad idea: one large embed form that tries to explain every vendor and mode at once.

### P2 - Split "Configured Now" from "Browse All Connectors"

The AI page should lead with the current configured connector and whether it is reachable. The full connector catalogue should be secondary. A catalogue-first screen is good for discovery, but it is noisy when the author is trying to confirm a deployment.

### P2 - Extract Shared Settings Primitives

The groups still rely on many local inline styles and one-off blocks. That makes professional polish hard and makes future Figma parity harder.

Create a small settings component kit:

- `SettingsSection`
- `SettingsLeaf`
- `ModeCard`
- `ReadOnlyValue`
- `PolicyCallout`
- `CapabilityBadge`
- `ReadinessCard`
- `ScopedResetButton`
- `InlineProbeResult`

This is not a design-system rewrite. It is a small local kit for consistency.

### P2 - Reduce HelpTip Density

The headless pass showed many `i` buttons. Help is useful, but the page reads as if every line needs a caveat. Use shorter labels, scoped callouts, and one "Learn more" drawer for deep guidance.

Also keep the known HelpTip console issue on the hardening list until fixed.

### P2 - Make Viewer Empty, Loading, and Error States Product-Grade

The viewer shell needs trustworthy states independent of Settings:

| State | Viewer copy should answer |
|---|---|
| Empty native canvas | What should I ask or pin to render something here? |
| No BI configured | Can I use native results, or do I need an author/admin? |
| Proxy down | Is this a temporary service issue or a setup issue? |
| Governance blocked | Is access denied, policy unavailable, or source missing? |
| AI connector failed | Can I retry, change connector, or contact support? |

Bad idea: surfacing raw setup/proxy language as the first thing the viewer sees.

### P2 - Keep "Dashboard" as UI Language

The registry id `bi-viz` should remain stable. The visible UI should consistently say "Dashboard." Older docs and tests that expect "BI Viz" should be updated only where they describe user-facing text.

### P2 - Tighten Reset Coverage

The Advanced reset model should be checked against all active stores. The known risk is that reset groups can miss keys such as embed config, active surface, performance levers, or Pulse visual settings. Reset should be scoped, predictable, and tested by owned key lists.

### P3 - Retone Persona/Setup Visuals for Enterprise Trust

The first-run persona framing helped early momentum, but the author/admin surface should feel less playful and more operational. Replace emoji/persona-first visuals with restrained iconography and mode cards. Keep the friendly tone, but make the screen feel like a deployable product.

## Target Information Architecture

Do not move everything at once. Use the current routes and layer a better model.

### Near-Term Route Model

| Route | Target job |
|---|---|
| `/settings/setup` | "Get this deployment working" readiness home and guided fixes |
| `/settings/bi` | Author chooses surface mode and BI/native configuration |
| `/settings/ai` | Author chooses connector, grounding, pack, and response behavior |
| `/settings/preferences` | Viewer experience defaults and personal preferences, clearly tagged |
| `/settings/system` | Governance, health, policy, and audit read-only truth |
| `/settings/advanced` | Support, reset, diagnostics, performance, and development-only controls |

### Future Group Names to Consider

If the team wants a stronger author-facing IA later, this is the cleanest shape:

| Future group | Maps from current |
|---|---|
| Setup | current Setup |
| Surfaces | BI + layout/surface pieces from Preferences |
| Assistant | AI connector + knowledge + response behavior |
| Experience | theme, viewer defaults, surface switching, accessibility |
| Governance & Health | System, policy, proxy, audit |
| Advanced | reset, diagnostics, performance, developer controls |

Do not do this rename until the role/scope contract exists. Otherwise it becomes a cosmetic shuffle.

## Author Flow

Best author flow:

1. Open Setup Home.
2. See readiness cards: Data/BI surface, AI connector, Knowledge/source, Governance, Viewer preview.
3. Pick a mode card, not a raw implementation form.
4. Fill only the required fields for that mode.
5. Probe/test.
6. Preview as viewer.
7. Promote defaults.

Every step should keep the same rule: JSON defines possibilities, proxy defines permissions, pack defines intent.

## Viewer Flow

Best viewer flow:

1. Land directly in the working app.
2. See one primary surface and a clear AI affordance.
3. If native is selected, the canvas shows the latest or pinned AI result.
4. If something is unavailable, the blocked state says what happened and who can fix it.
5. Settings is secondary unless the viewer has author/admin permissions.

The viewer should not need to understand Databricks, Power BI embed modes, allowlists, or token issuance to trust the product.

## Native Adapter UI Implications

Native should be presented as a BI surface option, not as an authoring tool.

Author-facing card:

- "Native result canvas"
- "Renders AI query results as charts"
- "No vendor embed required"
- "Requires governed proxy result attestation before production render"
- Capabilities: render result, render spec, clear, theme, resize
- Non-capabilities: query execution, modeling, drag layout, cross-filter, drill, sharing, permissions

Viewer-facing state:

- Empty: ask a question or pin a result.
- Loading: rendering answer result.
- Blocked: governed result attestation missing or source unavailable.
- Rendered: chart/table result plus evidence and source scope.

Bad idea: adding SQL editors, drag handles, save-layout controls, or "build dashboard" copy to native. That is how Option B turns into Option C by accident.

## Unified Proxy Position

The right direction is a **single proxy ecosystem** for Pulse PBI and PulsePlay. That should mean one proxy codebase, one governance contract, one connector registry direction, one audit vocabulary, and one result envelope. It should not blindly require one physical process or one local port in every environment.

Best rule:

> One proxy product and API contract. Multiple deployment topologies allowed.

### Why a Unified Proxy Is Right

- Governance stays in one place. Unity Catalog, source allowlists, attestation, audit logging, and token issuance should not fork between Pulse PBI and PulsePlay.
- Backend connector work benefits both clients. Genie, Foundation Model, Supervisor, ResponsesAgent, Power BI semantic-model, and future Databricks source refs should not be implemented twice.
- Pulse PBI gets proxy upgrades automatically when the contract is backward-compatible, especially governance attestation and source metadata.
- PulsePlay can become the richer authoring/testing shell while Pulse PBI remains the embedded custom visual consumer.

### What Not To Do

Do not force PulsePlay to inherit Pulse PBI sandbox constraints just because the proxy is shared. Pulse PBI may need XHR-safe, non-streaming, small-payload paths. PulsePlay can still use modern browser features such as `fetch`, SSE/NDJSON, larger lazy-loaded experiences, richer diagnostics, and top-level browser storage.

Do not turn "single proxy" into "one route shape forever." The contract should be shared, but routes can expose capability-aware variants.

### Recommended Contract

Every proxy request should be able to identify the client:

```http
X-Pulse-Client: pulse-pbi | pulseplay
X-Pulse-Client-Version: <semver-or-commit>
X-Pulse-Request-Id: <uuid>
```

The proxy should include the client in audit records:

```ts
type PulseClientApp = "pulse-pbi" | "pulseplay";

interface ProxyAuditContext {
  clientApp: PulseClientApp;
  clientVersion?: string;
  requestId: string;
  subjectRef?: string;
}
```

The proxy should return shared envelopes where possible:

```ts
interface AIResultEnvelope {
  resultId: string;
  rows?: unknown[];
  schema?: unknown;
  sql?: string;
  insight?: unknown;
  governance: {
    enforced: boolean;
    authority: "unity-catalog" | "powerbi-semantic-model" | "warehouse" | "mock";
    requestId: string;
    subjectRef?: string;
    sourceRef?: unknown;
  };
  clientCompatibility?: {
    streamingAvailable: boolean;
    xhrSafe: boolean;
    maxPayloadBytes?: number;
  };
}
```

### Runtime Topology

| Environment | Recommended topology | Why |
|---|---|---|
| Local development | One proxy by default; allow alternate port/profile for PulsePlay when both apps need conflicting mocks | Reduces multiplicity without blocking parallel debugging |
| Internal pilot | One shared proxy deployment with client-aware CORS/auth/audit | Best governance and lowest operational waste |
| Regulated production or high-scale split | Same proxy code deployed twice with different config profiles | Keeps the contract unified while isolating blast radius |
| Pulse PBI sandbox-specific issue | Add compatibility route or adapter in proxy, not a second proxy fork | Avoids permanent drift |

### Health and Readiness

A single proxy cannot literally keep both frontends up. It can and should be the shared readiness spine:

- `/health` for proxy dependencies.
- `/assistant/capabilities` for connector/source readiness.
- `/clients/pulse-pbi/compatibility` and `/clients/pulseplay/compatibility` if client-specific capability checks become necessary.
- Audit events tagged by `clientApp`.

Viewer/admin UI should say "Proxy reachable, PulsePlay ready, Pulse PBI compatibility ready" rather than implying the proxy owns frontend uptime.

### Tripwire

If a PR duplicates connector logic in a second Pulse PBI proxy, that is a drift alarm. If a PR removes modern PulsePlay features because Pulse PBI cannot use them, that is also a drift alarm. The intended shape is shared backend truth with client-specific transport capabilities.

## Figma and Canva Handoff

This scan does not create Figma or Canva artifacts yet. The right design handoff is:

- **Figma:** annotated frames for Author Setup Home, BI mode cards, AI configured-current view, Viewer blocked state, Native empty/loading/rendered states, narrow Settings navigation.
- **Figma library:** extract local Settings primitives into component candidates before creating many screens.
- **Canva:** one stakeholder explainer deck after the UI direction is accepted, not before. Canva is useful for narrative alignment, not for specifying component states.

Design review should inspect trust cues, density, focus order, disabled states, and mobile flow. Pretty mockups without state coverage are not enough.

## Recommended Backlog

- [ ] **Add Settings role/scope metadata (UX1, both author/viewer, M).** Make every setting declare who owns it, where truth lives, and whether it is editable, derived, read-only, or blocked.
- [ ] **Make the Save bar truthful (UX1, author, S).** Either implement real draft/apply semantics or rename the affordance so it does not imply unsaved localStorage writes.
- [ ] **Restore narrow Settings navigation (UX1, both, S).** Convert the rail to compact top tabs/select navigation below the breakpoint instead of hiding it.
- [ ] **Add an AuthoringStateSnapshot facade (UX2, author/admin, M).** Use one pure snapshot for Setup Home, setup pill, Settings status, and System truth.
- [ ] **Build Setup Home readiness cards (UX2, author, M).** Show Data/BI, AI connector, Knowledge/source, Governance, and Viewer preview with next actions.
- [ ] **Extract Settings primitives (UX2, both, M).** Create local reusable cards, callouts, badges, read-only values, and probe result components.
- [ ] **Replace BI setup with mode cards (UX3, author, M).** Native, generic iframe, Power BI preview, Power BI governed embed, and future vendor SDK modes should be obvious choices.
- [ ] **Refocus AI settings around current connector first (UX3, author, S).** Show current profile health and grounding before the full catalogue.
- [ ] **Ship viewer-grade empty/loading/error states (UX3, viewer, M).** Root shell and native canvas need states that are clear, calm, and non-technical.
- [ ] **Tighten reset coverage by owned key list (UX3, support, S).** Reset should be generated/tested from declared store ownership, not hand-maintained memory.
- [ ] **Create Figma annotated frames after UX1/UX2 (UX4, design, M).** Mock the accepted flows with state variants, not only happy-path screens.
- [ ] **Create a Canva stakeholder explainer after Figma review (UX4, leadership, S).** Summarize the author/viewer/admin split and why native stays renderer-only.

## Sequencing

### UX1 - Settings Truth Pass

Small and high leverage. Add role/scope metadata, make the Save bar honest, restore mobile navigation, and document which settings are deployment defaults vs viewer preferences.

### UX2 - Author Setup Home

Add `AuthoringStateSnapshot`, shared readiness cards, and the local Settings primitive kit. This is where the product starts feeling intentional instead of assembled.

### UX3 - Trust and Mode Cards

Rework BI/AI pages around current state and mode cards. Add viewer-grade blocked/empty/loading/error states. Tighten reset coverage.

### UX4 - Design Handoff

Create Figma frames and optional Canva narrative once the state model and primitives are agreed. This avoids spending design energy on a structure we may still change.

## Non-Goals

- Do not remove existing routes or settings before discussion.
- Do not rename surface ids. `ai-insights`, `ask-pulse`, and `bi-viz` remain the contract.
- Do not move SQL, governance, or source execution into the native adapter.
- Do not turn native into a dashboard builder.
- Do not create a separate public-OSS hosting/design scope in this pass.

## Validation Performed for This Scan

- Read current Settings groups, stores, setup readiness, surface registry, surface switcher, and relevant App wiring.
- Read current Settings and setup audit docs.
- Ran a headless DOM pass against `http://127.0.0.1:5173` with the proxy down. This confirmed root and Settings routes render, but also showed fail-closed Setup/AI pages still expose downstream configuration controls.
- No browser visual smoke certification was performed.
- No runtime code was changed by this scan.
