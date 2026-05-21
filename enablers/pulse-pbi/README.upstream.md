# PBI Genie Visual

Power BI custom visual that brings the Databricks Genie chat experience into Power BI reports — natural-language Q&A backed by a governed metric view, with interactive charts, tables, and follow-up suggestions.

## What It Does

- replicates the Databricks Genie chat interface inside Power BI
- listens to Power BI report context through bound dimensions and measures
- sends compact, explainable business context to Databricks Genie
- reacts to slicers, filters, and cross-visual interactions
- renders Genie responses with rich markdown, SQL disclosure, and tabular results
- renders interactive charts (bar, line, area, pie, scatter) with chart titles, axis labels, chart-type switching and axis configuration
- parses follow-up questions from the Genie API (`suggested_questions` attachment) and renders them as clickable suggestion buttons
- supports outbound cross-filtering through clickable context chips
- shows live connection status and contextual empty states for guided setup

## Quick Start

```powershell
npm install
npm run package
```

The packaged `.pbiviz` artifact is produced in `dist/`. Import it into Power BI Desktop or publish via Power BI Service.

## Recommended Setup

1. Bind an anchor measure: `PBIGENIE_FILTER = COUNTROWS(<table_or_view>)`
2. Bind key business dimensions and one to three business measures.
3. Set `Databricks Workspace URL` (or `API Base URL Override` for proxy mode).
4. Set `Genie Space ID` and `Genie View Fields`.
5. Optionally add `Domain Guidance` to anchor Genie's answering context.

## Local Proxy For Development

```powershell
$env:DATABRICKS_HOST = "https://<your-workspace>.azuredatabricks.net"
$env:DATABRICKS_TOKEN = "<your-pat>"
npm run start:proxy
```

Proxy listens on `http://127.0.0.1:8787`. Set `API Base URL Override` to that address in the visual format pane.

## Documentation

| Document | Purpose |
|---|---|
| [docs/DEPLOYMENT_GUIDELINES.md](docs/DEPLOYMENT_GUIDELINES.md) | Report authoring standards, field binding rules, validation checklist |
| [docs/PROXY_GUIDE.md](docs/PROXY_GUIDE.md) | Production proxy patterns — Azure APIM, Azure Functions, AWS API Gateway, Nginx |
| [docs/AUTH_GUIDE.md](docs/AUTH_GUIDE.md) | Power BI RLS vs Databricks authorization — the gap and how to bridge it |
| [docs/TECHNICAL_REFERENCE.md](docs/TECHNICAL_REFERENCE.md) | Source file map, data flow, connection model, interaction model |
| [docs/PACKAGE_PRINCIPLES.md](docs/PACKAGE_PRINCIPLES.md) | Design principles — product, engineering, performance, security, auth |
| [docs/PERFORMANCE_AND_SECURITY_CHECKLIST.md](docs/PERFORMANCE_AND_SECURITY_CHECKLIST.md) | Pre-release checklists — performance, security, authentication, interaction, handover |
| [docs/TECHNICAL_UPDATE_FOR_AGENTS.md](docs/TECHNICAL_UPDATE_FOR_AGENTS.md) | Adaptation guide for other LLMs or agents reusing this pattern |
| [docs/HANDOVER.md](docs/HANDOVER.md) | Current state, known limitations, suggested next work |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Release history |

## Included Examples

- `examples/SampleSuperStoreAnalysis/` contains the workspace sample `.pbip` project with its report and semantic model folders.
- `examples/Test_Fabric_PBI_Trail_Activation/` contains the Fabric and Power BI trial assets that belong with this visual workspace.

## Project Structure

```
PBIGenieVisual/
├── README.md                  ← you are here
├── docs/                      ← all documentation
├── examples/                  ← sample Power BI projects and workspace assets
├── src/
│   ├── visual.tsx             ← Power BI host adapter
│   ├── VisualApp.tsx          ← top-level UI coordinator
│   ├── genie.ts               ← Databricks Genie API client
│   ├── contextBuilder.ts      ← Power BI context summarizer
│   ├── settings.ts            ← format-pane settings model
│   ├── visualHelpers.ts       ← shared helpers (includes rich markdown formatter)
│   ├── visualTypes.ts         ← shared types
│   ├── visualConstants.ts     ← prompts and field constants
│   ├── hooks/
│   │   └── useConnectionState.ts
│   └── components/
│       ├── ChatHistory.tsx    ← Genie-style message layout with analysis, follow-ups
│       ├── ComposeArea.tsx    ← compose bar with Enter-to-send
│       ├── ContextStrip.tsx   ← clickable dimension filter chips
│       ├── GenieChart.tsx     ← D3 chart renderer (bar, line, area, pie, scatter) with titles and axis labels
│       ├── GenieDataView.tsx  ← table/chart switcher with toolbar
│       └── GenieTable.tsx     ← data table with row numbers and column type indicators
├── proxy/
│   └── server.js              ← local test proxy (not for production)
├── style/
│   └── visual.less            ← Databricks Genie-inspired styling (light + dark)
├── assets/
│   └── icon.png
├── capabilities.json
├── pbiviz.json
├── tsconfig.json
└── package.json
```
