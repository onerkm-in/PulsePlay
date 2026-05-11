// bi-adapters/tableau/index.ts
//
// Tableau adapter — STUB. v0 falls back to iframe. v1 will use the
// Tableau Embedding API v3 web component (<tableau-viz>) for real
// event bridges and parameter/filter manipulation.
//
// To wire v1:
//   1. Add the script tag in index.html or load via dynamic import:
//      https://<server>/javascripts/api/tableau.embedding.3.latest.min.js
//   2. mount() creates a <tableau-viz> custom element with src=embedConfig.url
//   3. Listen to 'firstinteractive' / 'tabswitched' / 'parametervaluechanged'
//      / 'filterchanged' and map to canonical BIEvent types
//   4. send() uses workbook.activeSheet.applyFilterAsync(...) etc.
//   5. Auth: trusted-ticket via the proxy: GET /api/tableau/trusted-ticket

import { GenericIframeAdapter } from "../generic-iframe/index";

export class TableauAdapter extends GenericIframeAdapter {
    readonly vendor = "tableau";
    readonly displayName = "Tableau";
    // Tableau Embedding API v3 / Tableau Server iframe embeds need scripts +
    // same-origin only. Forms and popups are NOT required for the read-only
    // viewer; deployments that enable subscription / share / web-authoring
    // can re-add `allow-popups` via the per-mount `cfg.sandbox` override.
    protected defaultSandbox = "allow-scripts allow-same-origin";
}
