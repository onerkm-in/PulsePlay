// playground/src/lib/__tests__/pbiAuth.allowlist.test.ts
//
// L1 closure tests — `signInAndPrepareEmbed` must refuse any tenant that
// isn't on the organization allowlist BEFORE MSAL initialization. The
// EmbedConfigForm already enforces this, but we test the lower layer so
// future callers that bypass the form still hit the gate.

import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { signInAndPrepareEmbed, PbiAllowlistError } from "../pbiAuth";

describe("pbiAuth allowlist gate", () => {
    beforeEach(() => {
        vi.stubGlobal("open", vi.fn(() => null));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("throws PbiAllowlistError when tenant is missing and allowlist is non-empty", async () => {
        await expect(
            signInAndPrepareEmbed(
                {
                    clientId: "test-client",
                    tenantId: undefined,
                    allowedTenants: ["org-tenant-guid"],
                },
                "group-1",
                "report-1",
            ),
        ).rejects.toThrow(PbiAllowlistError);
    });

    it("throws PbiAllowlistError when tenant is outside the allowlist", async () => {
        await expect(
            signInAndPrepareEmbed(
                {
                    clientId: "test-client",
                    tenantId: "attacker-tenant",
                    allowedTenants: ["org-tenant-guid"],
                },
                "group-1",
                "report-1",
            ),
        ).rejects.toThrow(PbiAllowlistError);
    });

    it("error message names the rejected tenant + the allowed set", async () => {
        let err: unknown = null;
        try {
            await signInAndPrepareEmbed(
                {
                    clientId: "test-client",
                    tenantId: "wrong-tenant",
                    allowedTenants: ["org-tenant"],
                },
                "g",
                "r",
            );
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(PbiAllowlistError);
        const message = (err as Error).message;
        expect(message).toContain("wrong-tenant");
        expect(message).toContain("org-tenant");
    });

    it("passes the gate when tenant is in the allowlist (then fails downstream — no real MSAL)", async () => {
        // The gate is the only check that fires deterministically in
        // jsdom — MSAL.js will fail when actually invoked. We only assert
        // the failure is NOT a PbiAllowlistError, i.e. the gate let us
        // through.
        let err: unknown = null;
        try {
            await signInAndPrepareEmbed(
                {
                    clientId: "test-client",
                    tenantId: "org-tenant",
                    allowedTenants: ["org-tenant"],
                },
                "g",
                "r",
            );
        } catch (e) {
            err = e;
        }
        expect(err).not.toBeInstanceOf(PbiAllowlistError);
    });

    it("no-ops when allowlist is empty (dev mode)", async () => {
        let err: unknown = null;
        try {
            await signInAndPrepareEmbed(
                {
                    clientId: "test-client",
                    tenantId: "any-tenant",
                    allowedTenants: [],
                },
                "g",
                "r",
            );
        } catch (e) {
            err = e;
        }
        expect(err).not.toBeInstanceOf(PbiAllowlistError);
    });
});
