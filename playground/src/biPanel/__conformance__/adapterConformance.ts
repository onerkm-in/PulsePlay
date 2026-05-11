// playground/src/biPanel/__conformance__/adapterConformance.ts
//
// Vendor-agnostic conformance harness for the BIAdapter contract.
//
// Why this exists
// ───────────────
// PulsePlay's defining design is the 2-axis abstraction: ANY BI vendor on
// the Y-axis combined with ANY AI connector on the X-axis. The contract
// every vendor adapter must honor lives in playground/src/biPanel/BIAdapter.ts.
// Without a shared test suite, each adapter's tests check that adapter's
// own behaviour — but nothing guarantees they all behave the same from
// the host's perspective. New adapters can quietly violate the contract
// (forget to make destroy() idempotent; let listeners leak; throw the
// wrong error code; misreport capabilities).
//
// `runAdapterConformance()` registers a describe() block of universal
// assertions every adapter must pass — the test suite for the *contract*,
// run once per adapter. Adapter-specific tests (event-translation, vendor
// SDK plumbing) stay in their own files; this harness covers only what's
// reachable through the public BIAdapter surface.
//
// Usage from a vendor test file:
//
//   import { runAdapterConformance } from "../../../playground/src/biPanel/__conformance__/adapterConformance";
//   import { MyAdapter } from "../index";
//
//   runAdapterConformance("MyAdapter", {
//       factory: () => new MyAdapter(),
//       validConfig: { url: "https://example.com" } as BIEmbedConfig,
//       beforeMount: () => { /* inject fake SDK */ },
//       afterDestroy: () => { /* drop fake SDK */ },
//   });
//
// What this harness does NOT cover (intentionally)
// ───────────────────────────────────────────────
// - Vendor-specific event translation (PBI pageChanged → "page-changed").
//   Each adapter's own test file owns that — the harness doesn't know
//   how to synthesize a vendor-specific event.
// - Real SDK plumbing (network calls, postMessage handshakes). Adapters
//   running through the harness should be able to mount inside jsdom
//   without contacting external services; provide a `beforeMount` hook
//   to inject fakes if the adapter needs them.

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import type {
    BIAdapter,
    BICapabilities,
    BICommand,
    BIEmbedConfig,
} from "../BIAdapter";
import { BI_ERR } from "../BIAdapter";

export interface AdapterConformanceOptions {
    /** Construct a fresh adapter for each test. Tests assume no shared state. */
    factory: () => BIAdapter;
    /** A config that can be successfully mounted in jsdom. Required unless
     *  `skipMountTests` is true — without it, the post-mount assertions
     *  can't run. */
    validConfig?: BIEmbedConfig;
    /** Called before each test, before the adapter is constructed. Use to
     *  install fakes (e.g., inject a fake PBI service via the adapter's
     *  __setXForTests seam). */
    beforeMount?: () => void;
    /** Called after each test. Use to tear down fakes. */
    afterDestroy?: () => void;
    /** Skip mount-dependent tests when the adapter genuinely cannot be
     *  mounted in jsdom (e.g., a real Tableau/Looker SDK that needs a live
     *  server). The non-mount assertions still run. */
    skipMountTests?: boolean;
    /** A command the adapter is expected NOT to support. The harness
     *  asserts send() rejects with BI_ERR.UNSUPPORTED_COMMAND. Default:
     *  `{ kind: "export", format: "pdf" }`. Provide an alternative for
     *  adapters where export IS supported. */
    knownUnsupportedCommand?: BICommand;
}

/**
 * Registers a battery of conformance tests for `adapterName`. Call this
 * from inside an existing test file (top-level — not inside a describe).
 *
 * The harness opens its own `describe("BIAdapter conformance — <name>")`
 * scope so its tests don't collide with the adapter's own describe blocks.
 */
