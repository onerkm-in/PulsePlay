# ADR-0010 - PulsePlay Ecosystem Artifact Strategy

**Status:** Accepted 2026-05-21

**Date:** 2026-05-21

## Context

PulsePlay is growing from a single React playground into an ecosystem of related enablement artifacts:

- the web playground and proxy
- the Pulse PBI native custom visual path
- a possible local desktop EXE for no-setup recon
- Databricks/Azure hosted deployments

The product intent is to keep options open without multiplying systems. The user direction is clear: Pulse PBI and PulsePlay should feel like one ecosystem, share one proxy contract, and allow teams to choose the artifact that fits their context. The ecosystem should also arrive as one repo checkout/download so a user gets every enabler together. At the same time, Pulse PBI runs inside the Power BI custom visual sandbox, PulsePlay runs as a normal browser app, and the desktop EXE would serve authors/analysts/DPMs doing quick feasibility checks on their own laptops.

Those are different runtimes. Forcing them into one mega-binary or one source layout now would create the wrong kind of coupling.

## Decision

Treat PulsePlay as an umbrella ecosystem with one repo/download and multiple build artifacts, but not one runtime blob.

Accepted artifacts:

| Artifact | Audience | Runtime | Purpose |
|---|---|---|---|
| PulsePlay web | authors, analysts, admins, eventual org users | browser + deployed proxy | primary internal playground and production-capable host |
| Pulse PBI `.pbiviz` | Power BI authors and consumers | Power BI custom visual sandbox | native Power BI experience where Power BI is the host |
| PulsePlay desktop EXE | authors, analysts, DPMs doing recon | inbuilt local app server + proxy | 1-click feasibility and setup exploration, not production hosting |
| Hosted deployment bundles | admins/deployers | Databricks/Azure/enterprise PaaS | governed team/org deployment |

This ADR does not move Pulse PBI source into this repo in this docs slice, does not add a monorepo `packages/` layer, and does not create desktop runtime code. It locks the target strategy and sequencing: one checkout should eventually contain every enabler, while each enabler keeps its own runtime/build boundary.

## Single Proxy Ecosystem

Pulse PBI and PulsePlay should share one proxy product, codebase, API contract, governance model, result envelope, and audit vocabulary.

That means:

- one connector registry direction
- one governance attestation contract
- one audit event vocabulary
- one source-ref model
- one route family where possible
- client identity attached to requests and audit records

It does not always mean one physical process.

Allowed topologies:

| Environment | Topology |
|---|---|
| Local development | one proxy by default; separate ports allowed when mocks or debugging conflict |
| Internal pilot | one shared proxy deployment preferred |
| Regulated production or isolation need | multiple deployments of the same proxy code/config contract |
| Desktop EXE recon | inbuilt app server + proxy, local loopback only |

The rule is:

> Same proxy contract and governance. Deployment topology may vary.

## No Lite Proxy Mode

The desktop EXE must not become a fast path that bypasses governance.

Production desktop builds must use the same proxy logic as hosted PulsePlay, but that proxy/server is bundled into the desktop artifact. The user must not have to install Node, run `npm`, start a separate proxy, or manage a separate local server.

The EXE can start an embedded/sidecar local process internally, but that is an implementation detail of the artifact. From the user's perspective, the proxy and app server are inbuilt.

The bundled proxy must keep the same rules:

- same allowlist checks
- same governance attestation
- same audit events
- same source-ref validation
- same secret redaction
- same token issuance rules

Development builds can have explicit mock/dev flags. Production EXE builds must ship with those shortcuts off.

## Client Identity Contract

PX1 should add a shared client identity contract:

```http
X-Pulse-Client: pulseplay | pulse-pbi | pulseplay-desktop
X-Pulse-Client-Version: <semver-or-commit>
X-Pulse-Request-Id: <uuid>
```

Audit records should include the client app:

