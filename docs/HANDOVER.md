# PulsePlay — Handover Log

> **LIFO convention.** Newest entry on top. **Never** reorder existing entries.
> Each entry: a short header (date + headline) and a tight summary of what changed, why, and any tripwires for the next session.

---

## 2026-05-12 — Power BI secure embed quick-preview + developer panel

**Range:** working tree after `c3133b8` — current session, not yet committed.

### What shipped

- **Power BI portal iframe/link is now a first-class embed mode.** [EmbedConfigForm.tsx](../playground/src/components/EmbedConfigForm.tsx) defaults new Power BI authors to "Secure embed link - quick preview" and accepts either the portal URL or the full `<iframe>` snippet from Power BI's "Securely embed this report in a website or portal" dialog.
- **Adapter fallback is explicit and honest.** [bi-adapters/powerbi/index.ts](../bi-adapters/powerbi/index.ts) mounts secure embed configs as a sandboxed iframe, advertises preview-only capabilities after mount, allows refresh/fullscreen, and rejects SDK-only commands (`apply-filter`, `navigate-to-page`, export) with `UNSUPPORTED_COMMAND`. SSO/service-principal/manual token modes still use `powerbi-client`.
- **Power BI Developer Tools panel.** [App.tsx](../playground/src/App.tsx) now shows a collapsible Power BI developer strip above embedded Power BI reports. It can snapshot the live adapter, show capabilities/recent events, refresh, fullscreen/exit, and test apply/clear filter commands.
- **Adapter developer snapshot API.** [bi-adapters/powerbi/index.ts](../bi-adapters/powerbi/index.ts) exposes `getDeveloperSnapshot()` for SDK embeds (`getPages`, `getActivePage`, `getFilters`) and explains secure iframe preview limitations when SDK control is not available.
- **Proxy health storm fixed.** [visual.tsx](../playground/src/pulse/visual.tsx) now keys the proactive `/health` probe on stable mode/base-URL values instead of the whole settings object. [genie.ts](../playground/src/pulse/genie.ts) adds a 15s single-flight cache for `/health`, so repeated renders or multiple clients share one probe.
- **Cheap metadata reads no longer burn AI quota.** [proxy/server.js](../proxy/server.js) exempts `GET /assistant/profiles` and `GET /assistant/capabilities` from the cost-bearing rate-limit bucket; real LLM/Genie/warehouse routes remain limited.
- **Default AI Insights no longer burns four Genie messages.** [visualHelpers.ts](../playground/src/pulse/visualHelpers.ts) adds a fast briefing prompt that emits the universal sections in one response; [visual.tsx](../playground/src/pulse/visual.tsx) uses it for preset/AI-assisted defaults so the side pane behaves closer to Chat latency. The multi-stage runner still exists for future deep/custom modes and per-section retry plumbing.
- **AI Insights output polish pass.** The fast briefing prompt now carries a finished-card polish contract, and [visual.tsx](../playground/src/pulse/visual.tsx) strips status emojis from narrative sections while leaving KPI tables alone. Threshold/rule fragments such as `caution threshold (>3 ▼ -7%)` no longer render as noisy trend chips inside prose.
- **Per-section raw data export to Excel.** [visual.tsx](../playground/src/pulse/visual.tsx) now carries Genie query-result rows/columns into each Insights stage trace, and [insightsExporters.ts](../playground/src/pulse/insightsExporters.ts) can export the raw section data as an `.xlsx` workbook with provenance. One-stage fast briefings reuse the same raw query result across rendered sections.
- **Summary is no longer only bullets.** [visual.tsx](../playground/src/pulse/visual.tsx) now renders HEADLINE as a compact summary card and turns labeled TRENDS/RISKS/ACTIONS-style list items into insight cards. [visualHelpers.ts](../playground/src/pulse/visualHelpers.ts) prompts Genie to emit labeled card-shaped items where useful, while plain prose and normal lists still render normally.
- **Tests cover both paths.** [bi-adapters/powerbi/__tests__/index.test.ts](../bi-adapters/powerbi/__tests__/index.test.ts) now verifies secure iframe mount, URL validation, preview capabilities, refresh, unsupported SDK commands, and cleanup without calling the SDK reset path.

### Tests + build

- Focused Power BI adapter vitest: **40/40 pass**.
- Full playground vitest: **161/161 pass**.
- Full proxy jest: **418/418 pass**.
- Playground `tsc -b && vite build`: green.

### Tripwire

- Secure embed is a great novice on-ramp, but it is not the production AI-control path. AI-applied filters, page navigation, rich report events, and future export-to-file still require AAD SSO or service-principal embed-token mode.
- If `/health` spam reappears, check whether a new effect depends on a mutable settings object or writes to Session Log inside its own dependency loop.
- If authors explicitly need the older "one Genie call per section" accuracy profile, expose it as a named Deep mode instead of making it the default; the default side-pane path must stay fast.

---

## 2026-05-11 — Polish pass + enterprise security + Power BI SSO + Smart Connect

**Range:** `cc46779` → `c3133b8` (head) — about 30 commits across one long session.

