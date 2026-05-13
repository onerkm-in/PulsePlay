// playground/__tests__/cspFromAllowlist.test.ts
//
// L7 closure — strict CSP generated from the proxy allowlist replaces
// the wildcard CSP in production builds. Pure-function test of the
// helper; the Vite plugin integration is exercised by `npm run build`.

import { describe, it, expect } from "vitest";
import { buildStrictCsp } from "../vite.cspFromAllowlist";

describe("buildStrictCsp", () => {
    it("emits a strict CSP with no wildcard subdomains when allowlist provides specific hosts", () => {
        const csp = buildStrictCsp({
            embedOrigins: { powerbi: ["app.powerbi.com"] },
            aadTenants: ["org-tenant"],
        });
        expect(csp).not.toContain("*.powerbi.com");
        expect(csp).not.toContain("*.tableau.com");
        expect(csp).not.toContain("*.qlikcloud.com");
        expect(csp).not.toContain("*.looker.com");
        expect(csp).not.toContain("*.microsoftonline.com");
        expect(csp).not.toContain("'unsafe-eval'");
        expect(csp).toContain("frame-src 'self' https://login.microsoftonline.com https://app.powerbi.com");
    });

    it("falls back to base origins when the allowlist is missing", () => {
        const csp = buildStrictCsp(undefined);
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("frame-src 'self'");
        // Without the allowlist there are no vendor frame origins — only
        // the base 'self' + login.microsoftonline.com.
        expect(csp).not.toContain("app.powerbi.com");
    });

    it("includes connect-src for the proxy + AAD endpoints", () => {
        const csp = buildStrictCsp({ embedOrigins: {}, aadTenants: [] });
        expect(csp).toContain("connect-src 'self' https://login.microsoftonline.com");
        expect(csp).toContain("https://api.powerbi.com");
        expect(csp).toContain("https://analysis.windows.net");
    });

    it("adds every per-vendor embed origin to frame-src", () => {
        const csp = buildStrictCsp({
            embedOrigins: {
                powerbi: ["app.powerbi.com"],
                tableau: ["us-east-1.online.tableau.com"],
                qlik: ["org.qlikcloud.com"],
            },
            aadTenants: [],
        });
        expect(csp).toContain("https://app.powerbi.com");
        expect(csp).toContain("https://us-east-1.online.tableau.com");
        expect(csp).toContain("https://org.qlikcloud.com");
    });
});