```ts
type PulseClientApp = "pulseplay" | "pulse-pbi" | "pulseplay-desktop";

interface ProxyAuditContext {
  clientApp: PulseClientApp;
  clientVersion?: string;
  requestId: string;
  subjectRef?: string;
}
```

The proxy may later expose client-specific compatibility/readiness routes, but those routes must describe capability differences. They must not fork connector logic.

## Single Download Folder Structure

Separate components should still ship in one folder structure. The target repo shape is:

```text
PulsePlay/
  playground/              # PulsePlay web app
  proxy/                   # shared proxy code/contract
  bi-adapters/             # PulsePlay BI adapter implementations
  pulsepacks/              # shared pack/source intent layer
  enablers/
    pulse-pbi/             # Power BI custom visual project/artifact lane
    desktop/               # future Tauri desktop EXE lane
  docs/
```

The `enablers/` folder is not an `apps/` monorepo refactor and not a shared package layer. It is a distribution boundary: optional artifacts live together in one checkout while preserving their own build tools and constraints.

For single-download behavior, avoid Git submodules for required enablers because source ZIP downloads do not reliably include submodule contents. Prefer tracked source, subtree/vendor import, or generated artifact bundles that are included in release assets. If a submodule is used temporarily during migration, it must not be the final "download one repo and have everything" story.

## Pulse PBI Position

Pulse PBI is part of the PulsePlay ecosystem and should be present in the single repo/download, but it remains a separate runtime and build boundary.

Near-term:

- add a PB0 folder-convergence step before PB1: bring Pulse PBI into `enablers/pulse-pbi/` or an equivalent tracked folder so one checkout contains it
- keep `docs/PULSE_SYNC.md` as the copy-port and drift-visibility ledger
- let proxy improvements benefit Pulse PBI through the shared proxy contract
- add a PB1 planning/build lane only after PB0 + G3, unless explicitly redirected
- do not create shared packages until copy-port discipline fails or 2+ artifacts genuinely need the same module with active maintenance pressure

Future one-command build orchestration is allowed, but it should initially be a thin script that calls the isolated `enablers/pulse-pbi/` build rather than merging Pulse PBI code into the PulsePlay web app.

## Desktop EXE Position

The desktop EXE is a recon tool for authors/analysts/DPMs, not a production server. It should still bundle everything needed to run locally: static app server, proxy routes, connector clients, and first-run setup flow.

Requirement differences:

| Requirement | Desktop EXE recon | PulsePlay web | Pulse PBI |
|---|---|---|---|
| Audience | authors/analysts/DPMs | authors/admins/org users | Power BI authors/consumers |
| Setup | no Node, no npm, no separate proxy/server, no admin rights where possible | IT/deployer managed | Power BI visual distribution |
| Concurrency | single local user | multi-user | one visual instance per report/user |
| Persistence | encrypted local folder | hosted/configured deployment | Power BI sandbox-limited |
| Governance | same proxy contract | same proxy contract | same proxy contract |
| Positioning | recon disclaimer required | production-capable | embedded Power BI experience |

The desktop EXE should:

- start its inbuilt local app server/proxy on random available loopback ports
- bind only to `127.0.0.1`
- create a colocated data folder on first launch
- encrypt local config/secrets/cache at rest
- redact logs
- generate a one-time launch token per session
- open a private/incognito browser window when possible
- fall back cleanly when a private browser cannot be launched

Candidate local layout:

```text
PulsePlay.exe
PulsePlayData/
  config.enc
  secrets.enc
  profiles/
  cache/
  logs/
  runtime/
```

Browser launch preference:

1. Chrome incognito new window
2. Edge InPrivate new window
3. Firefox private window
4. Brave incognito new window
5. default browser with explicit warning/log entry

There is no universal standard that forces an arbitrary default browser into private/incognito mode.

## Tauri Preference

For DX1, prefer Tauri over Electron.

Reasons:

