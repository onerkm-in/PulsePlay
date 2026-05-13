---
name: PulsePlay current state
description: As of 2026-05-14 - production auth hardening, Power BI embed-token hardening, playground viewport controls, enterprise allowlist runtime, pack registry foundation, and agent sync doc implemented
type: project
originSessionId: current
---

**Branch:** `main` at `8fde791` at the start of the 2026-05-13 knowledge-base architecture session.

**Current session work:**

- **Agent coordination scratchpad.** Added [docs/AGENT_SYNC.md](../AGENT_SYNC.md) as a repo-tracked communication file for Codex and other agents to align on operating instructions, claims, blockers, handoffs, review risks, missing gaps, copy-paste prompts, and open questions. It is intentionally non-canonical; durable decisions still move into HANDOVER, AGENDA, ADRs, or focused feature docs.
- **Phase 1 (allowlist runtime).** Added `proxy/lib/allowlist.js`, production startup validation, filtered `/assistant/allowlist` + `/assistant/profiles`, route guards, rejection audit events, Power BI workspace/report/tenant checks, and MVP 0.2 `proxy/config.example.json`.
- **Phase 7 (pack registry, pulled forward).** Added `proxy/lib/packRegistry.js` + `GET /assistant/knowledge/packs`, filtered by `allowlist.packs`.
- **Playground governance wiring.** Vendor/packs are filtered, `EmbedConfigForm` validates embed origins/workspace/report/tenant, and `BIPanel` refuses to mount a non-allowlisted URL.
- **Phase 2 (Settings shell + store) — beast-mode one.** Added [playground/src/settings/](../../playground/src/settings/): path-based router (no new dep), `SettingsProvider` + `useSettings` with allowlist-aware setters + orphan detection on load, `SettingsShell` with header/search/status strip/5-group left rail/content pane, 5 group surfaces (Preferences fully wired live; BI/AI/System/Advanced show structure + read-only current values). App.tsx now routes between playground and settings; `Cmd/Ctrl+,` opens settings; the legacy gear popover gets an "Open full Settings →" footer link.
- **Phase 3 + L7 cleanup — beast-mode two.** L1 cleanup: `pbiAuth.signInAndPrepareEmbed` now refuses non-allowlisted tenants before MSAL init (new `PbiAllowlistError`). L2 cleanup: `allowedOrigins` field on adapter `BIEmbedConfig`; generic-iframe + powerbi secure-embed paths reject unauthorized hostnames inside `mount()`. L3 cleanup: secure-embed URL paste now parses + validates `groupId` AND `reportId` against allowlist. License posture readout in BI › Status + System › Security; Fabric=false yellow banner. **L7 closed** via Vite plugin [playground/vite.cspFromAllowlist.ts](../../playground/vite.cspFromAllowlist.ts) generating strict CSP from `proxy/config.json` allowlist (no wildcards, no `'unsafe-eval'`).
- **Phase 4 + L6/L8 — beast-mode three.** `activeAiProfile` state in settingsStore with allowlist gate + orphan detection. AiGroup fully wired: Provider picker filtered by allowlist with Supervisor badge; `/assistant/profiles` extended with `type`/`spaces`/`agentName`; read-only Supervisor fan-out table with per-space allowlist match; Connection test = single probe for Genie or per-space probe matrix (2 s stagger ADR-0003) for Supervisor; Knowledge pack live picker inline. **L8 closed** — proxy refuses to start in production when `PROXY_INLINE_CREDENTIALS_MODE !== "off"`. **L6 mitigated** — dev-mode `[security]` startup banner makes the unauthenticated embed-token route posture visible.
- **Phase 5 — beast-mode four.** System Proxy status (live 10 s `/api/health` poll + latency badge); System Diagnostics (rolling 20-event buffer + last 20 console errors via new `pulseplay:bi-event` window event + monkey-patched `console.error`); System Export bundle (JSON download with token/secret redaction); Advanced Reset section / Reset all / Danger zone gated by type-to-confirm. Retired floating gear popover (now direct navigation to `/settings`). Repointed Pulse Cycle H Display tab to "Open Settings → Preferences" link — single source of truth for display prefs. New modules: [diagnosticsBuffer.ts](../../playground/src/settings/diagnosticsBuffer.ts), [exportBundle.ts](../../playground/src/settings/exportBundle.ts). **MVP 0.2 functional core complete.**
- **Phase 6 medium cleanup — beast-mode five.** Audit closeout. L15 (pack path-traversal regex) + L17 (config schema validator, new [configValidator.js](../../proxy/lib/configValidator.js)) + L14 (probeClient profile-name regex, new `ProbeInvalidProfileError`) + L18 (admin token-cache stats + purge endpoints, new `_adminAuthOk` helper) + L12 (`safeAuthorPrompt` = `redactAuthorPrompt` + `stripInstructionKeywords` for prompt-injection keyword stripping in [pulse/promptRedaction.ts](../../playground/src/pulse/promptRedaction.ts)). Explicitly **ACCEPTED** L9 (CSP origin granularity), L10 (`apiBaseUrl` env override is build-time), L13 (per-user PBI report ACL = Phase 9) with risk-acceptance log in SETTINGS_SPEC § 15.5. **Audit surface now green for pilot.**
- **Phase 8 KB UI — beast-mode six.** New `/knowledge` page separate from Settings. Path-based router (no new dep). KnowledgeShell with header + left rail (installed packs) + content pane with section tabs (Overview / Glossary / Ontology / References / Sub-verticals / Runtime use / Demos). Sub-verticals tab has inner left rail + per-sub-vertical content. Runtime-use tab honestly describes what pack content the AI injects TODAY vs what's available for human review only. Proxy: `loadPackDetail` + `loadSubVerticalDetail` + `isSafePackSegment` in [packRegistry.js](../../proxy/lib/packRegistry.js); new endpoints `GET /assistant/knowledge/packs/:pack` + `GET /assistant/knowledge/packs/:pack/sub-verticals/:subVertical` with allowlist gating + path-traversal regex. Settings › AI › Browse library ↗ deep-link wired. Lives at [playground/src/knowledge/](../../playground/src/knowledge/).
- **Power BI embed-token hardening (P0).** `POST /assistant/embed-token/powerbi` now rejects browser-supplied RLS/effective-identity payloads, derives optional RLS identities only from server-side config or verified IdP claims, gates `Edit` behind `powerBiAllowEdit=true`, and caches by workspace/report/dataset/access/identity hash. Manual Power BI token paste in `EmbedConfigForm` is hidden unless `VITE_PULSEPLAY_ENABLE_MANUAL_PBI_TOKEN=true` outside production; backend-issued mode requests View only. See [docs/HANDOVER.md](../HANDOVER.md) 2026-05-14 entry.
- **Playground viewport controls.** The outer AI/BI shell now supports per-pane maximize/focus, restore, minimize with restore dock, pin/unpin focused startup pane, and open AI/BI in `?focus=ai|bi` pages. The non-focused pane stays mounted during shell focus when both panes are enabled. Browser smoke caught and Codex fixed a duplicate restore-label bug; mounted tests cover minimize dock, Show both, `window.open`, and popstate sync. See [docs/HANDOVER.md](../HANDOVER.md) 2026-05-14 viewport entry.
- **Production auth hardening (P0).** `proxy/server.js` now has explicit `PROXY_AUTH_MODE` values (`idp`, `shared-key`, `idp-or-shared-key`, `none`), production startup validation for `NODE_ENV=production` / `PROXY_REQUIRE_AUTH=true`, shared-key aliases (`PROXY_SHARED_KEY`, `PROXY_KEY`, `GENIE_PROXY_SHARED_KEY`), IdP/shared-key request enforcement, and audit reasons for rejected auth requests. See [docs/HANDOVER.md](../HANDOVER.md) 2026-05-14 production-auth entry.
- Updated SETTINGS_SPEC § 15 (all HIGH closed; MEDIUM closed/accepted; LOW L17+L18 closed) + § 16 (Phase 6 ticked); updated HANDOVER 2026-05-13 entries (5 separate entries for the five beast-mode cycles); updated AGENDA phase markers; cross-referenced from feature_settings_spec.md.

