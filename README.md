# PulsePlay

**Multi-BI AI playground.** A React app that hosts ANY BI tool (Power BI, Tableau, Qlik, Looker, generic iframe, or any URL) as an embedded guest, with an AI assistant sidebar that reasons about whatever you're currently looking at.

## What it is

PulsePlay is a 2-axis abstraction:

- **Y: BI vendor axis** — what the user is LOOKING AT (Power BI / Tableau / Qlik / Looker / generic iframe). Pick one, embed it in the canvas. Vendor-agnostic via the [`BIAdapter`](playground/src/biPanel/BIAdapter.ts) contract.
- **X: AI connector axis** — what the AI brain IS (Databricks Genie / Azure OpenAI / AWS Bedrock / Mosaic AI Foundation Model / Supervisor Agent). Pick one in the sidebar. Connector-agnostic via the proxy's profile system.

Any combination of (vendor, connector) is valid. Switch either independently.

## Why it exists

The sister project [DwD_AI_Assistant_for_PBI](../DwD_AI_Assistant_for_PBI) proved out the AI-over-BI pattern as a Power BI custom visual. That product is locked into the Power BI sandbox (no `fetch`, no streaming, no Web Workers, single-vendor). PulsePlay flips the model: **the React playground is the host, BI tools are guests** — which removes the sandbox constraints AND opens the door to multi-vendor BI orchestration.

What becomes possible (the "gateway of madness"): streaming AI responses, voice in/out, AI-driven auto-tour mode, cross-vendor "single pane of glass" answers, AI-painted overlay annotations on top of iframes, multi-user collaboration via WebRTC, save/share/branch sessions, in-browser data joins via DuckDB-WASM. See [docs/MULTI_BI_ARCHITECTURE.md](docs/MULTI_BI_ARCHITECTURE.md) "Gateway of madness" for the full roadmap.

## Quick start

```powershell
# 1. Install proxy dependencies + start it (terminal 1)
cd proxy
npm install
node server.js
# Listens on http://127.0.0.1:8787

# 2. Install playground dependencies + start it (terminal 2)
cd playground
npm install
npm run dev
# Open http://127.0.0.1:5173
```

Configure the proxy by copying `proxy/config.example.json` → `proxy/config.json` and filling in your Databricks workspace + token (or Azure OpenAI key, or Bedrock creds — see [docs/API_AUTH_AND_LIMITATIONS.md](docs/API_AUTH_AND_LIMITATIONS.md) for every supported backend).

Once both are running, the playground will:
- Show a `VendorPicker` (Y-axis) and `ConnectorPicker` (X-axis) on the left
- Let you paste any embed URL into `EmbedConfigForm`
- Render the BI tool in the canvas
- Accept questions in the `AISidebar` that get routed to the active connector

## Status

**v0.1.0 — scaffold complete.** Proxy + databricks-agents + cross-cutting docs inherited from DwD_AI_Assistant_for_PBI cycles 1-47. Playground React shell + 5 vendor adapter stubs (PowerBI, Tableau, Qlik, Looker, generic-iframe — all currently iframe-based) + the 2-axis pickers + the AI sidebar shell. Vendor SDK wiring is the next cycle.

Proxy tests: 342/342 inherited. Playground tests: not yet written (Vitest configured).

## Repository layout

See [docs/MULTI_BI_ARCHITECTURE.md](docs/MULTI_BI_ARCHITECTURE.md) for the full layout walkthrough.

```
PulsePlay/
├── playground/           # Vite + React + TS frontend (the host)
├── bi-adapters/          # Y-axis: BI vendor adapters
├── proxy/                # X-axis: connector-agnostic AI backbone (copied from DwD)
├── databricks-agents/    # Mosaic AI Supervisor Agent template (copied from DwD)
├── scripts/              # llm_onboard, llm_wrapup, smoke helpers (copied from DwD)
├── docs/                 # Architecture, security, taxonomies, beast mode
├── CLAUDE.md             # Per-session collaboration guide for LLMs
└── README.md             # This file
```

## License

Same posture as DwD_AI_Assistant_for_PBI — internal/private until otherwise stated.

## Sister project

This is a sibling of [DwD_AI_Assistant_for_PBI](../DwD_AI_Assistant_for_PBI) (the Power BI custom visual). Cross-pollination is intentional: bug fixes in proxy/ should be ported between both projects manually until a shared library extraction is done. Same applies for cross-cutting docs (security review, enterprise readiness, API surface).