- smaller download
- faster startup
- lower memory footprint
- better fit for a lightweight recon tool
- desktop shell mostly needs to start local services and open a browser, not host heavy Node-integrated UI

Electron remains a fallback if a later desktop requirement needs deep bundled Chromium/Node integration that Tauri cannot cover.

## Repository Layout

Do not start an `apps/` plus `packages/` monorepo refactor for BX0. Do create a single-download enabler layout when PB0/DX1 starts.

Near-term accepted shape:

- keep current `playground/`, `proxy/`, and `bi-adapters/`
- move/copy/import Pulse PBI into `enablers/pulse-pbi/` during PB0, preserving its Power BI sandbox constraints and build isolation
- add future desktop EXE work under `enablers/desktop/` during DX1
- avoid `packages/` until reuse pressure is real

This intentionally preserves the G0 decision to defer `packages/viz-core`.

## Sequencing

Recommended sequence:

1. **BX0 - Artifact strategy ADR** - this ADR.
2. **PX1 - Unified proxy client contract** - can ride alongside G2/G3 because it benefits current PulsePlay and Pulse PBI.
3. **G2 + G2.5 + G3** - finish visualization pipeline, Databricks source refs, and governance attestation before new artifact runtime work.
4. **PB0 - Single-download enabler folder** - bring Pulse PBI into `enablers/pulse-pbi/` without merging its runtime into PulsePlay web.
5. **PB1 - Optional PBIVIZ build lane** - formalize the Power BI custom visual artifact path after G3/PB0 unless explicitly pulled forward.
6. **DX1 - Desktop EXE proof** - Tauri proof under `enablers/desktop/` with inbuilt app server/proxy, random loopback ports, and private browser launch.
7. **DX2 - Encrypted portable data** - encrypted colocated data folder, TTL, redaction, and clear-on-quit options.

Do not ship DX1/DX2/PB1 half-done in parallel with an unfinished G3 governance contract.

## Consequences

Positive:

- keeps Pulse PBI and PulsePlay aligned without forcing a premature source merge
- lets one repo checkout contain all enablers
- lets proxy governance/audit improvements benefit every client
- creates a path for lightweight desktop recon without weakening security
- preserves optionality for hosted, PBIVIZ, and desktop delivery
- prevents `packages/`/monorepo churn before there is enough reuse pressure

Negative:

- copy-port discipline remains a process burden until a package layer is justified
- Tauri introduces Rust/toolchain considerations when DX1 begins
- desktop encryption and browser-private launch behavior will need platform-specific testing
- moving Pulse PBI into the single-download tree needs a careful import plan to preserve history/build assumptions
- one-command PBIVIZ build orchestration still needs coordination with the Pulse PBI artifact lane

## Tripwires

- If a PR creates a separate Pulse PBI proxy with duplicated connector logic, stop and route it through PX1.
- If a PR keeps a required enabler only as an external sibling dependency after PB0, challenge it against the single-download rule.
- If a PR uses a Git submodule for a required enabler, verify source ZIP/release download behavior before accepting it as complete.
- If a PR adds a desktop "lite proxy" that skips governance, reject it.
- If a PR moves PulsePlay-native code under Pulse PBI sandbox constraints merely for shared-proxy convenience, reject it.
- If a PR creates `packages/` only to share one speculative module, defer it.
- If the desktop EXE is described as production hosting, correct the copy to "recon tool" until a future ADR changes that posture.

## Related

- [ADR-0009 - Native BI Adapter Is a Renderer Only](0009-native-bi-adapter.md)
- [Pulse PBI sync ledger](../PULSE_SYNC.md)
- [Settings author/viewer UX scan](../SETTINGS_AUTHOR_VIEWER_UX_SCAN.md)
- [Hosting options guide](../HOSTING_OPTIONS.md)
- [Public OSS agenda](../PUBLIC_OSS_AGENDA.md)