**Validation:**

- `proxy`: `node --check server.js`, `node --check lib/allowlist.js`, `node --check lib/packRegistry.js`.
- `proxy`: focused `npm test -- allowlist packRegistry server` passed.
- `proxy`: full `npm test` passed, 428/428.
- `playground`: `npm run lint` (tsc --noEmit) passed.
- `playground`: full `npm test` passed after Phase 8 KB UI — **257/257** (+17 new this cycle: 12 knowledgeRoute + 5 KnowledgeShell).
- `playground`: `npm run build` green.
- `proxy`: full `npm test` passed **464/464** (+7 new this cycle: packRegistry.detail).
- `proxy`: after Power BI hardening, full `npm test` passed **630/630**.
- `playground`: after Power BI hardening, `npm run lint` passed, full `npm test` passed **338/338**, and `npm run build` passed.
- `playground`: after viewport controls and warning cleanup, `npm.cmd test -- viewportControls` passed **16/16**, full `npm.cmd test` passed **354/354**, `npm.cmd run lint` passed, and `npm.cmd run build` passed.
- `proxy`: after final cross-validation, full `npm.cmd test` still passed **630/630**.
- `proxy`: after production auth hardening, `node --check proxy/server.js` passed, focused `npm.cmd test -- productionAuth` passed **16/16**, focused `npm.cmd test -- server --runInBand` passed **119/119**, and full `npm.cmd test` passed **646/646**.

