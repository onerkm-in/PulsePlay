// bi-adapters/looker/index.ts
//
// Looker adapter — STUB. v0 falls back to iframe (signed-URL embed).
// v1 will use the Looker Embed JavaScript SDK for event bridges.
//
// To wire v1:
//   1. npm install @looker/embed-sdk
//   2. mount() uses LookerEmbedSDK.createDashboardWithUrl(...).build().connect()
//   3. Listen to dashboard:loaded / dashboard:filters:changed /
//      drillmenu:click and map to canonical BIEvent types
//   4. send() uses dashboard.send('dashboard:filters:update', { filters })
//   5. Auth: signed-URL via the proxy: GET /api/looker/signed-url
//      (server-side embed-secret HMAC, NEVER browser-side)

import { GenericIframeAdapter } from "../generic-iframe/index";

export class LookerAdapter extends GenericIframeAdapter {
    readonly vendor = "looker";
    readonly displayName = "Looker";
}