### What shipped

**A. UX polish on AI Insights**
- `651c01e` **SVG icon set** ([Icon.tsx](../playground/src/pulse/_adapter/Icon.tsx)) — Lucide-style strokes replace the PBI-heritage emoji (📋/↻/⚙) on the AI Insights toolbar. `stroke="currentColor"` so they inherit button colour. Inline SVG, no new dep. Twelve named icons, drop-in for future surface sweeps.
- `651c01e` **Connection pill "Not connected" lie fixed.** Two root causes — `validateUrl` rejected protocol-less hostnames like `dbc-xxx.cloud.databricks.com` (now auto-prefixes `https://`), and `getConfigIssues` required the workspace `host` field even in proxy mode where the proxy resolves the workspace server-side (now optional in proxy mode).
- `a172a4d` **Genie SQL Trace tab** visible for every Databricks-backed mode (denylist: only OpenAI / Bedrock hidden). The tab was previously gated `proxy || direct` strict equality, which missed the default `auto` mode.
- `6c88a4a` **Richer export menu.** Three buttons next to each other on the toolbar: Copy markdown (existing) · **Copy as rich HTML** (Clipboard API writes both `text/html` and `text/plain` — paste into Outlook/Slack/Notion keeps formatting) · **Print to PDF** (browser-native `window.print()`, zero deps). New helper [exportInsightsAsHtml.ts](../playground/src/pulse/_adapter/exportInsightsAsHtml.ts) — DOM-first with a markdown→HTML fallback.
- `c3133b8` **ColorRulesBanner.** Surfaces when `metricDirectionRules` is empty and a briefing is rendered. Lets the author pick one of the three bundled `METRIC_DIRECTION_PRESETS` (Retail / Ops / Healthcare) and one-click apply via `host.persistProperties`. Closes the "AI output has no 🟢/🟡/🔴 status indicators" UX gap.
- `8b30f0b` **PBI wording sweep round 2** — caught the inline `<FieldRow label="Send Power BI report context to AI">` and `genieFields` hint that the first sweep missed.
- `cc46779` Developer Tools modal now defaults to a large centered popup (88vw × 86vh) instead of the inherited narrow drawer.
- `4aa39f7` Full-width top bar with PulsePlay branding + viewport-pinned pill.
- `b086f33` Compact-mode breakpoint lowered 600 → 380 px (was triggering compact at every split-pane width).
- `14822a0` Connection-pill labels forced visible regardless of compact mode.
- `5d42616` Setup placeholders prefixed with `e.g.` so users stop mistaking them for real values.

**B. Multi-BI & multi-AI surface**
- `e9942f8` **Foundation Model connector** registered (closed audit symmetry gap). New `FoundationModelBackend`, descriptor, ConnectionMode union member; updated `connectionMatrix.ts`, `setupStep5.tsx` no-op list, `setupWizard.tsx` backend cards.
- `159b7c5` **Power BI SSO** ("Embed for your organization" pattern, MSAL.js via [pbiAuth.ts](../playground/src/lib/pbiAuth.ts)). Three modes in `EmbedConfigForm`: AAD SSO (default) / Service Principal / Manual paste. AAD app config persists in localStorage. Token cache: sessionStorage (cleared on tab close).
- `65204bf` **BI tiles toolbar** — 1 / 2 / 4 buttons above the BI canvas; dispatches the same display-change event Pulse's Display tab uses.
- `d01690d` **Smart Connect for Pulse mode.** App.tsx auto-fires `probeConnector()` on Pulse settings change; writes the inferred pack to `pulseplay:pack-selection`; `genie.ts` reads it on each `/assistant/conversations/start` and forwards `pack` + `subVertical` so the proxy's cycle-C pack-context injection fires.
- `d1d316a` **Cycle L — BIAdapter → Pulse context bridge.** `buildCategoricalFromBIEvents` distils filter / page / selection events into a synthetic `dataView.categorical` so Pulse's `contextBuilder.buildContext()` populates `props.context.dimensions / availableFilters / hasSelection`. Makes `sendContextToGenie` actually do work.

**C. Performance**
- `d3b3285` **Bundle code-split** via `manualChunks` — initial paint dropped 916 KB → 280 KB (264 KB gzip → 86 KB gzip). Vendor-react / vendor-powerbi / vendor-msal / xlsx / html2canvas / sql-formatter / pulse all split into separate cacheable chunks.
- `220a3a2` **Pulse lazy-load** via `React.lazy()` + Suspense — Pulse's 642 KB chunk only fetches when `uiMode = pulse` actually renders. Brand strip + top bar + v0 sidebar all paint with just index (48 KB) + vendor-react (229 KB).

**D. Enterprise security pass — 4 of 4 audit gaps closed**

Audit doc: [docs/SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) (added `a3902bc`, updated `de5a18d`).