**Current limitations / brutal honesty:**

- PulsePlay still does not have a full enterprise knowledge-base runtime. It has pack content, pack discovery, probe/matcher inference, and prompt-context injection.
- Missing runtime pieces: Knowledge Base browser, retrieval provider adapters, ACL-trimmed retrieval, citations, retrieval profiles, `GroundingBundle` in AISidebar, and KB evals.
- **Audit surface green for pilot.** All 8 HIGH closed/mitigated; all 7 MEDIUM closed (L11/L12/L14/L15) or ACCEPTED with explicit re-open trigger (L9/L10/L13); L17 + L18 LOW closed. Remaining open LOWs (L16 + L19) deferred to Phase 9.
- **MVP 0.2 functional + security core is complete after Phase 6.** All 5 Settings groups wired live; legacy gear popover + Pulse Cycle H Display tab retired in favor of `/settings` as the canonical surface; System health + diagnostics + export bundle functional; Advanced reset actions gated by type-to-confirm; security gates landed at every defense-in-depth layer.
- **Phase 8 KB UI shipped** as a separate `/knowledge` page (read-only browser for installed pack content). Settings deep-links here via AI › Browse library ↗.
- **Power BI embed-token P0 is closed in code and tests**, but a live credentialed smoke is still needed against an org Power BI report to verify the chosen `powerBiRlsUsernameClaim` aligns with that report's dataset RLS model.
- **Playground viewport controls are closed in code and tests.** Remaining UX polish is field feedback only; no known code/test gap remains for maximize/minimize/restore/pin/open-page.
- **Production auth P0 is closed in code and tests.** Deploy `PROXY_AUTH_MODE=idp` if every browser request must carry verified end-user identity; `idp-or-shared-key` intentionally permits controlled service-to-service shared-key fallback. Live enterprise JWKS verification still needs environment smoke.
- **Phase 9 framing tightened (do not collapse again):** what was previously listed as "Phase 9 Vendor expansion" is actually two unrelated things:
  - **Phase 9a — Configuration expansion** (✅ AVAILABLE TODAY, pure config in `proxy/config.json`, no code). Adding more Genie spaces / Supervisor fan-outs / Azure OpenAI / Bedrock / Mosaic Foundation Model profiles / Power BI workspaces / AAD tenants / packs is a config edit. The proxy already has routes for every connector type in `config.example.json`. See [DEPLOY_MVP_0.2.md](../DEPLOY_MVP_0.2.md) for the literal deployer checklist.
  - **Phase 9b — Stub-to-SDK graduation** (⏳ v0.3+, per-vendor code). Only Tableau / Qlik / Looker need real adapter code beyond the iframe stub today. Triggered by an org standardising on a non-PBI BI tool. Power BI is already fully wired with `powerbi-client` SDK.
- **Phase 10 — Fabric feature support** (⏳ v0.4+, additive code in PBI adapter). Direct Lake / Dataflow Gen2 / semantic-link API surfaces need new code paths inside the existing Power BI adapter. Triggered by an org enabling Fabric. Classic PBI (Import / DirectQuery / Composite) already works plug-and-play today.
- **Remaining gate before pilot:** live credentialed Power BI + Genie/Supervisor smoke against a deployed proxy with a populated allowlist. No further code work required for the MVP 0.2 cell.
- App.tsx still holds its own copies of the persisted `pulseplay:*` keys alongside the new store (intentional Phase 2 coexistence). Phase 5 retires the duplicates. The `pulseplay:display-change` event keeps them synced.
- `AGENTS.md` is untracked and was not edited by this session.

**Next recommended implementation cycle:**

1. Add allowlist fail-closed behavior and mounted-panel revalidation.
2. Wire live BI metadata into Discovery Loop.
3. Make selected frames affect the AI request/prompt strategy.
4. Harden diagnostics/support-bundle redaction.
5. Run live credentialed smoke with an org Power BI report + Genie/Supervisor profile and enterprise IdP JWKS.
