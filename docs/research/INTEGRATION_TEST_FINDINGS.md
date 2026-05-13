# PulsePlay Integration Test Findings

**Date:** 2026-05-14  
**Author:** Codex  
**Scope:** read-only scan of current code/test health after Settings IA polish and production-auth cycles. No code changes were made during the scan.

## Summary

The current checked-out code is healthy from a test and typecheck perspective.

- Worktree was clean before and after the scan.
- Playground full Vitest suite passed: **36 test files, 369/369 tests**.
- Proxy full Jest suite passed: **32 test suites, 646/646 tests**.
- Playground TypeScript check passed: `npm.cmd run lint` (`tsc --noEmit`).
- Proxy syntax check passed: `node --check server.js`.
- Test hazard scan found no committed `.only` / `.skip` markers.

## Commands Run

```powershell
git status --short
npm.cmd test -- --silent                 # from playground/
npm.cmd test -- --silent                 # from proxy/
rg -n "\.only\(|\.skip\(|describe\.only|it\.only|test\.only|describe\.skip|it\.skip|test\.skip|TODO|FIXME" playground proxy -g "*.test.*" -g "*.spec.*" -g "*.tsx" -g "*.ts" -g "*.js"
npm.cmd run lint                         # from playground/
node --check server.js                   # from proxy/
git status --short
```

## Findings

| ID | Severity | Finding | Evidence | Recommended owner/action |
|---|---|---|---|---|
| ITF-001 | Pass | Playground test suite is green. | `36 passed`, `369 passed`. Includes viewport controls, Settings, KnowledgeShell, BI adapters, AI sidebar, discovery client, and Pulse helpers. | Keep as current baseline. |
| ITF-002 | Pass | Proxy test suite is green. | `32 passed`, `646 passed`. Includes production auth, embed token route, prompt IR/translators, discovery, allowlist, SQL preview, and pack registry. | Keep as current baseline. |
| ITF-003 | Pass | TypeScript and proxy syntax are clean. | `npm.cmd run lint` exited 0; `node --check server.js` exited 0. | Keep as pre-change gate for the next lane. |
| ITF-004 | Pass | No focused or skipped tests are committed. | Hazard scan found no `.only` / `.skip` markers. | Continue checking before release. |
| ITF-005 | Info | One TODO string remains in `proxy/lib/insightsValidator.js`, but the paired test file says that TODO was closed. | Scan found `proxy/lib/insightsValidator.js:11` and `proxy/tests/insightsValidator.test.js:6`. | Optional cleanup: remove/update stale TODO wording if Claude agrees. |
| ITF-006 | Open gap | The green test baseline does **not** close the queued allowlist fail-closed gap. | `docs/AGENT_SYNC.md` still lists Allowlist fail-closed pass as open. | Codex/Claude should keep this as a P1 lane until implemented and verified. |
| ITF-007 | Open gap | No live credentialed Power BI + Genie smoke was run in this scan. | Local suites use test doubles/mocks; no live enterprise workspace was exercised. | Claude should track as pre-pilot verification, not as a code-test failure. |

## Bottom Line

Integration-test-wise, the current tree is good. The remaining concerns are product-readiness gaps, not failing tests: allowlist fail-closed behavior, mounted-panel revalidation, and live enterprise smoke.
