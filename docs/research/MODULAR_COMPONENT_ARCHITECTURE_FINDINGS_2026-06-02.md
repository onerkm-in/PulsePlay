# Modular Component Architecture Findings

> Date: 2026-06-02
>
> Scope: PulsePlay frontend modularity research pass. This document records findings only. No code refactor is included in this note.

## Short Answer

PulsePlay should move toward feature-sliced modularity now, before the main shell and assistant surfaces absorb more behavior.

The best near-term answer is not Redux, not runtime plugins, not module federation, and not splitting every small UI element into separate files. The best answer is to separate:

- shell composition
- viewport/pane state
- BI runtime wiring
- assistant runtime wiring
- settings sections
- presentational components
- pure domain helpers

This keeps the current one-app product direction intact while making the codebase easier to debug and grow.

## Brutal-Honest Finding

PulsePlay already has good macro-architecture: BI adapters are behind a contract, AI connectors are profile-driven, and Vite already code-splits important optional surfaces.

The current risk is local component ownership. Several files now own too many reasons to change. If more features keep landing in those files, debugging will become slow and fragile.

## Current Hotspots

Measured from the local repository during the research pass:

| File | Approx. lines | Concern |
|---|---:|---|
| [playground/src/pulse/visual.tsx](../../playground/src/pulse/visual.tsx) | 12,143 | Large legacy Pulse port. Treat as compatibility surface; avoid expanding when possible. |
| [proxy/server.js](../../proxy/server.js) | 8,270 | Backend route monolith. Connector extraction should happen later through the existing registry direction. |
| [playground/src/pulse/setupStep5.tsx](../../playground/src/pulse/setupStep5.tsx) | 4,894 | Large legacy setup surface. Prefer PulsePlay-native settings sections for new work. |
| [playground/src/App.tsx](../../playground/src/App.tsx) | 2,826 | Main urgent frontend hotspot. Owns shell, routing, layout, viewport state, BI runtime, wizard flow, Pulse bridge, and render composition. |
| [playground/src/pulse/visualHelpers.ts](../../playground/src/pulse/visualHelpers.ts) | 2,724 | Dense helper module. Keep additions focused and tested. |
| [playground/src/settings/groups/AiGroup.tsx](../../playground/src/settings/groups/AiGroup.tsx) | 1,465 | AI settings owns too many sections and nested panels. Split by section. |
| [playground/src/components/UnifiedAssistantSurface.tsx](../../playground/src/components/UnifiedAssistantSurface.tsx) | 1,433 | Owns conversation state, polling, SSE, discovery, rendering, result table, and answer cards. |
| [playground/src/components/FirstRunWizard.tsx](../../playground/src/components/FirstRunWizard.tsx) | 1,399 | Large but more contained. Refactor after App/assistant shell. |
| [playground/src/settings/groups/SetupGroup.tsx](../../playground/src/settings/groups/SetupGroup.tsx) | 1,170 | Setup search, preflight, progress, embed state, profile fetch, and handoff logic are mixed. |
| [playground/src/settings/settingsStore.tsx](../../playground/src/settings/settingsStore.tsx) | 1,101 | Central store is expected to be sizable, but should stay pure and tested. |

Hook-density scan also flagged [playground/src/App.tsx](../../playground/src/App.tsx) as the most urgent PulsePlay-native risk: roughly 34 `useState`, 21 `useEffect`, and 25 `useCallback` occurrences. That is a strong signal that multiple state machines are living in one component.

## What Is Already Healthy

PulsePlay should preserve these decisions:

- BI surfaces already load through [playground/src/biPanel/registry.ts](../../playground/src/biPanel/registry.ts), with dynamic imports per vendor.
- Vite manual chunking already separates Pulse, Power BI SDK, MSAL, `xlsx`, `html2canvas`, and React in [playground/vite.config.ts](../../playground/vite.config.ts).
- The project already chose "one integrated app now, slim builds later" in [docs/research/MODULAR_DELIVERY_WAY_FORWARD_2026-05-25.md](MODULAR_DELIVERY_WAY_FORWARD_2026-05-25.md).
- The proxy already has connector manifest scaffolding in [proxy/lib/connectorRegistry.js](../../proxy/lib/connectorRegistry.js), with an explicit future target of `proxy/connectors/<id>.js`.

## Recommended Frontend Shape

Target directory shape:

```text
playground/src/shell/
  PlaygroundShell.tsx
  TopBar.tsx
  DashboardSurfaceContextStrip.tsx
  PaneChrome.tsx
  FloatingPanel.tsx
  MinimizedPaneDock.tsx
  SplitLayout.tsx
  useViewportController.ts
  useSurfaceController.ts

playground/src/runtime/bi/
  useBiRuntime.ts
  biEventBuffer.ts
  biCommandBridge.ts
  powerBiDeveloperPanel.tsx

playground/src/runtime/assistant/
  useAssistantRuntime.ts
  useConnectorPrewarm.ts
  useDiscoveryPrewarm.ts
  usePackSelectionBridge.ts

playground/src/assistant/
  UnifiedAssistantSurface.tsx
  useConversationController.ts
  useDiscoverySnapshot.ts
  AssistantComposer.tsx
  AnswerHistory.tsx
  AnswerEntryView.tsx
  ResultTable.tsx
  assistantTypes.ts

playground/src/settings/groups/ai/
  AiGroup.tsx
  ConnectorSection.tsx
  AssistantSection.tsx
  SharedContextSection.tsx
  ResponseSection.tsx
  SurfaceSpecificSection.tsx

playground/src/settings/groups/setup/
  SetupGroup.tsx
  setupSearchIndex.ts
  SetupProgressHeader.tsx
  BiSetupSection.tsx
  AiSetupSection.tsx
  PackSetupSection.tsx
  GovernanceSection.tsx
  TestAndHandoffSection.tsx
```

The point is not folder neatness. The point is that each module should own one state machine or one visible surface.

## Refactor Order

Recommended order if/when implementation begins:

1. Extract pure presentational pieces from `App.tsx`.
   Start with `DashboardSurfaceContextStrip`, `SetupStatusPill`, `PaneChrome`, `FloatingPanel`, `MinimizedPaneDock`, `SplitLayout`, `BITileGrid`, and `PowerBIDeveloperPanel`.

2. Extract viewport state from `App.tsx`.
   Create `useViewportController` for focus, minimize, pin, float, dock, open-page, URL sync, and viewport events. Add reducer tests before changing behavior.

3. Extract surface selection from `App.tsx`.
   Create `useSurfaceController` for `activeSurface`, `mixSurface`, `requestedPulseTab`, `enabledComponents`, and `resolveSurfaceAvailability`.

4. Extract BI runtime from `App.tsx`.
   Create `useBiRuntime` for active vendor, BI surface mode, embed config wrapper, visible vendors, runtime vendor resolution, BI event buffer, adapter readiness, and Pulse-to-BI command dispatch.

5. Extract assistant runtime from `App.tsx`.
   Create `useAssistantRuntime` for active connector sync, pack selection, probe result, Pulse assistant profile sync, warehouse prewarm, discovery prewarm, and wizard auto-submit bridging.

6. Split `UnifiedAssistantSurface`.
   Move conversation orchestration to `useConversationController`, discovery loading to `useDiscoverySnapshot`, and rendering to composer/history/card/table components.

7. Split settings by progressive sections.
   `AiGroup.tsx` and `SetupGroup.tsx` should become section composers, not giant mixed state/render files.

8. Move backend connectors later.
   Use the existing `connectorRegistry.js` S2 direction: `proxy/connectors/<id>.js` modules that export manifest, match/probe behavior, and route registration through a constrained host API.

## State Ownership Rules

Use these rules during future refactors:

- If two or more state values always change together, group them.
- If a value can be derived from props or existing state, do not store it.
- If a component has multiple unrelated effects, split those effects by purpose or move them into purpose-named hooks.
- If a hook is used to share stateful logic, remember it does not share state by itself. Shared state still needs lifting, context, or a store.
- Use reducers for explicit state machines: viewport, conversation lifecycle, setup preflight, wizard flow.
- Keep server data in React Query hooks where practical. Avoid repeated local `fetch` plus `loading/error/data` triplets for profiles, packs, allowlist, discovery, and capabilities.

## What Not To Do Yet

Do not introduce these as the first fix:

- runtime module federation
- remote plugin marketplace
- per-connector micro-frontends
- user-installed modules
- a new global state library before reducing the current state shape
- build-time slim profiles before conformance tests exist

These may become useful later, but they add operational complexity before solving the current debugging bottleneck.

## Source Notes

Primary external guidance checked:

- React, [Thinking in React](https://react.dev/learn/thinking-in-react): split UI into a component hierarchy and keep state minimal.
- React, [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure): group related state, avoid contradictions, avoid redundant state, avoid duplication.
- React, [Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer): move scattered state updates into reducer actions when component state logic grows.
- React, [Scaling Up with Reducer and Context](https://react.dev/learn/scaling-up-with-reducer-and-context): combine reducers and context for complex screens, while keeping wiring in separate files.
- React, [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks): custom hooks share stateful logic, not state itself.
- React, [lazy](https://react.dev/reference/react/lazy): lazy-loaded components defer code until first render.
- Vite, [Glob Import](https://vite.dev/guide/features.html#glob-import): `import.meta.glob` is lazy by default and produces split chunks during build.

## Bottom Line

PulsePlay does not need a dramatic architecture reset. It needs a disciplined extraction sequence.

Keep the product as one integrated app. Make the technical boundaries modular: shell, viewport, BI runtime, assistant runtime, settings sections, adapter manifests, and proxy connector modules.

The first high-value move is to reduce [playground/src/App.tsx](../../playground/src/App.tsx) from a mixed application brain into a thin composer over tested hooks and extracted slot components.
