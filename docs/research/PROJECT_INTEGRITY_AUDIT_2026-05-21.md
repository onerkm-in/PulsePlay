# Project Integrity Audit — 2026-05-21

Multi-agent scan across PulsePlay web, proxy, native adapter, Pulse PBI enabler, docs, and build tooling. Scope was deliberately broad; this file separates what was fixed immediately from what remains queued.

## Fixed In This Sweep

- **Admin auth contract.** `/admin/*` now mounts behind the same auth-mode middleware as cost-bearing routes, and route-local guards mirror `PROXY_AUTH_MODE`. `X-PulsePlay-Key` and legacy `X-Genie-Key` both work.
- **SQL preview trust boundary.** `/sql/preview` and `/sql/explain` no longer treat browser-supplied Section H CTE as inherently trusted. The helper validates metadata statements, unsafe CTE preambles, multi-statements, forbidden DML/DDL, and the final composed SQL.
- **Governance registry authority.** `governanceForBackend()` no longer lets route-local `extra` override registry-owned `authority`, `subjectRef`, `requestId`, `policyVersion`, or `enforced`.
- **Streaming error redaction.** Foundation Model NDJSON and Supervisor stream error events now pass messages through the shared redaction helper before writing in-band errors.
- **Quick Setup embed config integrity.** Quick Setup now writes adapter-mountable configs for Databricks Genie (`iframe`) and Power BI secure embed (`mode: "secure-embed"`, `embedMode: "secure"`, `embedUrl`). Legacy `iframeHtml` / `secureLink` configs remain accepted by adapters.
- **Registry parity flake.** The registry parity dynamic-import `beforeAll` timeout was widened to handle full-suite load.
- **Pulse PBI CI coverage.** GitHub Actions now runs Pulse PBI enabler lint + unit tests. Playwright artifacts and Databricks app staging output are ignored.

## Still Open

- **Pulse PBI unified proxy adoption.** The enabler still calls its historical Databricks-facing HTTP layer. PB1/PX follow-up should move it onto the shared proxy contract and send `X-Pulse-Client: pulse-pbi`.
- **Pulse PBI production WebAccess.** Production proxy origins need explicit Power BI `WebAccess` declarations when a deployed proxy URL is used.
- **PBIVIZ toolchain reproducibility.** `pbiviz` works locally via the installed toolchain and packaging passes, but `powerbi-visuals-tools` is still not pinned in `package-lock.json`. A pin attempt timed out in this session; do not call package reproducibility solved.
- **Legacy release/smoke scripts.** `scripts/release-check.ps1`, `scripts/smoke-full.ps1`, and `proxy/smoke_test.ps1` still contain stale inherited paths/contracts and need a dedicated cleanup.
- **Full proxy-backed browser smoke.** SS2 remains the right next infrastructure cycle: boot proxy + Vite, return a governed mock envelope, and verify the full shell/canvas path in Chromium.
- **Docs consolidation debt.** Top-level validation counts were refreshed, but older ADR/memory line anchors and historical counts still need the planned docs consolidation pass B.

## Validation

| Check | Result |
|---|---|
| `cd proxy && npm test` | **1133/1133** |
| `cd playground && npm run lint` | pass |
| `cd playground && npm run test` | **1369/1369** |
| `cd playground && npm run build` | pass |
| `cd enablers/pulse-pbi && npm run lint` | pass |
| `cd enablers/pulse-pbi && npm test` | **87/87** |
| `cd enablers/pulse-pbi && npm run package` | pass, local `pbiviz` 7.0.2 |
| `node --check proxy/server.js` | pass |
| `git diff --check` | clean except expected LF-to-CRLF warnings |

