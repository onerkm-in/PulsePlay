// bi-adapters/qlik/index.ts
//
// Qlik Sense adapter — STUB. v0 falls back to iframe. v1 will use
// qlik-embed (Qlik Cloud's web-component family) which gives access
// to selections, app state, and field events.
//
// To wire v1 (Qlik Cloud):
//   1. Load https://cdn.jsdelivr.net/npm/@qlik/embed-web-components/dist/index.min.js
//   2. mount() creates <qlik-embed ui="analytics/sheet" app-id="..." sheet-id="..." />
//   3. Listen to selectionsChanged / appOpened events
//   4. send() uses qlik.app.field(...).select(...) for filters
//   5. Auth: OAuth M2M via the proxy: GET /api/qlik/auth (token exchange)
//
// For Qlik Sense Enterprise (on-prem), the Single Integration API
// (iframe-based) is the easier path.

import { GenericIframeAdapter } from "../generic-iframe/index";

export class QlikAdapter extends GenericIframeAdapter {
    readonly vendor = "qlik";
    readonly displayName = "Qlik Sense";
    // qlik-embed web components need scripts + same-origin. The OAuth M2M
    // flow runs server-side through the proxy, so the iframe itself does
    // NOT need `allow-popups`. Add popups only for deployments using the
    // first-party OAuth code flow inside the iframe.
    protected defaultSandbox = "allow-scripts allow-same-origin";
}
