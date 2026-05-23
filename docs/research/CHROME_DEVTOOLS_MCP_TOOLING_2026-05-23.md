# Chrome DevTools MCP Tooling Note - 2026-05-23

> Status: research/tooling note. No PulsePlay runtime code changed.

## Why This Matters

Rajesh asked to use `gh repo clone ChromeDevTools/chrome-devtools-mcp` to get more data. The repo is directly relevant to PulsePlay's research and browser-smoke workflow because it provides Chrome DevTools access to agents through MCP and an experimental CLI.

For PulsePlay, this is useful in two places:

1. **Research capture** - inspect dynamic docs, authenticated Azure Databricks pages, SQL Warehouse connection details, hidden tables, tabs, console output, and network requests.
2. **Local product validation** - drive the Vite app, capture screenshots, inspect accessibility snapshots, verify console/network failures, run Lighthouse, collect performance traces, and inspect memory when the local UI is behaving oddly.

This does **not** replace the existing in-app Browser plugin or Playwright smokes. It is an optional deeper DevTools layer when page internals matter.

## Clone Result

Requested command:

```powershell
gh repo clone ChromeDevTools/chrome-devtools-mcp
```

Observed in this environment:

- `gh repo clone ChromeDevTools/chrome-devtools-mcp C:\tmp\chrome-devtools-mcp` failed with `HTTP 401: Requires authentication`.
- Public fallback clone first succeeded into `C:\tmp`, then the verified clone was moved under the shared project parent:

```powershell
git clone https://github.com/ChromeDevTools/chrome-devtools-mcp.git C:\tmp\chrome-devtools-mcp
Move-Item C:\tmp\chrome-devtools-mcp D:\Working_Folder\Projects\chrome-devtools-mcp
```

Research clone:

- Path: `D:\Working_Folder\Projects\chrome-devtools-mcp`
- Remote: `https://github.com/ChromeDevTools/chrome-devtools-mcp.git`
- HEAD inspected: `57f32b0cd4afe1775b96ba35c27f25d6f0770331`
- Latest commit inspected: `57f32b0 2026-05-22 10:08:56 +0200 fix: Fix throttling info in performance trace output (#2096)`
- Package version: `1.0.1`
- License: `Apache-2.0`
- MCP name: `io.github.ChromeDevTools/chrome-devtools-mcp`
- Transport: stdio npm package `chrome-devtools-mcp`

The clean research copy now lives beside PulsePlay rather than inside it. A duplicate untracked `PulsePlay\chrome-devtools-mcp` folder matched the same clean upstream HEAD and was removed after the sibling clone was verified.

## What It Offers

The repo exposes both:

- `chrome-devtools-mcp` - MCP server for agents.
- `chrome-devtools` - experimental CLI that talks to a background daemon.

Full MCP tool categories from the generated tool reference:

| Category | Tool count | Useful for PulsePlay |
|---|---:|---|
| Input automation | 10 | Click/fill/keyboard flows through Settings, Ask Pulse, setup, and BI previews. |
| Navigation automation | 6 | Open docs, local app routes, Databricks workspace pages, reload/back/wait flows. |
| Emulation | 2 | Viewport, color scheme, CPU/network throttling, and mobile checks. |
| Performance | 3 | Start/stop traces and inspect performance insights. |
| Network | 2 | List requests and inspect request/response details. |
| Debugging | 8 | Evaluate scripts, screenshots, accessibility snapshots, console logs, Lighthouse, screencast. |
| Memory | 5 | Heap snapshots and retainers for leak investigations. |
| Extensions | 5 | Install/list/reload/trigger/uninstall unpacked Chrome extensions. |
| Third-party | 2 | Execute developer tools exposed by inspected pages when enabled. |
| WebMCP | 2 | Experimental WebMCP tooling when enabled with newer Chrome flags. |

Slim mode exposes only 3 basic tools: navigation, script evaluation, and screenshots. That is good for low-risk page capture, but too limited for PulsePlay debugging because we usually need network, console, snapshots, and Lighthouse.

## Safe PulsePlay Configuration

The repo's Codex guidance recommends `cmd /c npx` on Windows and a longer startup timeout. For PulsePlay, use privacy and data-safety flags by default:

```toml
[mcp_servers.chrome-devtools]
command = "cmd"
args = [
    "/c",
    "npx",
    "-y",
    "chrome-devtools-mcp@latest",
    "--headless=true",
    "--isolated=true",
    "--no-usage-statistics",
    "--no-performance-crux",
    "--redact-network-headers=true"
]
env = { SystemRoot="C:\\Windows", PROGRAMFILES="C:\\Program Files" }
startup_timeout_ms = 20_000
```

