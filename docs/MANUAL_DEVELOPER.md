# PulsePlay Developer Manual

Everything an engineer needs to run, fix, and extend PulsePlay: the code paths that matter, quoted from the repo, with the tripwires that have already cost real time.

> **Punctuation note.** The prose in this repo's docs is plain ASCII on purpose.
> The code excerpts below are NOT: several of them quote regexes that literally
> match em dashes, en dashes, curly quotes, currency symbols and trend glyphs
> (`TYPO_PROBE_RE`, `MEAS_NUM`, `INLINE_REGEX`). Those characters are the code.
> Do not "clean" them - a copied regex with ASCII substitutes silently stops
> matching what it was written to match.

## Contents

1. [Repo layout](#1-repo-layout)
2. [Running it](#2-running-it)
3. [Architecture](#3-architecture)
4. [The AI Insights pipeline](#4-the-ai-insights-pipeline)
5. [The rendering layer](#5-the-rendering-layer)
6. [The synthetic data generator](#6-the-synthetic-data-generator)
7. [Testing and contract tests](#7-testing-and-contract-tests)
8. [Deployment](#8-deployment)
9. [Gotchas that cost real time](#9-gotchas-that-cost-real-time)
10. [Where the known debt is](#10-where-the-known-debt-is)

---

## 1. Repo layout

| Path | What it is |
|---|---|
| `playground/` | The React + Vite frontend. This is the host app. |
| `bi-adapters/` | Y-axis: one directory per BI vendor, each exporting a class that implements `BIAdapter`. Lives outside `playground/` so a deployer can import adapters a la carte; Vite is configured to read above the project root for this. |
| `proxy/` | X-axis: the Express server (`server.js`, 9312 lines) plus `lib/` (50+ modules) and `connectors/`. Every upstream credential lives here, never in the browser bundle. |
| `scripts/` | Operational scripts: `llm_onboard.py` / `llm_wrapup.py` session ritual, `synthetic_poc/` (the demo-data generator), `decision_assist/` (the detection engine), PBI service-principal helpers, deploy helpers. |
| `enablers/` | Downstream consumers of this repo: `pulse-pbi-gn` (a `.pbiviz` built by copying `playground/src/pulse/**`), `desktop`, `pbi-scm-report`. See section 9. |
| `databricks-agents/` | Mosaic AI Supervisor agent template (LangGraph). Not wired live on the reference workspace. |
| `pulsepacks/` | Vertical pack corpus (`cpg-fmcg`, `retail-digital`, `saas-product`) read by the proxy's `packRegistry` / `packPromptLoader`. |
| `data-contracts/` | The governed contract package (`genie-01f130be/`) the synthetic generator reads. **Currently untracked in git** - present locally only. Without it `contract_loader.load_package` raises `ContractError`. |
| `docs/` | ~76k lines. Start with `CLAUDE.md`, `docs/HANDOVER.md` (LIFO, newest on top), `docs/ARCHITECTURE.md`, `docs/DEBT_REGISTER.md`, `docs/MAINTENANCE_PLAYBOOK.md`. |
| `app.yaml`, `databricks.yml` | Databricks App manifest and bundle definition. |

Inside `playground/src`:

| Path | What it is |
|---|---|
| `App.tsx` (2822 lines) | The shell. Mounts `ActionInsightsPanel` for the Decisions surface, lazy `PulseShell` for AI Insights / Ask Pulse, and a `BIPanel` grid for Dashboard. |
| `surfaceRegistry.ts` | Single source of truth for the four surface ids. |
| `biPanel/` | `BIAdapter.ts` (the contract), `BIPanel.tsx` (the generic host), `registry.ts` (lazy loader + catalogue curation). |
| `pulse/` (**the ported tree**) | The Pulse PBI-visual brain, ported wholesale. `visual.tsx` is ~13,500 lines and contains the AI Insights pipeline and most renderers. Constraints in this tree travel with it (XHR-only HTTP, `gn-*` CSS vocabulary) because the PBI sibling copies it verbatim. |
| `settings/` | The canonical Settings shell, `settingsStore.tsx`, `performanceLevers.ts`. |
| `components/` | Shell-level React components (`PulseShell`, `ActionInsightsPanel`, `BundleSwitcher`, `FirstRunWizard`, ...). |
| `lib/` (43 files) | Shared non-React helpers (auth, formatting, canvas tiles, authoring copilot). |
| `visualization/`, `canvas/`, `cells/`, `multipane/` | Chart stack (ECharts primary), pinned-tile canvas, dashboard auto-seed. |

The four surfaces, from `playground/src/surfaceRegistry.ts:17` and `:114`:

```ts
export type SurfaceId = "action-insights" | "ai-insights" | "ask-pulse" | "bi-viz";
...
export const DEFAULT_LANDING_SURFACE: SurfaceId = "action-insights";
```

Labels differ from ids on purpose: `action-insights` renders as "Decisions", `bi-viz` renders as "Dashboard". Do not rename ids - URL params, telemetry and CSS class names key off them.

---

## 2. Running it

### 2.1 The PORT=7000 tripwire

The proxy's own default port constant is still `8787`:

`proxy/server.js:180`

```js
port: Number(process.env.PORT || process.env.DATABRICKS_APP_PORT || 8787),
```

But the Vite dev server proxies `/api/*` to a hard-coded `127.0.0.1:7000`:

`playground/vite.config.ts:82-98`

```ts
server: {
    port: 7001,
    host: "127.0.0.1",
    proxy: {
        "/api": {
            target: "http://127.0.0.1:7000",
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, ""),
        },
    },
```

So: start the proxy without `PORT=7000` and every `/api/*` call returns HTTP 500 from Vite (nothing is listening on 7000, Vite reports the upstream failure). The symptom looks like a proxy bug and is not. The rewrite also explains why browser code fetches `/api/assistant/conversations/start` while the proxy route is registered as `/assistant/conversations/start`.

The client-side base URL is seeded with the `/api` prefix on purpose:

`playground/src/settings/settingsStore.tsx:981-986`

```ts
writeRawGenieSettingsPatch({
    connectionMode: "proxy",
    apiBaseUrl: typeof window !== "undefined" && window.location?.origin
        ? `${window.location.origin}/api`
        : "http://127.0.0.1:8787",
});
```

`GenieClient.getBaseUrl()` (`playground/src/pulse/genie.ts:709`) appends `/assistant` (or `/supervisor` in supervisor mode) to that.

### 2.2 Commands

```powershell
# terminal 1 - proxy
cd D:\Working_Folder\Projects\PulsePlay\proxy
npm install                    # first time only
$env:PORT=7000; node server.js

# terminal 2 - playground dev server
cd D:\Working_Folder\Projects\PulsePlay\playground
npm install                    # first time only
npm run dev                    # http://127.0.0.1:7001
```

If `npm install` fails on TLS on a corporate-CA box, set `NODE_OPTIONS=--use-system-ca` (proxy runtime equivalent: `NODE_EXTRA_CA_CERTS`).

Config: `proxy/config.json` is **gitignored** (`proxy/.gitignore:2`) and holds real secrets. Read it before overwriting. `proxy/config.example.json` is the committed template. With no `config.json` present, the proxy runs entirely from `PROXY_PROFILE_*` env vars (`cfg()` falls through to `envConfig()`).

### 2.3 The three test suites

```powershell
# 1. proxy - jest, node environment, 83 test suites
cd proxy ; npm test                     # -> npx jest

# 2. playground - typecheck then vitest (jsdom), includes ../bi-adapters/**/__tests__
cd playground ; npm run lint            # -> tsc --noEmit
cd playground ; npm run test            # -> vitest run

# 3. synthetic data generator - pytest, offline (no Databricks needed)
python -m pytest scripts/synthetic_poc/tests -q
```

`playground/vitest.config.ts` mirrors the `vite.config.ts` aliases (`powerbi-client`, and the two `powerbi-visuals-*` stubs under `src/pulse/_adapter/`) and widens `server.fs.allow` to `[".", ".."]` so adapter tests outside `playground/` load.

Verified while writing this manual: `python -m pytest scripts/synthetic_poc/tests -q` -> **28 passed**. Last recorded full-suite counts (from `docs/HANDOVER.md` top entry, 2026-07-28): playground **1894/1894** across 147 files, tsc and `vite build` clean. Proxy count as last recorded in `docs/QUALITY.md`: 1243-1480 depending on the cycle - re-run rather than trusting a number in a doc.

---

## 3. Architecture

### 3.1 The two axes

| Axis | What varies | Where it lives | Reality check |
|---|---|---|---|
| **Y: BI vendor** | What the user is looking at | `bi-adapters/<vendor>/` implementing `BIAdapter` | Only **Power BI** is a real vendor-SDK integration (`powerbi-client`, event + command bridge, `getMetadata()`). `native` is a real ECharts renderer. **Tableau / Qlik / Looker / databricks-genie are iframe stubs** - they render a URL and emit one `loaded` event. `databricks-aibi` attempts an SDK import that is not a declared dependency and falls back to iframe. |
| **X: AI connector** | What the AI brain is | `proxy/` profile `type` field | Ten backend code paths exist. **Three are proven live**: Genie, Foundation Model, Power BI semantic-model (deterministic DAX, `llmCallCount: 0`). Supervisor / supervisor-local are environment-gated (need >= 2 Genie spaces). Azure OpenAI chat and analytics, Bedrock RAG and direct, ResponsesAgent are code-present but unproven live. |

The two axes are independent: any (vendor, connector) pair is valid, and switching one does not touch the other.

### 3.2 The BIAdapter contract

`playground/src/biPanel/BIAdapter.ts:137-181`

```ts
export interface BIAdapter {
    /** Vendor identifier - "native", "powerbi", "tableau", "qlik",
     *  "looker", "generic-iframe". */
    readonly vendor: string;
    readonly displayName: string;
    capabilities(): BICapabilities;
    /** Render the BI view. For SDK adapters the container is required
     *  and the adapter mutates it; for iframe adapters the container
     *  may be null. */
    mount(containerEl: HTMLElement | null, embedConfig: BIEmbedConfig): Promise<void>;
    /** Subscribe to canonical BI events. Returns an unsubscribe function. */
    on(eventType: BIEventType, handler: (event: BIEvent) => void): () => void;
    /** Adapters that don't support the command return a rejected promise
     *  with an `UNSUPPORTED_*` code. */
    send(command: BICommand): Promise<void>;
    /** Idempotent. */
    destroy(): void;
    /** OPTIONAL - live measures/dimensions/filters for the current view.
     *  Adapters that can't introspect MUST omit this or return null;
     *  returning a fake payload would silently corrupt the reachability picker. */
    getMetadata?(): Promise<BIMetadata | null>;
}
```

The canonical vocabularies are small on purpose (`BIAdapter.ts:40-66`): events are `loaded | page-changed | filter-applied | selection-made | data-refreshed | error`; commands are `navigate-to-page | apply-filter | clear-filter | refresh | fullscreen | export`. Adapters translate vendor-native events into these so the assistant never learns a vendor's event names.

Adding a vendor means: implement the interface, add a `case` to `loadAdapter`, and (only when it is real) add its id to the visible catalogue:

`playground/src/biPanel/registry.ts:80-96`

```ts
// Catalogue curation (2026-07-24): only the proven stack is offered in pickers -
// Power BI (real SDK bridge) and the built-in native canvas. The other adapters
// stay in REGISTERED and loadAdapter so nothing breaks at runtime, but they
// aren't advertised until they're real. To restore one, add its id here.
const CATALOG_VISIBLE_VENDORS: ReadonlySet<string> = new Set(["powerbi", "native"]);

export function listVendors(): VendorInfo[] {
    return REGISTERED.filter(v => CATALOG_VISIBLE_VENDORS.has(v.vendor));
}
```

`listRegisteredVendors()` returns the full table for parity tests. Do not "fix" a test that asserts the curated list without re-expanding the lever deliberately.

### 3.3 Proxy configuration and profile resolution

Config resolution is layered: `config.json` (if present) -> merged with `PROXY_PROFILE_*` env vars -> merged with Databricks App resource env vars. If there is no `config.json`, `envConfig()` builds the whole thing from env.

`proxy/server.js:348` (`loadEnvProfiles`) parses `PROXY_PROFILE_<NAME>_<FIELD>=value` into `{ <name>: { <camelCaseField>: value } }` using the `ENV_PROFILE_FIELDS` map at `:253`.

**The hyphen/underscore normalization** exists because app-setting keys do not reliably carry hyphens. It is duplicated in both merge paths (`server.js:157-163` inside `envConfig`, and `server.js:394-400` inside `mergeConfigWithEnvironment`):

`proxy/server.js:389-400`

```js
// Match env-profile names to existing profiles ignoring hyphen vs
// underscore. App Service app-setting keys don't reliably carry hyphens,
// so PROXY_PROFILE_POWERBI_DWD_* (parsed as "powerbi_dwd") must still merge
// into a profile named "powerbi-dwd". Falls back to the literal name when
// there's no normalized match (new env-only profiles).
const normalizeProfileName = s => s.toLowerCase().replace(/[-_]/g, '');
const configByNorm = {};
for (const k of Object.keys(profiles)) configByNorm[normalizeProfileName(k)] = k;
for (const [name, envProfile] of Object.entries(envProfiles)) {
    const target = configByNorm[normalizeProfileName(name)] || name;
    profiles[target] = { ...(profiles[target] || {}), ...envProfile };
}
```

Practical consequence, and a bug this cost us on 2026-07-28. Env-var names cannot carry a hyphen, so `app.yaml`'s `PROXY_PROFILE_POWERBIDWD_*` registers the profile as `powerbidwd`, while the frontend hard-codes the catalogue id `powerbi-dwd` (`playground/src/lib/contextBundles.ts:100`, `:105`). The normalizing merge in `envConfig()` builds its lookup table from profiles that **already exist** (`server.js:396`), which on a Databricks App deploy is only `default` - `config.json` is gitignored and never reaches the deployed git source. So the merge could not bridge the two names, `profileByName` did an exact lookup, and **every Power BI request on the hosted app returned "No matching profile configured"** while working perfectly on a local box whose `config.json` happens to contain a `powerbi-dwd` key.

`profileRegistry.get` now falls back to a separator-insensitive scan when the exact key misses, so the two names resolve to one profile as `app.yaml` always claimed. Pinned in `proxy/tests/profileNameNormalization.test.js` against a hosted-shaped env with no `config.json`.

The general lesson is worth more than the fix: **a config-driven behaviour that only works because your dev box has a file the deployed host does not is invisible until production.** When you touch profile resolution, test it with env vars only.

`cfg()` re-reads config on every call with a 30s in-memory TTL - **except under test**:

`proxy/server.js:454-469`

```js
    if (process.env.NODE_ENV !== 'test') {
        const now = Date.now();
        if (_cfgCache && (now - _cfgCacheAt) < CONFIG_CACHE_TTL_MS) {
            return _cfgCache;
        }
        const fresh = readAndMerge();
        if (fresh.configSource === 'config.json') {
            _cfgCache = fresh;
            _cfgCacheAt = now;
        }
        return fresh;
    }
    return readAndMerge();
```

Parse failures fall back to the last-good cache, then to env - a half-saved `config.json` must never take the proxy down.

All lookups funnel through one registry so there is a single hook point for future sources:

`proxy/server.js:544-556`

```js
const profileRegistry = {
    /** Resolve a single profile by its key. Returns null if missing. */
    get(name) {
        if (!name) return null;
        if (String(name).startsWith('_')) return null;
        const c = cfg();
        return c.profiles?.[name] ?? null;
    },
    /** All real profile entries (excludes _doc_* doc keys). */
    entries() {
        const c = cfg();
        return Object.entries(c.profiles ?? {}).filter(([k]) => !k.startsWith('_'));
    },
```

Keys beginning with `_` are documentation entries in `config.json` and are never returned.

Per-request resolution adds allowlist enforcement and inline-credential modes:

`proxy/server.js:842-866`

```js
function resolveProfile(body, query, headers, req) {
    const mode = resolveInlineCredentialsMode();
    const inlineFull = extractInlineCredentials(headers);

    let base = null;
    const explicitName = body?.assistantProfile || query?.assistantProfile;
    if (explicitName) {
        base = profileByName(explicitName, req);
        if (!base && !(mode === 'override' && inlineFull)) {
            return null;
        }
    } else {
        const targetHost = headers?.['x-pulseplay-target-host'] || headers?.['x-genie-target-host'];
        const byHost = profileByHost(targetHost, req);
        base = byHost || profileByName('default', req);
    }

    const result = applyInlineMode(base, inlineFull, mode, headers || {});
```

### 3.4 Request path: click in the browser to a Genie answer

1. **User action.** A surface calls into the Pulse `GenieClient` (`playground/src/pulse/genie.ts`). The transport is `XMLHttpRequest`, not `fetch` - a Pulse-PBI inheritance, documented at `genie.ts:4`. New PulsePlay-native code is not bound by that.
2. **URL.** `getBaseUrl()` returns `<apiBaseUrl>/assistant`, i.e. `http://127.0.0.1:7001/api/assistant` in dev. The client POSTs `/conversations/start` (`genie.ts:1452`).
3. **Vite.** Dev server strips `/api` and forwards to `127.0.0.1:7000`. In a combined deploy there is no Vite, so the proxy strips it itself (`server.js:1679`, see section 8).
4. **Profile resolution.** `resolveProfile(req.body, {}, req.headers, req)`.
5. **Connector-aware routing** happens before any Genie work:

`proxy/server.js:3483-3501`

```js
    if (resolved.profile?.type === 'powerbi-semantic-model') {
        return startPowerBiConversation(req, res);
    }
    ...
    if (isFoundationModelProfile(resolved.profile)) {
        return startFoundationConversation(req, res);
    }

    // Supervisor-local arriving on the assistant route (client didn't switch to
    // /supervisor/*) - bridge it instead of falling through to Genie.
    if (resolved.profile.type === 'supervisor-local') {
        return startSupervisorConversation(req, res);
    }
```

6. **Server-owned governance floor** (`server.js:3510-3517`) prepends the runtime scope prefix if the profile declares governance fields and the caller did not already apply it. This is what makes curl / the PBI sibling / an agent get the same column, table and row governance the browser applies.
7. **Context composition.** Discovery context, then pack context, then the user question (`server.js:3606-3612`), because Genie has no system-prompt API.
8. **The upstream call.**

`proxy/server.js:3644-3652`

```js
        await ensureWarehouseRunning(resolved.profile);
        const data = await databricksRequest(
            resolved.profile, 'POST',
            `/api/2.0/genie/spaces/${targetSpaceId}/start-conversation`,
            { content: fullContent },
            req.requestId  // Wave 30 cycle 5 - propagate correlation id downstream
        );
        const convId = data.conversation_id ?? data.conversation?.id;
        storeConversation(convId, targetSpaceId, resolved.name);
```

9. **Poll.** The client polls `GET /assistant/conversations/:conversationId/messages/:messageId` (`server.js:3980`), which fetches the Genie message and, when it carries a SQL attachment, the `/query-result` sub-resource (`server.js:3753`). `POLL_INTERVAL_MS = 2000` (`server.js:3924`).
10. **Response shape.** `withGovernance(...)` wraps the payload with an attestation. The wire contract is Genie-shaped everywhere - `conversation_id`, `message_id`, `status`, `content`, `sqlQuery`, `queryResult` - even for non-Genie backends, so the renderers stay backend-agnostic.

`conversationMap` (`server.js:505`) keeps `conversationId -> { spaceId, profileName }` for 24h so polling GETs resolve the right space without a body.

---

## 4. The AI Insights pipeline

This is the most intricate part of the codebase and where the bugs live. It lives in the ported Pulse tree: prompt construction in `playground/src/pulse/visualHelpers.ts`, orchestration in `playground/src/pulse/visual.tsx` (inside `runInsights`, `visual.tsx:3863`).

### 4.1 One preset controls batching

`playground/src/settings/performanceLevers.ts:54-65`

```ts
export function getBackendStagingFromCadence(cadence: RevealCadence): BackendStagingConfig {
    switch (cadence) {
        case "instant":
            return { useSinglePlanner: true, batchSize: 2, interBatchDelayMs: 0 };
        case "fast":
            return { useSinglePlanner: false, batchSize: 3, interBatchDelayMs: 3_000 };
        case "balanced":
            return { useSinglePlanner: false, batchSize: 2, interBatchDelayMs: 6_000 };
        case "full":
            return { useSinglePlanner: false, batchSize: 1, interBatchDelayMs: 8_000 };
    }
}
```

`balanced` is the shipped default. `useSinglePlanner` picks `buildFastHybridInsightsStagePrompts` (everything in one Genie message) instead of the staged planner:

`playground/src/pulse/visual.tsx:4035-4061`

```ts
            const stagingFromCadence = props.settings.connectionMode === "supervisor"
                ? getBackendStagingFromCadence("instant")
                : getBackendStagingFromCadence(perfLevers.revealCadence);
            ...
            const hybrid = stagingFromCadence.useSinglePlanner
                ? buildFastHybridInsightsStagePrompts(...)
                : buildStagedHybridInsightsPlan(
                    props.context, settingsDomain, customSections, roleMode, kbFlags,
                    props.settings.metricDirectionRules, effectiveAuthorGuidance,
                    universalShow, universalOverrides,
                    { batchSize: stagingFromCadence.batchSize }
                );
```

Supervisor mode is forced to single-shot regardless of the preset: every staged batch would be a full helper fan-out.

### 4.2 The staged planner

`playground/src/pulse/visualHelpers.ts:1034-1045`

```ts
export function buildStagedHybridInsightsPlan(
    context: ContextSummary,
    domain: string,
    customSections: HybridCustomSection[],
    _roleMode: UserMode,
    kbFlags?: { enabled: boolean; charts: boolean; stats: boolean; reporting: boolean },
    metricRules?: string,
    authorGuidance?: string,
    universalStages?: { headline?: boolean; trends?: boolean; risks?: boolean; actions?: boolean },
    universalOverrides?: { headline?: string; trends?: string; risks?: string; actions?: string },
    opts?: { batchSize?: 1 | 2 | 3 }
): InsightsStagePrompts
```

It builds one `## SECTION` block per requested section (HEADLINE, KPI SNAPSHOT, TRENDS, author custom sections, RISKS, RECOMMENDED ACTIONS), then batches them:

`playground/src/pulse/visualHelpers.ts:1124-1142`

```ts
    // If 0 or 1 blocks, fall back to single-shot behavior - no batching
    // value when there's nothing to split.
    if (sectionBlocks.length <= 1) {
        return buildFastHybridInsightsStagePrompts(...);
    }

    // Split into batches: lead = block[0] alone; rest in groups of batchSize.
    const batchSize = Math.max(1, Math.min(3, opts?.batchSize ?? 2));
    const batches: string[][] = [[sectionBlocks[0]]];
    for (let i = 1; i < sectionBlocks.length; i += batchSize) {
        batches.push(sectionBlocks.slice(i, i + batchSize));
    }

    const titleFor = (blocks: string[]): string => blocks
        .map(b => (b.match(/^## (.+)$/m)?.[1] || "").trim())
        .filter(Boolean)
        .join(" + ") || FAST_INSIGHTS_STAGE_TITLE;
```

**HEADLINE alone is the lead batch.** It used to be bundled with KPI SNAPSHOT; splitting was a deliberate perceived-latency win (one declarative sentence paints in roughly 5-15s on a warm proxy). Batch titles are joined with `" + "` - that string is load-bearing downstream (section 4.5).

Every batch shares one contract block, and that block is where the metric-frame seam sits:

`playground/src/pulse/visualHelpers.ts:1153-1163`

```ts
    const sharedContract = [
        "Do not ask clarifying questions. Do not include preamble, alternatives, or a closing summary.",
        "Use the same current/prior period basis across every section; prefer year-over-year when the data spans multiple years.",
        "Use exact field/category names from the data. Bold numeric values, not category labels.",
        "Keep the answer compact enough to render inside a BI side pane.",
        "POLISH CONTRACT: write like a finished executive card. ...",
        ...
        FORMAT_MASK_GUARD,
        METRIC_FRAME_ANCHOR,
    ].join("\n");
```

`FORMAT_MASK_GUARD` (`visualHelpers.ts:785`) exists because a live bug had the model printing a formatting mask (`### ### ###.##`) as if it were a value.

### 4.3 The concurrency-2 runner

`playground/src/pulse/visual.tsx:4807-4850`

```ts
                    const CONCURRENCY = 2;
                    const FIRST_LOAD_STAGE_1_DELAY_MS = getBackendStagingFromCadence(perfLevers.revealCadence).interBatchDelayMs;
                    const queue = Array.from({ length: prompts.length }, (_, i) => i);
                    const drainWorker = async (workerIndex: number) => {
                        let isFirstPick = true;
                        while (true) {
                            const idx = queue.shift();
                            if (idx === undefined) return;
                            // Second worker waits before its FIRST pick so
                            // stage 0 (claimed by worker 0) has time to win
                            // the obtainMessage race + return the
                            // conversation_id before stage 1 issues its
                            // sendMessage on the same conversation.
                            if (isFirstPick && workerIndex > 0) {
                                await new Promise(r => setTimeout(r, FIRST_LOAD_STAGE_1_DELAY_MS));
                                if (insightsStopRef.current[spaceKey]) {
                                    const stopErr: any = new Error("__STOP_REQUESTED__");
                                    stopErr.isStopRequest = true;
                                    throw stopErr;
                                }
                            }
                            isFirstPick = false;
                            await runStage(idx);
                        }
                    };
                    const workers: Promise<void>[] = [];
                    for (let w = 0; w < Math.min(CONCURRENCY, prompts.length); w++) {
                        workers.push(drainWorker(w));
                    }
                    await Promise.all(workers);
```

Concurrency is fixed at 2 (gentler on Genie's throttle); only the head-start delay is preset-driven. Stop is checked at the top of `runStage` and again after the worker delay, so a stopped run never issues a new upstream call.

All batches must land on **one** conversation, because Genie messages are immutable and one POST creates one new `message_id`. The single-flight opener does that with a synchronous race claim:

`playground/src/pulse/visual.tsx:4272-4299`

```ts
            // Synchronous race-claim: the first worker to see the null promise
            // sets it and becomes the opener. JS single-threadedness guarantees
            // exactly one winner because there is no `await` between the
            // null-check and the assignment.
            let amOpener = false;
            if (!openConversationPromise) {
                amOpener = true;
                openConversationPromise = (async () => {
                    const s = await withProxyOfflineRetry(
                        () => client.startConversation(req, {...}), stageIndex);
                    openerStartResponse = { conversationId: s.conversationId, messageId: s.messageId };
                    return s.conversationId;
                })();
            }
            const convId = await openConversationPromise;
            if (amOpener && openerStartResponse) {
                return openerStartResponse;
            }
            // Joiner: post our prompt as a follow-up on the shared conversation.
            const sent = await withProxyOfflineRetry(
                () => client.sendMessage(convId, req, {...}), stageIndex);
            return { conversationId: convId, messageId: sent.messageId };
```

The UI groups the batches under PulsePlay's own `renderId`, never under a Genie `message_id`.

### 4.4 The deterministic metric frame

The problem it solves, quoted from the module header (`playground/src/pulse/metricFrame.ts:7-14`): HEADLINE and KPI SNAPSHOT are two separate Genie messages with two separate SQL executions, and each was doing its own arithmetic in prose. On a live run they disagreed - "4.3%" vs "+4.29 %" against a true `+4.2524%`, and "0.46" was the artifact of subtracting two already-rounded displays.

The fix does not merge the calls (that would cost first paint). It computes once, from the lead stage's rows:

`playground/src/pulse/metricFrame.ts:96-119` (shape detection)

```ts
export function buildMetricFrame(qr: QueryResultLike | null | undefined): MetricFrameRow[] {
    const columns = qr?.columns;
    const rows = qr?.rows;
    if (!Array.isArray(columns) || !Array.isArray(rows) || rows.length < 2) return [];

    let metricIdx = columns.findIndex(c => METRIC_HEADER_RE.test(String(c ?? "").trim()));
    let periodIdx = columns.findIndex(c => PERIOD_HEADER_RE.test(String(c ?? "").trim()));
    let valueIdx = columns.findIndex(c => VALUE_HEADER_RE.test(String(c ?? "").trim()));

    if (valueIdx < 0) {
        valueIdx = columns.findIndex((_c, i) => rows.every(r => !Number.isNaN(toNumber(r?.[i]))));
    }
    ...
    if (metricIdx < 0 || periodIdx < 0 || valueIdx < 0) return [];
```

Only the **tall** shape is parsed - `["Metric","Period","Value"]` with values as scientific-notation strings, which is what a live probe observed. The wide shape (paired current_/prior_ columns) is deliberately not implemented; inventing a parser for an unobserved shape is how a function silently returns nothing in production. Anything unreadable yields an empty frame, which degrades to exactly the previous behaviour.

Formatting happens once, to the documented project convention:

`playground/src/pulse/metricFrame.ts:162-171`

```ts
export function formatMagnitude(value: number, currency: boolean): string {
    if (!Number.isFinite(value)) return "n/a";
    const sign = value < 0 ? "-" : "";
    const v = Math.abs(value);
    const sym = currency ? "$" : "";
    if (v >= 1e9) return `${sign}${sym}${(v / 1e9).toFixed(2)} B`;
    if (v >= 1e6) return `${sign}${sym}${(v / 1e6).toFixed(2)} MN`;
    if (v >= 1e3) return `${sign}${sym}${(v / 1e3).toFixed(2)} M`;
    return `${sign}${sym}${v.toFixed(2)}`;
}
```

Note the Roman scale: `M` = thousand, `MN` = million, `B` = billion. Three other formatters in the codebase disagree with this - see D8 in the debt register.

The rendered block is authoritative text:

`playground/src/pulse/metricFrame.ts:207-223`

```ts
export function renderMetricFrameBlock(rows: MetricFrameRow[]): string {
    if (!rows.length) return "";
    const text = formatMetricFrame(rows);
    const lines = [
        "PRE-COMPUTED METRIC FRAME (authoritative). Every value below was computed in code from the executed query rows.",
        "Narrate these EXACT strings. Do NOT recompute, do NOT re-round, and NEVER derive a change by subtracting two displayed values.",
        "",
        "| Metric | Current | Prior | Change |",
        "| --- | --- | --- | --- |",
    ];
```

### 4.5 The substitution seam

The anchor is a literal token placed in the shared contract, substituted at the send seam - not at plan-build time:

`playground/src/pulse/visualHelpers.ts:769-783`

```ts
export const METRIC_FRAME_ANCHOR = "<<PULSEPLAY_METRIC_FRAME>>";

/** Substitute the metric frame into a stage prompt. An empty block strips the
 *  anchor rather than promising the model authoritative numbers and giving it
 *  none. Also applied to retry prompts, which wrap the original text. */
export function applyMetricFrame(prompt: string, block: string): string {
    if (!prompt.includes(METRIC_FRAME_ANCHOR)) return prompt;
    if (!block) {
        return prompt
            .split("\n")
            .filter(line => line.trim() !== METRIC_FRAME_ANCHOR)
            .join("\n");
    }
    return prompt.split(METRIC_FRAME_ANCHOR).join(block);
}
```

Why the send seam and not the planner: retry paths re-wrap `prompts[index]` in a new prompt, so substituting later means retries inherit the frame for free. `playground/src/pulse/__tests__/metricFrameWiring.test.ts:51-59` pins that case explicitly, because silent loss would be invisible.

Gating: later stages wait for the lead's frame, with a cap.

`playground/src/pulse/visual.tsx:4344-4351`

```ts
            if (index > 0 && !frameSettled) {
                await Promise.race([
                    frameReady,
                    new Promise<void>(resolve => setTimeout(resolve, FRAME_WAIT_CAP_MS)),
                ]);
            }
            const req = buildGenieRequest(
                applyMetricFrame(promptOverride ?? prompts[index], metricFrameBlock),
```

`FRAME_WAIT_CAP_MS = 45_000` (`visual.tsx:4199`). The lead never waits, so first paint is unaffected. The frame is settled exactly once, and settled empty if the lead produced no usable table so followers are released immediately:

`playground/src/pulse/visual.tsx:4629` and `:4639`

```ts
                if (index === 0) settleFrame(renderMetricFrameBlock(buildMetricFrame(responseQueryResult)));
...
            if (index === 0) settleFrame(metricFrameBlock);
```

### 4.6 Per-stage sanitization order

This block runs on every stage response, and the order is deliberate:

`playground/src/pulse/visual.tsx:4542-4572`

```ts
            {
                // A batch title is "A + B" when the stage asked for several
                // sections; scope to ALL of them, not just the first, or every
                // section after the first is discarded after we paid for it.
                const expectedTitles = titles[index] === FAST_INSIGHTS_STAGE_TITLE
                    ? []
                    : (titles[index] ?? "").split(" + ").map(t => t.trim()).filter(Boolean);
                const expectedTitle = expectedTitles[0] ?? "";
                // Two-step normalization:
                //   1. enforceStageScope: when the agent over-produced
                //      multiple sections in one stage response, keep ONLY
                //      the requested section.
                //   2. normalizeStageHeading: ensure the section starts
                //      with `## TITLE` even if the model dropped the heading.
                const trimmedResponseRaw = normalizeTypography((response.content ?? "").trim());
                const scoped = expectedTitles.length
                    ? enforceStageScope(trimmedResponseRaw, expectedTitles)
                    : trimmedResponseRaw;
                const normalised = expectedTitle
                    ? normalizeStageHeading(scoped, expectedTitle)
                    : scoped;
                const sc = extractAndStripClarifiers(normalised);
                contentParts[index] = stripEmptyEmphasis(sc.cleaned);
```

Order rationale, step by step:

1. `normalizeTypography` first, on the raw text, so every later regex sees ASCII punctuation.
2. `enforceStageScope` before heading normalization, so over-production is dropped while headings are still intact and matchable.
3. `normalizeStageHeading` after scoping - it only ever prepends a heading when none is present, so running it first would defeat the scope match.
4. Clarifier extraction after heading normalization is deliberate: a clarifying-question preamble should not fool the heading-presence check.
5. `stripEmptyEmphasis` last, per stage. `cleanInsightsContent` only runs on the joined copy-to-clipboard path, so without this per-stage call, `**** Sales` would reach the renderer.

**The most expensive bug in this file** was in step 2: the call site used `titles[index].split(" + ")[0]` - the first title only - so on the shipped `balanced` cadence (batchSize 2) the model returned `KPI SNAPSHOT + TRENDS` and TRENDS was deleted **after it was paid for**. The `fast` cadence (batchSize 3) lost two of every three. There is no `quick` cadence: the four are `instant`, `fast`, `balanced`, `full` (`playground/src/settings/performanceLevers.ts:31`). `enforceStageScope` now takes `string | string[]`.

### 4.7 Retries

Two retry paths exist inside `runStage`, both routed through `obtainMessage` so they stay on the shared conversation:

- Universal stages (HEADLINE / TRENDS / RISKS / ACTIONS) get one identical re-send on empty or FAILED (`visual.tsx:4457-4479`).
- Custom author sections get a **simplified** retry prompt that strips the format / time-scope / metric-direction constraints and keeps only the heading requirement (`visual.tsx:4480-4526`), because the full prompt occasionally gets over-engineered into invalid SQL.

Both mark `stageTraces[index].retried = true` for the dev trace pane. Both swallow their own failures so a retry can never crash the pipeline.

---

## 5. The rendering layer

### 5.1 contentSanitizer

`playground/src/pulse/rendering/contentSanitizer.ts` (431 lines) is pure - no JSX, no React, no DOM - so it is unit-testable. All functions are idempotent.

The orchestrator for the joined text:

`playground/src/pulse/rendering/contentSanitizer.ts:353-375`

```ts
export function cleanInsightsContent(content: string): string {
    if (!content) return content;
    // Run section dedup FIRST so per-section cleanup runs on the survivors.
    const deduped = dedupeSections(content);
    const parts = deduped.split(/^(##\s+.+)$/m);
    if (parts.length <= 1) {
        return stripEmptyEmphasis(stripTrailingProseKeywordsOnly(deduped));
    }
    const out: string[] = [];
    if (parts[0]) out.push(stripEmptyEmphasis(stripTrailingProseKeywordsOnly(parts[0])));
    let i = 1;
    while (i < parts.length) {
        const headingLine = parts[i] ?? "";
        const body = parts[i + 1] ?? "";
        const titleMatch = /^##\s+(.+)$/.exec(headingLine.trim());
        const title = titleMatch?.[1]?.trim();
        const cleaned = stripEmptyEmphasis(stripTrailingProse(body, title));
        out.push(headingLine);
        if (cleaned) out.push(cleaned);
        i += 2;
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
```

`stripTrailingProse` is section-aware: for sections in `STRUCTURED_LIST_SECTIONS` (`:27`) it truncates after the last list line; for `STRUCTURED_TABLE_SECTIONS` (`:34`) after the last table line. `dedupeSections` keeps the **last** occurrence of a repeated heading, not the first. `stripTableLeadIn` (`:428`) drops a dangling "the figures are:" clause left behind when a duplicate table is removed.

### 5.2 The trend-pill grammar

Numbers in narrative text are wrapped in coloured trend pills. The grammar is one hoisted 12-group regex (hoisted because `inlineFormat` fires per heading, per paragraph, per bullet, per table cell - hundreds of times per render).

`playground/src/pulse/visual.tsx:11603-11614`

```ts
// Units may be GLUED ("$2.30M") or SPACE-SEPARATED with a multi-letter
// magnitude ("$989.34 MN", "55.60 %"). Both forms are ours: the built-in
// section contract teaches the glued form, while the seeded domain guidance
// mandates the spaced one - and guidance wins by author precedence. This
// grammar only understood glued units, which is what orphaned bold markers:
// on `**+$42.07 MN**` the number stopped at the space, so the leading \*{0,2}
// ate the opening `**` while the trailing one had nothing left to eat, and the
// closer rendered as literal asterisks. It also left " MN" outside the pill.
// The negative lookahead keeps "5 Markets" / "up 5 Tonnes" from reading their
// first letter as a magnitude suffix.
const MEAS_UNIT = "%|pp|MN|MM|BN|K|M|B|T";
const MEAS_NUM = `[+-]?[$€£₹¥]?\\d[\\d,.]*(?:\\s?(?:${MEAS_UNIT})(?![A-Za-z]))?`;
```

`playground/src/pulse/visual.tsx:11633-11649`

```ts
const INLINE_REGEX = new RegExp(
    // G1,G2: [**][arrow]number[**] trend-word
    `(?:[▲▼]\\s*)?\\*{0,2}(?:[▲▼]\\s*)?(${MEAS_NUM})\\*{0,2}\\s+(${TREND})\\b` +
    // G3,G4: trend-word of/by [**][arrow]number[**]
    `|(?:[▲▼]\\s*)?(${TREND})\\s+(?:of|by)\\s+\\*{0,2}(?:[▲▼]\\s*)?(${MEAS_NUM})\\*{0,2}` +
    // G5: [arrow] standalone signed percentage (possibly bold)
    `|\\*{0,2}(?:[▲▼]\\s*)?([+-]\\d[\\d,.]*%)\\*{0,2}` +
    // G6,G7 - natural prose `trend-word [arrow]? number` (no "of/by")
    `|(?:[▲▼]\\s*)?(${TREND})\\s+(?:[▲▼]\\s*)?(${MEAS_NUM})\\b` +
    // G8,G9 - Emoji + number (e.g. "🟢 17.51%" or "🔴 -5.35%")
    `|(🟢|🔴|🟡)\\s*(${MEAS_NUM})` +
    // G10 - flat-glyph + number (e.g. "▪ 0.13", "■ 0pp")
    `|${FLAT_GLYPH}\\s*(${MEAS_NUM})` +
    // G11,G12 - flat-word + number (e.g. "flat 0%", "unchanged 0pp")
    `|(${FLAT_WORD})\\s+(${MEAS_NUM})`,
    "gi"
);
```

**Why it is delicate.** Three coupled reasons:

1. **The optional `\*{0,2}` around the number can cut a bold span in half.** When `MEAS_NUM` stops early (a unit form the grammar does not know), the leading marker is consumed and the trailing one is orphaned - literal asterisks on screen. The producer-side markers are still *balanced*, so a sanitizer fix would be a no-op. The guard is `dropUnpairedEmphasis` (`contentSanitizer.ts:295`), applied at render time inside `parseBold`, deliberately kept out of the sanitizer pipeline.
2. **Group indices are positional.** `inlineFormat` reads the 12 capture groups by number. Inserting an alternative in the middle renumbers everything after it.
3. **Known blind spot, pinned as a test:** G1/G2 require `\b` after the number, and a `%` followed by space or punctuation never crosses a word boundary - so a trailing `%` at end of prose never matches. `playground/src/pulse/__tests__/insightsRendererPolish.test.tsx:433` pins this as known, not fixed.

Sign handling: when a direction pyramid renders alongside, `stripRedundantSignForPill` (`visual.tsx:11630`) removes the leading `+`/`-` so the reader does not see two direction indicators. Colour comes from `pillColorClass` using metric-direction rules (lower-is-better metrics invert tone) while the glyph stays physical.

### 5.3 The typography normalizer

`playground/src/pulse/rendering/contentSanitizer.ts:257-280`

```ts
const TYPO_PROBE_RE = /[—–‘’“”…]/;
const CURLY_SINGLE_RE = /[‘’]/g;
const CURLY_DOUBLE_RE = /[“”]/g;
const ELLIPSIS_RE = /…/g;
const LEADING_DASH_RE = /(^|\n)([ \t]*)[—–][ \t]+/g;
// A tight dash between two digits is a RANGE ("2025–2026"), not a minus, and
// must stay a hyphen. This has to run before the dash-before-number rule, which
// would otherwise turn the range into "2025, 2026". Written with capture groups
// rather than a lookbehind so the Pulse-PBI sibling's older engine is safe.
const NUMERIC_RANGE_RE = /(\d)[—–](\d)/g;
const DASH_BEFORE_NUMBER_RE = /[ \t]*[—–][ \t]*(?=[+-]?[$€£₹¥]?\d)/g;
const REMAINING_DASH_RE = /[—–]/g;

export function normalizeTypography(text: string): string {
    if (!text || !TYPO_PROBE_RE.test(text)) return text;
    return text
        .replace(CURLY_SINGLE_RE, "'")
        .replace(CURLY_DOUBLE_RE, '"')
        .replace(ELLIPSIS_RE, "...")
        .replace(LEADING_DASH_RE, "$1$2- ")
        .replace(NUMERIC_RANGE_RE, "$1-$2")
        .replace(DASH_BEFORE_NUMBER_RE, ", ")
        .replace(REMAINING_DASH_RE, "-");
}
```

The two non-obvious rules:

- **A dash before a number becomes a comma, never a hyphen.** Rewriting "Net Sales - 5.2%" from an em dash to a hyphen would read as NEGATIVE 5.2% - a formatting change silently becoming a wrong number. `DASH_BEFORE_NUMBER_RE` therefore emits `", "`.
- **A tight dash between digits is a range.** "2025-2026" must stay a hyphen. `NUMERIC_RANGE_RE` must run **before** the dash-before-number rule; the first implementation had the order wrong and produced "2025, 2026".

Also note: a line-leading dash is promoted to a real markdown bullet (that is what the model meant by it), and functional glyphs are deliberately untouched - the trend pyramids and the arrows in action labels carry meaning, not typography. The regex is written with capture groups instead of lookbehind so the PBI sibling's older engine is safe.

---

## 6. The synthetic data generator

Demo data is synthetic LATAM CPG/FMCG supply chain, deployed to Databricks as `workspace.databrickspractice.tbl_pp_syn_*`. It is illustrative, not a real company's data.

Entry point: `scripts/synthetic_poc/cpg_reskin.py` (401 lines). It reads the governed contract package under `data-contracts/genie-01f130be/` via `contract_loader.load_package` and invents no structure - schema, types, relationships, cardinality and orphan counts all come from the contract.

### 6.1 The as-of window

`scripts/synthetic_poc/cpg_reskin.py:30-49`

```python
# As-of anchor: data spans the last two COMPLETE calendar years plus the current
# year through the last complete month. As of 30-Jun-2026 that is:
#   2024 Jan-Dec (full) - 2025 Jan-Dec (full) - 2026 Jan-Jun (YTD).
AS_OF_YEAR, AS_OF_MONTH = 2026, 6
COMPLETE_YEARS_BACK = 2

def _periods():
    start_year = AS_OF_YEAR - COMPLETE_YEARS_BACK
    out = []
    for y in range(start_year, AS_OF_YEAR + 1):
        last_m = AS_OF_MONTH if y == AS_OF_YEAR else 12
        out += [(y, m) for m in range(1, last_m + 1)]
    return out

PERIODS = _periods()          # 12 + 12 + 6 = 30 (year, month) pairs
```

Trend shape is deterministic, not random: `_vol_factor` gives roughly 6% YoY growth with a mid-year seasonal bump; GHG trends down 5%/yr; the COGS ratio falls about 1pp/yr so gross margin trends up.

### 6.2 The (country x period) grain grid and the row-budget floor

This is the fix for a bug where per-market YoY was a row-count ratio, not a trend.

`scripts/synthetic_poc/cpg_reskin.py:296-308`

```python
    # Orphan FK keys (the synthetic ZZnn from fk_domain) stay OUT of the grid.
    # Their job is to exist as child keys with no parent so joins and integrity
    # checks have something to catch - not to carry volume.
    # They get one row per year instead: present across the timeline, invisible
    # in any top-N.
    countries = dom_country or country_keys
    valid = [cid for cid in countries if cid in ctable] or countries
    orphans = [cid for cid in countries if cid not in ctable]
    grid = [(y, m, cid) for (y, m) in PERIODS for cid in valid]
    orphan_grid = [(y, m, cid) for cid in orphans
                   for (y, m) in ((yr, 6) for yr in sorted({p[0] for p in PERIODS}))]
    # Floor: never starve the fact below its own grain, however small SCALE is.
    dest_rows = max(dest_rows, len(grid))

    rows = []
    plan = [grid[i % len(grid)] for i in range(dest_rows)] + orphan_grid
```

What went wrong before: periods were allocated proportionally but the country was an unstratified hash. On a 177-row budget over 13 markets x 30 periods most cells were empty and the occupied ones held 1-6 rows at random. El Salvador reported +126.43% YoY against a company total of +4.25% purely because it drew 2 rows in H1-2025 and 4 in H1-2026; Mexico vanished from 2026 entirely. Every per-market trend was noise.

The floor (`dest_rows = max(dest_rows, len(grid))`) is what guarantees at least one row per (country, period) cell no matter how small `SCALE` is (`SCALE = 0.01`, `:28`). Finer-grain columns (plant, channel, week) stay hashed - a full cross product would explode the OFR fact.

### 6.3 MARKET_ECON

`scripts/synthetic_poc/cpg_reskin.py:90-109`

```python
MARKET_ECON = {
    "BR": (2.60, +0.035),   # large, competitive, imports inputs -> thinner margin
    "MX": (2.20, +0.020),
    "CO": (1.20, +0.005),
    "CL": (1.10, -0.030),   # local manufacture -> stronger margin
    "PE": (0.95, +0.010),
    "VE": (0.70, +0.055),   # costliest to serve
    "CR": (0.50, -0.020),
    "PY": (0.45, -0.005),
    "BO": (0.40, +0.030),
    "UY": (0.35, -0.040),   # small but premium mix
    "SV": (0.30, -0.010),
}
# Orphan FK keys (ZZnn) and any unknown market stay small and margin-neutral, so
# an integrity artifact can never lead a ranking.
DEFAULT_ECON = (0.20, 0.0)

def market_econ(country_id):
    return MARKET_ECON.get(str(country_id), DEFAULT_ECON)
```

Each tuple is (volume scale, COGS-ratio bias). Scale roughly tracks real economy size; the bias models duties / local manufacture / channel mix. The bias is **year-independent**, so the existing YoY margin trend survives while the levels differ. Before this, every market sat at roughly $170 MN and 55.8% margin - a 0.90pp spread - so "markets ranked by margin" was ranking noise. After: margin spread 9.49pp, size ratio 8.8x, per the D9 retirement note in `docs/DEBT_REGISTER.md:107`.

### 6.4 Regenerating

```powershell
$env:DATABRICKS_HOST="https://dbc-f88d29ce-4aa2.cloud.databricks.com"
$env:DATABRICKS_TOKEN="<pat>"
$env:DATABRICKS_WAREHOUSE_NAME="<warehouse name>"
python -m scripts.synthetic_poc.cpg_reskin
```

`main()` (`cpg_reskin.py:346`) drops and recreates the three dimension tables and three fact tables, then `rebuild_views` (`:375`) recreates the three enriched join views and calls `supply_chain_measures.build_metric_views`. Object names never change, so the Genie space needs no reconfiguration.

Destinations, from `scripts/synthetic_poc/contract_loader.py:24-38`: `tbl_pp_syn_dm_countries`, `tbl_pp_syn_dm_plants`, `tbl_pp_syn_dm_sales_channel`, `tbl_pp_syn_fct_ofr`, `tbl_pp_syn_fct_operations`, `tbl_pp_syn_fct_performance`, all in `workspace.databrickspractice`. Metric-view measure formulas are redacted in the contract package and are rebuilt from `supply_chain_measures.py`, not copied.

Regeneration changes every demo number. Pair it with a re-verification pass, and note that no app code changes, so no redeploy is needed.

---

## 7. Testing and contract tests

Three suites, section 2.3 for commands. Coverage is **shape**, not answer correctness - there is no eval or hallucination harness (`docs/QUALITY.md`). "All green" does not mean "the answers are right".

The contract tests are the tripwires that let a maintainer change code they have never read. From `docs/MAINTENANCE_PLAYBOOK.md` section 2:

| Contract | Test | What it protects |
|---|---|---|
| Client/server governance parity | `proxy/tests/runtimeScopePrefix.test.js` | Prefix wording must match `genie.ts` byte-for-byte - change both in one commit |
| Client identity contract | `proxy/tests/pulseClientContext.test.js` | The supported-clients list |
| Agent containment | `proxy/tests/agentIdentity.test.js` | AGENT persona stays view-only; self-demotion only |
| HITL authority | `proxy/tests/actionInsightsRoutes.test.js` | Forged personas/approvals can never act |
| Settings search dictionary | `playground/src/settings/__tests__/leafLabels.drift.test.tsx` | Every rendered settings leaf is findable in search |
| Catalog curation | `registry.ts` levers + parity tests | UI advertises only proven connectors |
| DAX matcher behaviour | `proxy/tests/powerbiQuestionMatcher.test.js` | Star-schema correctness (dims over FKs, no numeric group-bys) |
| No-invention rules | `playground/src/lib/__tests__/authoringCopilot.test.ts`, `proxy/tests/decisionPlaybooks.test.js` | Copilot and playbooks never fabricate or exceed bounds |

The parity test states the rule in its own header:

`proxy/tests/runtimeScopePrefix.test.js:1-9`

```js
/**
 * runtimeScopePrefix - the server-owned governance floor for NL->SQL.
 *
 * The property that matters most is PARITY: the server must emit the same text
 * the browser's buildRuntimeScopePrefix (genie.ts, Wave 22) emits for the same
 * config, or governance would differ by which client called. Wording is
 * asserted verbatim here; if it changes, genie.ts must change in the same
 * commit.
 */
```

**The rule: never weaken a contract test to make a change pass.** A red contract test on an *intended* change is the system working - update the pin in the same commit and explain why in the commit message. That is the whole point of the pin: it forces the second half of a two-sided change to be noticed.

The other pinning conventions in this repo:

- Write the failing test before the fix when feasible; it becomes the regression pin.
- Reproduce first (headed via chrome-devtools MCP for UI, curl or jest for the proxy). No fix without a reproduction.
- Run the owning suite, then the full suite.

---

## 8. Deployment

Target: a **Databricks App** running the proxy, which also serves the built React bundle from the same origin.

### 8.1 app.yaml

The whole build-and-run is one bash command in the manifest:

`app.yaml:1-13`

```yaml
command:
  - "bash"
  - "-c"
  - |
    set -e
    echo "[boot] installing playground deps"
    (cd playground && npm ci --no-audit --no-fund)
    echo "[boot] building playground (vite)"
    (cd playground && npm run build)
    echo "[boot] installing proxy deps"
    (cd proxy && npm ci --no-audit --no-fund)
    echo "[boot] starting proxy with STATIC_DIR=playground/dist"
    cd proxy && exec node server.js
```

Env wiring is per-profile via `PROXY_PROFILE_*`, with secrets pulled from the `pulseplay` scope by resource reference:

`app.yaml:18-40` and `:103-115`

```yaml
  - name: PROXY_AUTH_MODE
    value: "none"
  - name: STATIC_DIR
    value: "playground/dist"
  - name: PROXY_PROFILE_DEFAULT_HOST
    value: "https://dbc-f88d29ce-4aa2.cloud.databricks.com"
  - name: PROXY_PROFILE_DEFAULT_TOKEN
    valueFrom: databricks-pat
  - name: PROXY_PROFILE_DEFAULT_SPACE_ID
    value: "01f1871d478a181c83cb0562607c3d8e"
...
resources:
  - name: databricks-pat
    secret:
      scope: pulseplay
      key: databricks_pat
      permission: READ
```

`PROXY_AUTH_MODE=none` is correct **only** because Databricks Apps gates the URL with platform OAuth. On any other host, set `idp`, `shared-key`, or `idp-or-shared-key` - `assertProductionAuthConfig()` runs at startup.

Two same-origin details make the combined deploy work. First, the proxy strips `/api` itself because there is no Vite:

`proxy/server.js:1679-1684`

```js
app.use((req, _res, next) => {
    if (req.url.startsWith('/api/')) {
        req.url = req.url.slice(4) || '/';
    }
    next();
});
```

This middleware must stay **before** route registration.

Second, static serving is registered **after** all API routes, with an explicit API-prefix guard on the SPA fallback:

`proxy/server.js:9103-9126`

```js
const _STATIC_DIR_RAW = process.env.STATIC_DIR;
if (_STATIC_DIR_RAW) {
    const staticDir = path.isAbsolute(_STATIC_DIR_RAW)
        ? _STATIC_DIR_RAW
        : path.resolve(__dirname, '..', _STATIC_DIR_RAW);
    ...
    app.use(express.static(staticDir, { index: 'index.html', maxAge: '1h', fallthrough: true, setHeaders: applyStaticCsp }));
    // SPA fallback: any GET that isn't a known API prefix -> serve index.html.
    // Adding new top-level API routes? Add their first path segment to this list.
    const API_PREFIX_RE = /^\/(api|assistant|foundation|powerbi|health|discovery|capabilities|feedback|debug|metrics|smoke|connectors|decision-assist|decision-canvas|experience|knowledge|policy|profiles|packs|supervisor|insights|sql-preview|test|__diag|\.well-known)(\/|$|\?)/;
```

`STATIC_DIR` is resolved against `__dirname + '..'`, so the value is `playground/dist`, **not** `../playground/dist`.

The static route also replaces the global `default-src 'none'` API CSP with a web CSP - otherwise the browser refuses to execute the bundle.

### 8.2 Pinning the commit

Promoted deploys pin a commit SHA:

```bash
databricks apps deploy pulseplay-dev --profile <profile> \
  --json '{"git_source":{"commit":"<short-or-full-sha>"}}'
```

If the CLI strips fields or returns "Git source reference is required", POST directly to `/api/2.0/apps/pulseplay-dev/deployments` with the same body (`docs/DEPLOY_DATABRICKS_APP.md:211-224`).

Healthy state after deploy (`docs/DEPLOY_DATABRICKS_APP.md:232-238`): `active_deployment.status.state == SUCCEEDED`, `app_status.state == RUNNING`, `resources` not null, and `active_deployment.resolved_commit` matching the intended SHA. Rollback is redeploying the previous SHA.

### 8.3 Known pitfalls

All from `docs/DEPLOY_DATABRICKS_APP.md`:

| Symptom | Cause and fix |
|---|---|
| `/` returns a JSON proxy error | `STATIC_DIR` set to `../playground/dist`. Use `playground/dist`. |
| Blank page, assets present | CSP. The static middleware must override the API CSP. |
| Blank page, API calls 404 | The `/api` strip middleware is missing or registered after routes. |
| Container starts then crashes | `NODE_ENV=production` with no explicit `PROXY_AUTH_MODE`. Set it explicitly. |
| Env key exists but secret is empty | Secret ACL granted to the wrong principal. Use the app service principal **client ID GUID**, not the numeric workspace id. |
| App update API rejects a partial body | Sending only `{"resources":[...]}` failed because `git_repository` was missing. Send the full body. |
| `databricks apps logs` complains about token type | Needs OAuth U2M (`databricks auth login`), not a PAT. |
| curl against the app URL returns sign-in HTML | The hosted URL is behind browser OAuth. Test the management API with the CLI, the app URL in a logged-in browser. |
| Certificate errors | `NODE_OPTIONS=--use-system-ca` locally, or `NODE_EXTRA_CA_CERTS` in the image. |

Live secrets to rotate: the Power BI service-principal secret in `app.yaml` expires 2027-01-27 (`app.yaml:111`).

---

## 9. Gotchas that cost real time

**1. CSS specificity ties are decided by bundle order, and bundle order differs between dev and prod.**

Evidence, in a comment written after the bug shipped:

`playground/src/canvas/saveChannel.css:14-22`

```css
/* Menu rows are deliberately NOT `.btn`. The design-system button rules centre
   their label, apply the heading font, and paint ghost buttons accent-blue -
   all wrong for a menu. They also load AFTER this file in the production
   bundle, so the old `.sc-item` (same specificity as `.btn`) lost the cascade
   in prod while winning in dev: menus rendered left-aligned locally and
   centred once deployed. Own class + descendant selector keeps this
   order-proof, whatever the bundler emits. */
.sc-menu > .sc-item {
```

The rule: verify component styling against a **served production build**, not the dev server. When two rules tie on specificity, give one an owned class or a structural selector rather than relying on order. Related: `.dpc__actions > .btn` is a direct-child selector on purpose - as a descendant it leaked a 40px min-height floor into popup menus.

**2. Genie messages are immutable; one POST creates one new `message_id`.**

Empirically verified against the live workspace (`docs/findingProbeIssue.md`). There is no `/follow-up`, `/append`, `/continue` or `/sections` sub-resource on `.../messages/{id}`. A multi-section flow must allocate N message ids under one shared `conversation_id` - which is exactly what `obtainMessage` (section 4.3) does. If the UI needs one logical assistant turn, key that envelope on PulsePlay's generated `renderId`, never on Genie's `message_id`.

Related tripwire: Genie Agent Mode (`force_deep_research_planning`) is UI-only. The public REST API silently swallows the flag - verified across 20+ probes. The Foundation Model path (`POST /foundation/section`, `server.js:7127`) is the workaround.

**3. `cfg()` does not cache when `NODE_ENV=test`.**

See the excerpt at `proxy/server.js:454-469`. Consequence for test authors: in-memory mutations to `profileRegistry.get(name)` do not persist, because `entries()` and `get()` re-read config on every call. Configure profiles via `PROXY_PROFILE_*` env vars in tests, or mock `fs.readFileSync`.

**4. The Pulse-PBI sibling copies `playground/src/pulse/**` wholesale.**

`enablers/pulse-pbi-gn/scripts/sync-from-pulseplay.mjs:1-12`

```js
// sync-from-pulseplay.mjs - materialize a .pbiviz-buildable src/ from the LIVE
// PulsePlay pulse brain. No copy lives in git; this regenerates it each build.
//
//   1. clean src/ + style/
//   2. copy playground/src/pulse/** -> src/**  (skip __tests__ only; ...)
//   3. rewrite cross-tree imports  ../{lib,components,visualization,features,
//      multipane,settings,featureFlags}  ->  ./_ext/...
//   4. write sandbox stubs under src/_ext/ for those cross-tree modules
//   5. copy the stylesheet
```

So an edit inside `playground/src/pulse/` ships into the `.pbiviz` on the sibling's next build. Practical consequences:

- Keep the XHR-only HTTP layer in `pulse/backend/*` and `pulse/genie.ts`. Do not "modernise" it to `fetch`.
- Keep the `gn-*` CSS vocabulary in `pulse/style/visual.less`.
- Avoid regex features an older engine may not support (this is why `NUMERIC_RANGE_RE` uses capture groups instead of a lookbehind).
- Cross-tree imports get rewritten to `_ext/` stubs. Adding an import from `../settings` inside the pulse tree means the sibling gets a **stub**, not the real module.
- `pulse/setupWizard.tsx` cannot simply be deleted: it is the PBI sibling's only authoring surface (D3 in the debt register).

These constraints apply **only** inside `playground/src/pulse/`. PulsePlay-native code runs at top-level origin in a real modern browser with the full web platform available. Full categorisation in `docs/PULSE_PORT_DETANGLING.md`.

**5. Other paid-for lessons.**

- `seedPulsePlayDefaults` only writes **absent** keys. Existing sessions keep their stored `domainGuidance` and will not pick up new default clauses; they must be edited in Settings.
- `powerbi-client` must be aliased in three places or it resolves differently in dev, build and test: `vite.config.ts:69-80`, `vitest.config.ts` resolve.alias, and `tsconfig.json` paths.
- The supervisor fan-out stagger is **2000 ms** (`proxy/server.js:8164`), tuned up from 350 -> 800 -> 1500 -> 2000 to stay under Genie's 5 req/min/workspace limit. `CLAUDE.md` cites this at `server.js:6385`, which no longer matches; the constant is at 8164. If you re-tune, add a row to `docs/adr/0003-supervisor-stagger.md` rather than silently changing the number.
- Proxy problem envelopes still carry a legacy `error: <string>` field alongside RFC7807 fields (`proxy/lib/problemDetails.js:105`). It is kept indefinitely for Pulse sibling compatibility - do not remove it.
- First reload after an HMR edit to `visual.tsx` can throw `reading 'state'`. A second clean reload clears it; it is a dev-mode artifact, not a product bug.
- Before accepting a diff produced by another LLM, run `git diff HEAD` and read it. Working code has been rewritten as "cleanup" with subtle regressions.

---

## 10. Where the known debt is

Do not rediscover it. `docs/DEBT_REGISTER.md` carries every known duplication, dead-code seam and structural debt with evidence, risk, target state, and an OWNER flag where a human product decision is required. As of 2026-07-28 it tracks D1 through D9, including the three parallel pack corpora, the two canvas stores, the dormant Prompt IR (marked KEEP - wire it, do not delete it), the `visual.tsx` split plan (measured ~13,500 lines at the 2026-07-28 audit, and the problem is one ~6,800-line `App` component), and the four disagreeing number formatters.

The companion process is `docs/MAINTENANCE_PLAYBOOK.md`: the bug/CR loop, the contract-test table reproduced in section 7 above, and the 30-minute onboarding path. Its burn-down rule is the one that keeps the codebase from ossifying: **every substantial session retires one register item or shrinks D5.**

One item in the playbook is still open and blocks the others: the "Architecture owner" line is blank. Until a name is committed there, every OWNER-flagged register item stays frozen.
