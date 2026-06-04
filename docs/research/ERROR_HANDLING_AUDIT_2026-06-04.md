# Error-Handling Audit — 2026-06-04

Full-codebase audit (proxy + playground) of the error-handling system, triggered by the "good error handling system" directive. The contract in [docs/ERROR_HANDLING_STRATEGY.md](../ERROR_HANDLING_STRATEGY.md) is sound; the wiring is partial. Severity: P0 = silently-wrong / app-crash · P1 = actionable cause discarded → generic message · P2 = inconsistency / observability.

## Landed this session ✅

| # | Sev | Fix | Commit |
|---|-----|-----|--------|
| 5 | P0 | **Top-level `AppErrorBoundary`** wraps the whole app — no more whole-app white-screen on a render throw in any surface (BIPanel, v0, Settings, route shells). Surfaces the real message + stack. + global `unhandledrejection`/`error` listeners. | bf89938 |
| 2 | P0 | **v0 `UnifiedAssistantSurface` surfaces the real FAILED cause**, not `[object Object]` — `data.error` is an object at runtime; added `errorFieldToString` at all 4 finalize sites. | 6c17555 |
| 12 | P2 | **Proxy process safety net** — `process.on('unhandledRejection')` (log) + `uncaughtException` (log + clean-exit). | 8d723a6 |
| 4 | P0 | **proxyChatBackend forwards `packed.error`** so a FAILED synchronous OpenAI/Bedrock answer carries its cause. | 8d723a6 |
| (11/13) | P1 | pulse insights surface the real Genie/warehouse error + stable failure terminal state. | 26d2f13 |
| (12) | P1 | Connection test copy "Connector reachable" (metadata-only, honest). | fc7e791 |

## Open backlog (prioritized)

**P0/P1 — wiring the sound contract into the real surfaces:**
- **#1 — `problemDetails.ts` reader is wired into nothing.** `parseProblemResponse`/`problemToUserError` are used only by `artifactValidator.ts`. AISidebar, UnifiedAssistantSurface, BIPanel, TestConnectionPanel, Launchpad all read the legacy `data.error` string and drop the proxy's `detail`/`code`/`category`/`userAction`/`requestId`. → Route the primary fetch surfaces through `parseProblemResponse(res)`.
- **#3 — proxy `normalizeGenieResponse` (`server.js:~3552`) doesn't surface a FAILED message's `error`.** Defense-in-depth source fix (clients now handle it after #2/#11): set a stable redacted string field on FAILED/CANCELLED so every client benefits.
- **#6 — network/TLS/timeout errors collapse to the generic sentinel** in `errorStatusFromDatabricks` (`server.js:~1245`). ECONNREFUSED/ETIMEDOUT/ENOTFOUND/`unable to verify`/TLS-chain don't match `Databricks NNN:` → user gets "share support code" instead of "couldn't reach Databricks / check NODE_EXTRA_CA_CERTS". → add a `network_tls` branch → 502 with the egress/TLS hint.
- **#7 — BIPanel collapses every embed failure** into `Failed to embed {vendor}: {raw}` (`BIPanel.tsx:~212`). No category/likely-cause/next-action. → structured adapter throw `{code, category, likelyCause, resolution}` + ErrorCard (Slice 3).
- **#8 — `TestConnectionPanel` shows soft-green "reachable (no metadata)" even when the metadata probe ERRORED** (`TestConnectionPanel.tsx:~405`); the real reason is in `result.warnings[]` (`connectorProbe.js:183`). → if a warning contains `*failed*`, render "reached the connector but the metadata probe failed: <reason>" (warn, not ok).
- **#9 — auth/allowlist/no-profile rejections bypass the problem envelope.** `sendAuthRejection`/`sendAllowlistRejection`/`sendNoMatchingProfile` emit `{error}` with no `requestId`/`code`/`category` — the highest-traffic 401/403/400 paths have no support code. → route through `sendProblem`/`createProblem` (keep legacy `error` per migration note).

**P1/P2 — consistency / observability:**
- **#10 — Launchpad capability-probe `.catch(() => setCapabilities({}))`** makes a failed `/assistant/capabilities` look like "all features absent" rather than "uncheckable." → set an error flag + "couldn't determine capabilities."
- **#11(stream) — foundation-stream emits `{error: "..."}`** while `/confidence` + sectioned routes emit `{type:'error', problem:{…}}` — standardize on the problem shape.
- **#13 — supervisor `helper.done` error event omits the reason** (`server.js:~7766`); per-helper chip can't show why.
- **#14 — `/confidence` phase-2 drops a clean FAILED poll silently** (best-effort enrichment, low impact).
- **proxyChatBackend catch-branch** still returns COMPLETED-empty for an unparseable `message_id` (legacy shape) — could mask a packed error string. Left as documented legacy; revisit if it bites.

## Not actionable (counted, correct)
- ~45 `catch { /* swallow */ }` around localStorage / dispatchEvent / clipboard / abort best-effort writes — fine.
- ~10 `await res.json().catch(() => ({}))` that immediately read `data.error` off `{}` — degrade to generic, not fully swallowed.
- ~15 proxy defensive swallows (OAuth-cache invalidation, write-to-disconnected-client, tolerant SSE parsing) — correct.