Recommended defaults for PulsePlay:

- Use `--isolated=true` for public-docs research and local app smoke work.
- Use `--redact-network-headers=true` whenever network inspection is enabled.
- Use `--no-usage-statistics` because Google collection is enabled by default.
- Use `--no-performance-crux` unless field-performance enrichment is explicitly needed.
- Do not use normal authenticated browser profiles for broad scraping or unattended debugging.

## Authenticated Azure Databricks Research Mode

For Azure Databricks workspace pages, an isolated headless browser will not have the user's workspace session. If authenticated inspection is required, prefer a dedicated Chrome profile and a remote debugging port:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="C:\tmp\pulseplay-devtools-profile"
```

Then configure the MCP server to connect to that browser:

```toml
[mcp_servers.chrome-devtools]
command = "cmd"
args = [
    "/c",
    "npx",
    "-y",
    "chrome-devtools-mcp@latest",
    "--browser-url=http://127.0.0.1:9222",
    "--redact-network-headers=true",
    "--no-usage-statistics",
    "--no-performance-crux"
]
env = { SystemRoot="C:\\Windows", PROGRAMFILES="C:\\Program Files" }
startup_timeout_ms = 20_000
```

This should be treated as sensitive: the MCP client can inspect and interact with the browser. It can see page contents, console output, request metadata, and potentially authenticated workspace content.

## What It Can Add To The Databricks Integration Research

The earlier Azure Databricks integration offering doc was built from official docs. Chrome DevTools MCP can add a browser-observed layer:

| Research question | Chrome DevTools MCP method | Expected value |
|---|---|---|
| What exactly appears on SQL Warehouse Connection Details? | Screenshot + accessibility snapshot + DOM script extraction. | Captures actual workspace UI labels and tool shortcuts. |
| Which Databricks docs pages hide content behind tabs or progressive controls? | Navigate, click tabs, snapshot each state. | Avoids missing content that static HTML extraction may skip. |
| What network calls fire when the Databricks UI opens connection details? | `list_network_requests` + selected request inspection with headers redacted. | Helps distinguish UI-only metadata from documented REST APIs. |
| Are PulsePlay local Databricks setup screens leaking console/network errors? | Console + network tools against `127.0.0.1:5173`. | Adds evidence before shipping UX changes. |
| Are Settings and Ask Pulse accessible enough? | Accessibility snapshot + Lighthouse audit. | Catches semantic, label, contrast, tap-target, and focus issues. |
| Does a local UI change hurt performance? | Trace start/stop + performance insights. | Gives a DevTools-level performance view beyond unit tests. |

## Current Limitation

The repo is cloned and inspected, but Chrome DevTools MCP is **not active in this running Codex session**. Tool discovery did not expose a callable Chrome DevTools MCP tool after cloning. MCP server configuration normally requires adding the server to Codex config and starting a fresh session.

Available fallback today:

- Existing in-app Browser plugin for local browser screenshots/inspection when available.
- Existing Playwright/Chromium smoke scripts in the PulsePlay repo.
- The cloned Chrome DevTools MCP source/docs under `D:\Working_Folder\Projects\chrome-devtools-mcp`.

## Recommendation

Adopt Chrome DevTools MCP as an optional "deep browser evidence" tool, not as a required dependency for normal PulsePlay development.

First use cases:

1. Authenticated Azure Databricks UI evidence capture, especially SQL Warehouse Connection Details, Genie Spaces, AI/BI dashboards, Databricks Apps, and Unity Catalog UI paths.
2. Local PulsePlay accessibility and console/network sweep after major Settings or Ask Pulse UI changes.
3. Performance trace capture for first-load, Ask Pulse submit, native canvas render, and Settings setup flows.

Do not commit the cloned upstream repo into PulsePlay. Keep it external or install it as an MCP/plugin dependency.

## Source Ledger

| Source | What was used |
|---|---|
| https://github.com/ChromeDevTools/chrome-devtools-mcp | Repository, README, package metadata, plugin metadata, tool reference, skills. |
| https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/README.md | Codex/Windows config, privacy flags, server options, browser connection modes. |
| https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md | Full MCP tool categories and tool names. |
| https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/cli.md | Experimental CLI behavior and command shape. |
| https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/troubleshooting.md | Windows and sandbox troubleshooting notes. |
| `D:\Working_Folder\Projects\chrome-devtools-mcp\server.json` | MCP package identity, version, npm package, stdio transport. |
