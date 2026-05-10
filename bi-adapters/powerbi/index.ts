// bi-adapters/powerbi/index.ts
//
// Power BI adapter — STUB. v0 falls back to iframe with the embed URL
// (works for any reportEmbed link). v1 will integrate the powerbi-client
// SDK for real event/command bridges (page changes, filter applied,
// selection events, programmatic navigation).
//
// To wire v1:
//   1. cd bi-adapters/powerbi && npm install powerbi-client
//   2. Replace the iframe-fallback mount() with powerbi.embed(...)
//   3. Map the SDK's report.on('pageChanged' | 'filtersApplied' | 'dataSelected')
//      to our canonical BIEvent types
//   4. Implement send() commands via report.setActivePage() / setFilters() / etc.
//   5. Get the embed token from the proxy: GET /api/powerbi/embed-token
//      (endpoint to be added — Azure AD service principal flow)

import { GenericIframeAdapter } from "../generic-iframe/index";

export class PowerBIAdapter extends GenericIframeAdapter {
    readonly vendor = "powerbi";
    readonly displayName = "Power BI";
    // v0: inherits the iframe fallback. v1: will override mount() / send()
    // / on() with powerbi-client SDK calls so PulsePlay's AI sidebar gets
    // real "user navigated to page X" / "user filtered region=East" events.
}