| # | Severity | Commit | What |
|---|---|---|---|
| 8.1 | **HIGH** | `9c9a160` | **IdP JWT middleware** via `jose@^6`. Validates `Bearer` against `PROXY_IDP_JWKS_URL`; issuer + audience optional but recommended; `req.user` claims flow into the audit log. Fail-open in dev, fail-closed when `PROXY_IDP_REQUIRED=true` in production. Coexists with shared-key as alternative auth. |
| 8.2 | MEDIUM | `f15e16e` | **CORS pin.** `PROXY_CORS_ORIGIN` comma-separated allowlist. Production refuses to start with `*`. Vary:Origin per-origin echo. |
| 8.3 | MEDIUM | `f15e16e` | **CSP** — strict `default-src 'none'` on every proxy response + `index.html` meta CSP with vendor-origin allowlist for PBI / Tableau / Qlik / Looker frames + AAD / Graph / PBI REST `connect-src`. |
| 8.4 | MEDIUM | `f15e16e` | **PII sanitizer** for BI-event context — new [lib/piiRedact.ts](../playground/src/lib/piiRedact.ts) with regex passes for email / US SSN / IBAN / credit-card / phone / API-key. Applied inside `buildCategoricalFromBIEvents` so values flowing through cycle L's bridge are scrubbed before reaching the AI prompt. 14 unit tests. |

Remaining open: 8.5 per-user rate limit (now unblocked since `req.user.sub` is the natural key), 8.6 cache metrics, 8.7/8.8 (low / N/A).

### Tests + build

- Playground vitest: **146/146 pass** (started session at 132; +14 from PII sanitizer + cycle-L bridge tests).
- Proxy jest: **417/417 pass** (test mode bypasses IdP middleware cleanly, as designed).
- tsc strict + vite production build: green.

### Tripwires & open ends

- **Auto mode is the default `connectionMode`.** If anything anywhere assumes a literal `"proxy"` string (the way the old Genie Queries gate did), it will silently skip in auto mode. Audit any new feature gates against this.
- **MSAL `sessionStorage` cache.** Per-tab session lifetime is intentional (XSS-narrowing) but means each new tab requires interactive sign-in. Documented in [SECURITY_ARCHITECTURE.md § 1.1](SECURITY_ARCHITECTURE.md).
- **`runtimeForbiddenColumns` / `runtimeMandatoryRowFilter` are prompt-layer.** They're advisory guardrails — Unity Catalog row/column policy is the load-bearing fence.
- **Foundation Model + Tableau/Qlik/Looker** need backend profile config and SDK wiring respectively to be fully functional. The frontend now selects + routes them correctly.
- **CSP `'unsafe-eval'`** is in the playground's meta CSP for Vite HMR; production builds should drop it via vite config.
- **`PROXY_CORS_ORIGIN`, `PROXY_IDP_*`, `PROXY_INLINE_CREDENTIALS_MODE`** all need setting in production env. The proxy refuses to start with insecure defaults when `NODE_ENV=production`.
- **Genie stage memory** — when a stage reuses a prior stage's SQL via Pulse's memory feature, the section card shows "No SQL was attached". The user finds the SQL via either the originating stage's `</>` button, the **Genie SQL Trace** tab in Developer Tools, or directly in Databricks SQL history.

### Next-session candidates (pick one)

1. **PBI export-to-file** — server-side route + frontend wiring. Adapter currently rejects `export` with `UNSUPPORTED_COMMAND`.
2. **Tableau adapter SDK** — replace the iframe stub with `<tableau-viz>` Embedding API v3. After PBI is complete per user direction.
3. **Per-user rate limit** — unblocked now that IdP middleware lands `req.user.sub`. Replaces / supplements the per-IP 120 req/min limit.
4. **Eval suite** — 30-50 fixed questions, ground-truth answers, nightly run against the Sample Superstore Genie space.
5. **Tooltip + hover polish** on the new icon buttons (small lift).

### Files touched (high-level)

- New: `playground/src/lib/pbiAuth.ts`, `playground/src/lib/piiRedact.ts`, `playground/src/lib/probeClient.ts`, `playground/src/pulse/_adapter/Icon.tsx`, `playground/src/pulse/_adapter/exportInsightsAsHtml.ts`, `playground/src/pulse/backend/FoundationModelBackend.ts`, `playground/src/components/__tests__/PulseShell.test.ts`, `playground/src/lib/__tests__/piiRedact.test.ts`, `docs/SECURITY_ARCHITECTURE.md`.
- Modified (Pulse-port, additive only): `playground/src/pulse/visual.tsx`, `playground/src/pulse/settings.ts`, `playground/src/pulse/setupStep5.tsx`, `playground/src/pulse/setupStep5Guided.tsx`, `playground/src/pulse/setupWizard.tsx`, `playground/src/pulse/genie.ts`, `playground/src/pulse/connectionMatrix.ts`, `playground/src/pulse/insightsPresetLibrary.ts`, `playground/src/pulse/backend/connectorRegistry.ts`, `playground/src/pulse/_adapter/PulseHostStub.ts`.
- Modified (PulsePlay-native): `playground/src/App.tsx`, `playground/src/components/EmbedConfigForm.tsx`, `playground/src/components/PulseShell.tsx`, `playground/vite.config.ts`, `playground/index.html`, `proxy/server.js`, `proxy/package.json`.

---