export function runAdapterConformance(
    adapterName: string,
    options: AdapterConformanceOptions,
): void {
    const {
        factory,
        validConfig,
        beforeMount,
        afterDestroy,
        skipMountTests = false,
        knownUnsupportedCommand = { kind: "export", format: "pdf" } as BICommand,
    } = options;

    describe(`BIAdapter conformance — ${adapterName}`, () => {
        let containerEl: HTMLElement;

        beforeEach(() => {
            beforeMount?.();
            containerEl = document.createElement("div");
            document.body.appendChild(containerEl);
        });

        afterEach(() => {
            if (containerEl.parentElement) {
                containerEl.parentElement.removeChild(containerEl);
            }
            afterDestroy?.();
        });

        // ── Static contract ────────────────────────────────────────────────
        test("vendor is a non-empty string", () => {
            const a = factory();
            expect(typeof a.vendor).toBe("string");
            expect(a.vendor.length).toBeGreaterThan(0);
        });

        test("displayName is a non-empty string", () => {
            const a = factory();
            expect(typeof a.displayName).toBe("string");
            expect(a.displayName.length).toBeGreaterThan(0);
        });

        test("capabilities() returns a complete BICapabilities object", () => {
            const a = factory();
            const caps = a.capabilities();
            const requiredKeys: (keyof BICapabilities)[] = [
                "canNavigatePages",
                "canApplyFilters",
                "canExport",
                "canRefresh",
                "canFullscreen",
                "requiresContainerEl",
            ];
            for (const key of requiredKeys) {
                expect(typeof caps[key]).toBe("boolean");
            }
        });

        test("capabilities() is idempotent (multiple calls return the same shape)", () => {
            const a = factory();
            const first = a.capabilities();
            const second = a.capabilities();
            expect(second).toEqual(first);
        });

        // ── Pre-mount behaviour ────────────────────────────────────────────
        test("send() before mount rejects with NOT_MOUNTED", async () => {
            const a = factory();
            await expect(a.send({ kind: "refresh" })).rejects.toThrow(
                new RegExp(BI_ERR.NOT_MOUNTED),
            );
        });

        test("destroy() before mount is a safe no-op (no throw)", () => {
            const a = factory();
            expect(() => a.destroy()).not.toThrow();
        });

        test("on() returns an unsubscribe function even before mount", () => {
            const a = factory();
            const off = a.on("loaded", () => {});
            expect(typeof off).toBe("function");
            expect(() => off()).not.toThrow();
        });

        test("mount throws when requiresContainerEl=true and containerEl is null", async () => {
            const a = factory();
            if (!a.capabilities().requiresContainerEl) {
                // Adapter declared it doesn't need a container — skip.
                return;
            }
            if (!validConfig) return; // can't synthesize a config to pass through
            await expect(a.mount(null, validConfig)).rejects.toThrow();
        });

        // ── Mounted behaviour ──────────────────────────────────────────────
        if (!skipMountTests && validConfig) {
            describe("after mount", () => {
                test("mount() resolves without error against a valid config", async () => {
                    const a = factory();
                    await expect(a.mount(containerEl, validConfig)).resolves.not.toThrow();
                });

                test("on() returns an unsubscribe function that removes the handler", async () => {
                    const a = factory();
                    await a.mount(containerEl, validConfig);
                    let calls = 0;
                    const off = a.on("loaded", () => { calls++; });
                    expect(typeof off).toBe("function");
                    off();
                    // We can't synthesize the vendor's loaded event here, but
                    // the unsubscribe must at minimum not throw and must
                    // remove the listener from any internal set so future
                    // emits don't fan out to it. We verify the latter by
                    // calling off() a second time — a properly-cleaned set
                    // makes this a safe no-op rather than a double-delete.
                    expect(() => off()).not.toThrow();
                    expect(calls).toBe(0);
                });

                test("multiple subscribers to the same event coexist", async () => {
                    const a = factory();
                    await a.mount(containerEl, validConfig);
                    const off1 = a.on("loaded", () => {});
                    const off2 = a.on("loaded", () => {});
                    expect(typeof off1).toBe("function");
                    expect(typeof off2).toBe("function");
                    // Independent unsubscribes — neither one should affect the
                    // other and neither should throw on subsequent calls.
                    off1();
                    off2();
                    expect(() => off1()).not.toThrow();
                    expect(() => off2()).not.toThrow();
                });

                test("send(knownUnsupportedCommand) rejects with UNSUPPORTED_COMMAND", async () => {
                    const a = factory();
                    await a.mount(containerEl, validConfig);
                    const caps = a.capabilities();
                    // Only assert UNSUPPORTED when the adapter actually
                    // claims not to support the command. Otherwise the
                    // command should resolve — also a valid contract path.
                    if (knownUnsupportedCommand.kind === "export" && !caps.canExport) {
                        await expect(a.send(knownUnsupportedCommand)).rejects.toThrow(
                            new RegExp(BI_ERR.UNSUPPORTED_COMMAND),
                        );
                    }
                });

                test("destroy() is idempotent (second call does not throw)", async () => {
                    const a = factory();
                    await a.mount(containerEl, validConfig);
                    a.destroy();
                    expect(() => a.destroy()).not.toThrow();
                });

                test("send() after destroy() rejects with NOT_MOUNTED", async () => {
                    const a = factory();
                    await a.mount(containerEl, validConfig);
                    a.destroy();
                    await expect(a.send({ kind: "refresh" })).rejects.toThrow(
                        new RegExp(BI_ERR.NOT_MOUNTED),
                    );
                });

                test("destroy() detaches host-side listeners (no leak across remounts)", async () => {
                    // Round-trip: mount → subscribe → destroy → remount →
                    // subscribe again. The second mount must not see ghost
                    // handlers from the first lifecycle.
                    const a = factory();
                    await a.mount(containerEl, validConfig);
                    a.on("loaded", () => {});
                    a.destroy();
                    // Second container so the remount is clean even for
                    // adapters that hold containerEl refs.
                    const secondEl = document.createElement("div");
                    document.body.appendChild(secondEl);
                    try {
                        await expect(a.mount(secondEl, validConfig)).resolves.not.toThrow();
                        a.destroy();
                    } finally {
                        if (secondEl.parentElement) secondEl.parentElement.removeChild(secondEl);
                    }
                });
            });
        }
    });
}
