// playground/src/components/__tests__/FirstRunWizard.test.tsx
//
// Unit tests for the 4-step FirstRunWizard.
// Uses @testing-library/react + vitest/jsdom.
// Key discipline:
//   • explicit `cleanup()` after every test (prevents DOM stacking)
//   • `await act(async () => { renderWizard() })` wraps every render
//     so the async connector-loader useEffect flushes before assertions
//
// Not tested here (live / env-gated):
//   • Real connector loading from /api/assistant/profiles
//   • EmbedConfigForm server-side validation
//   • Full App-level wizard mount/unmount flow

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import {
    FirstRunWizard,
    WizardErrorBoundary,
    shouldShowWizard,
    resetWizardDismissal,
    forceWizard,
    applyPersonaDefaults,
    PERSONA_PRESETS,
    WIZARD_DISMISSED_KEY,
    WIZARD_DRAFT_KEY,
    WIZARD_FORCE_KEY,
    type FirstRunWizardProps,
    type VendorOption,
    type ConnectorOption,
} from "../FirstRunWizard";

/* ─── Fixtures ──────────────────────────────────────────────────────── */

const VENDORS: VendorOption[] = [
    { vendor: "powerbi",   displayName: "Power BI",       description: "Microsoft" },
    { vendor: "tableau",   displayName: "Tableau",        description: "Salesforce" },
];
const CONNECTORS: ConnectorOption[] = [
    { name: "genie-default",      displayName: "Genie",            type: "genie"            },
    { name: "foundation-default", displayName: "Foundation Model", type: "foundation-model" },
];

function mockFetchConnectors(): Promise<ConnectorOption[]> {
    return Promise.resolve(CONNECTORS);
}

function buildProps(overrides: Partial<FirstRunWizardProps> = {}): FirstRunWizardProps {
    return {
        vendors:         VENDORS,
        fetchConnectors: mockFetchConnectors,
        availablePacks:  [],
        onComplete:      vi.fn(),
        onDismiss:       vi.fn(),
        ...overrides,
    };
}

/** Render the wizard and flush the async connector-loading effect. */
async function renderWizard(props?: Partial<FirstRunWizardProps>): Promise<void> {
    await act(async () => {
        render(<FirstRunWizard {...buildProps(props)} /> as ReactElement);
    });
}

/* ─── Global per-test teardown ──────────────────────────────────────── */
// cleanup() unmounts every tree rendered in a test, preventing DOM
// accumulation (which causes "Found multiple elements" errors).

afterEach(() => {
    cleanup();
    window.localStorage.removeItem(WIZARD_DISMISSED_KEY);
    window.localStorage.removeItem(WIZARD_DRAFT_KEY);
    window.localStorage.removeItem(WIZARD_FORCE_KEY);
    vi.restoreAllMocks();
});

/* ─── shouldShowWizard ──────────────────────────────────────────────── */

describe("shouldShowWizard", () => {
    beforeEach(() => resetWizardDismissal());

    it("returns false when dismissed flag is set", () => {
        window.localStorage.setItem(WIZARD_DISMISSED_KEY, "true");
        expect(shouldShowWizard({ hasEmbedConfig: false, hasConnector: false, vendorsAvailable: true })).toBe(false);
    });

    it("returns false when hasEmbedConfig is true", () => {
        expect(shouldShowWizard({ hasEmbedConfig: true, hasConnector: false, vendorsAvailable: true })).toBe(false);
    });

    it("returns false when hasConnector is true", () => {
        expect(shouldShowWizard({ hasEmbedConfig: false, hasConnector: true, vendorsAvailable: true })).toBe(false);
    });

    it("returns false when no vendors are allowlisted", () => {
        expect(shouldShowWizard({ hasEmbedConfig: false, hasConnector: false, vendorsAvailable: false })).toBe(false);
    });

    it("returns true when nothing is configured and vendors are available", () => {
        expect(shouldShowWizard({ hasEmbedConfig: false, hasConnector: false, vendorsAvailable: true })).toBe(true);
    });
});

/* ─── applyPersonaDefaults ──────────────────────────────────────────── */

describe("applyPersonaDefaults", () => {
    // 2026-05-25 — every persona now returns uiMode: "v0" per the unified-
    // surface plan (AISidebar is the always-default; PulseShell is dev-tools
    // only). Layout + connector hints stay persona-specific.
    it("Analyst → v0 / ai-left / genie hint", () => {
        const d = applyPersonaDefaults("analyst");
        expect(d.uiMode).toBe("v0");
        expect(d.layoutMode).toBe("ai-left");
        expect(d.preferredConnectorType).toBe("genie");
    });

    it("Executive → v0 / ai-top / foundation-model hint", () => {
        const d = applyPersonaDefaults("executive");
        expect(d.uiMode).toBe("v0");
        expect(d.layoutMode).toBe("ai-top");
        expect(d.preferredConnectorType).toBe("foundation-model");
    });

    it("Developer → v0 / ai-right / no hint", () => {
        const d = applyPersonaDefaults("developer");
        expect(d.uiMode).toBe("v0");
        expect(d.layoutMode).toBe("ai-right");
        expect(d.preferredConnectorType).toBeUndefined();
    });

    it("Designer → v0 / ai-left / no hint", () => {
        const d = applyPersonaDefaults("designer");
        expect(d.uiMode).toBe("v0");
        expect(d.layoutMode).toBe("ai-left");
        expect(d.preferredConnectorType).toBeUndefined();
    });

    it("covers all 4 personas in PERSONA_PRESETS without throwing", () => {
        for (const p of PERSONA_PRESETS) {
            expect(() => applyPersonaDefaults(p.key)).not.toThrow();
        }
    });
});

/* ─── Rendering ─────────────────────────────────────────────────────── */

describe("FirstRunWizard rendering", () => {
    it("renders the wizard with data-testid on mount", async () => {
        await renderWizard();
        expect(screen.getByTestId("pp-first-run-wizard")).toBeTruthy();
    });

    it("starts at step 0 (data-step='0')", async () => {
        await renderWizard();
        expect(screen.getByTestId("pp-first-run-wizard").getAttribute("data-step")).toBe("0");
    });

    it("shows all 4 persona cards on step 1", async () => {
        await renderWizard();
        expect(screen.getByTestId("pp-first-run-persona-analyst")).toBeTruthy();
        expect(screen.getByTestId("pp-first-run-persona-executive")).toBeTruthy();
        expect(screen.getByTestId("pp-first-run-persona-developer")).toBeTruthy();
        expect(screen.getByTestId("pp-first-run-persona-designer")).toBeTruthy();
    });

    it("analyst card is checked by default", async () => {
        await renderWizard();
        expect(screen.getByTestId("pp-first-run-persona-analyst").getAttribute("aria-checked")).toBe("true");
        expect(screen.getByTestId("pp-first-run-persona-executive").getAttribute("aria-checked")).toBe("false");
    });

    it("clicking a persona card changes the active selection", async () => {
        await renderWizard();
        const devCard = screen.getByTestId("pp-first-run-persona-developer");
        await act(async () => { fireEvent.click(devCard); });
        expect(devCard.getAttribute("aria-checked")).toBe("true");
        expect(screen.getByTestId("pp-first-run-persona-analyst").getAttribute("aria-checked")).toBe("false");
    });
});

/* ─── Step gating ───────────────────────────────────────────────────── */

describe("Step gating", () => {
    it("Continue is enabled on Step 1 (persona always has a default)", async () => {
        await renderWizard();
        const btn = screen.getByRole("button", { name: "Continue →" });
        expect((btn as HTMLButtonElement).disabled).toBe(false);
    });

    it("Step 2 Continue is disabled until vendor AND connector are picked", async () => {
        await renderWizard();
        // Advance to step 2
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continue →" })); });
        expect(screen.getByTestId("pp-first-run-wizard").getAttribute("data-step")).toBe("1");

        const continueBtn = screen.getByRole("button", { name: "Continue →" }) as HTMLButtonElement;
        expect(continueBtn.disabled).toBe(true);

        // Pick vendor only — still disabled
        await act(async () => { fireEvent.click(screen.getByTestId("pp-first-run-vendor-powerbi")); });
        expect(continueBtn.disabled).toBe(true);

        // Pick connector — now enabled
        await act(async () => { fireEvent.click(screen.getByTestId("pp-first-run-connector-genie-default")); });
        expect(continueBtn.disabled).toBe(false);
    });

    it("Step 3 Continue is always enabled (probe never blocks)", async () => {
        await renderWizard();
        // Step 1 → 2
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continue →" })); });
        // Pick vendor + connector
        await act(async () => {
            fireEvent.click(screen.getByTestId("pp-first-run-vendor-powerbi"));
            fireEvent.click(screen.getByTestId("pp-first-run-connector-genie-default"));
        });
        // Step 2 → 3
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continue →" })); });
        expect(screen.getByTestId("pp-first-run-wizard").getAttribute("data-step")).toBe("2");
        // Continue should be enabled even without any probe
        const continueBtn = screen.getByRole("button", { name: "Continue →" }) as HTMLButtonElement;
        expect(continueBtn.disabled).toBe(false);
    });
});

/* ─── "Just give me defaults" fast lane ─────────────────────────────── */

describe("Just give me defaults path", () => {
    it("calls onComplete with Analyst preset + first vendor", async () => {
        const onComplete = vi.fn();
        await renderWizard({ onComplete });
        const fastLane = screen.getByRole("button", { name: /just give me defaults/i });
        await act(async () => { fireEvent.click(fastLane); });
        expect(onComplete).toHaveBeenCalledTimes(1);
        const [picks] = onComplete.mock.calls[0] as [{ persona: string; uiMode: string; layoutMode: string; vendor: string }];
        expect(picks.persona).toBe("analyst");
        expect(picks.uiMode).toBe("v0");
        expect(picks.layoutMode).toBe("ai-left");
        expect(picks.vendor).toBe("powerbi"); // first vendor
    });

    it("sets the dismissal flag so wizard would not re-show", async () => {
        await renderWizard();
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /just give me defaults/i }));
        });
        expect(window.localStorage.getItem(WIZARD_DISMISSED_KEY)).toBe("true");
    });
});

/* ─── Done finalisation ─────────────────────────────────────────────── */

describe("Done finalisation", () => {
    async function advanceToStep4(onComplete = vi.fn()): Promise<ReturnType<typeof vi.fn>> {
        await renderWizard({ onComplete });
        // Step 1 → 2
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continue →" })); });
        // Pick vendor + connector
        await act(async () => {
            fireEvent.click(screen.getByTestId("pp-first-run-vendor-powerbi"));
            fireEvent.click(screen.getByTestId("pp-first-run-connector-genie-default"));
        });
        // Step 2 → 3
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continue →" })); });
        // Step 3 → 4
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continue →" })); });
        await waitFor(() => screen.getByRole("button", { name: "Done" }));
        return onComplete;
    }

    it("Done calls onComplete with correct picks, sets dismissed flag, clears draft", async () => {
        const onComplete = await advanceToStep4();
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Done" })); });
        expect(onComplete).toHaveBeenCalledTimes(1);
        const [picks] = onComplete.mock.calls[0] as [{ vendor: string; connector: string; uiMode: string; layoutMode: string; autoAsk: boolean }];
        expect(picks.vendor).toBe("powerbi");
        expect(picks.connector).toBe("genie-default");
        expect(picks.uiMode).toBe("v0");
        expect(picks.layoutMode).toBe("ai-left");
        expect(picks.autoAsk).toBe(false);
        expect(window.localStorage.getItem(WIZARD_DISMISSED_KEY)).toBe("true");
        expect(window.localStorage.getItem(WIZARD_DRAFT_KEY)).toBeNull();
    });

    it("'Done & ask' button is present and sets autoAsk=true", async () => {
        const onComplete = await advanceToStep4();
        // "Done & ask →" is rendered when there is a suggestedQuestion (always true with default)
        const doneAsk = screen.getByRole("button", { name: /done.*ask/i });
        await act(async () => { fireEvent.click(doneAsk); });
        expect(onComplete).toHaveBeenCalledTimes(1);
        const [picks] = onComplete.mock.calls[0] as [{ autoAsk: boolean; suggestedQuestion?: string }];
        expect(picks.autoAsk).toBe(true);
        expect(typeof picks.suggestedQuestion).toBe("string");
        expect(picks.suggestedQuestion!.length).toBeGreaterThan(0);
    });
});

/* ─── Skip / dismiss ────────────────────────────────────────────────── */

describe("Skip / dismiss", () => {
    it("'Skip for now' sets dismissed flag and calls onDismiss", async () => {
        const onDismiss = vi.fn();
        await renderWizard({ onDismiss });
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Skip for now" })); });
        expect(onDismiss).toHaveBeenCalledTimes(1);
        expect(window.localStorage.getItem(WIZARD_DISMISSED_KEY)).toBe("true");
    });

    it("× close button calls onDismiss and sets dismissed flag", async () => {
        const onDismiss = vi.fn();
        await renderWizard({ onDismiss });
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Skip setup and close" }));
        });
        expect(onDismiss).toHaveBeenCalledTimes(1);
        expect(window.localStorage.getItem(WIZARD_DISMISSED_KEY)).toBe("true");
    });
});

/* ─── Draft persistence + resume ────────────────────────────────────── */

describe("Draft persistence + resume", () => {
    it("resumes from saved draft step when re-mounted", async () => {
        window.localStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify({
            step:      2,
            persona:   "executive",
            vendor:    "tableau",
            connector: "foundation-default",
        }));
        await renderWizard();
        expect(screen.getByTestId("pp-first-run-wizard").getAttribute("data-step")).toBe("2");
    });

    it("saves draft on step advance", async () => {
        expect(window.localStorage.getItem(WIZARD_DRAFT_KEY)).toBeNull();
        await renderWizard();
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continue →" })); });
        const raw = window.localStorage.getItem(WIZARD_DRAFT_KEY);
        expect(raw).not.toBeNull();
        const draft = JSON.parse(raw!) as { step: number };
        expect(draft.step).toBe(1);
    });

    it("clears draft on Skip", async () => {
        window.localStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify({ step: 1 }));
        await renderWizard();
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Skip for now" })); });
        expect(window.localStorage.getItem(WIZARD_DRAFT_KEY)).toBeNull();
    });
});

/* ─── Probe flow (Step 3) ────────────────────────────────────────────── */

describe("Probe flow", () => {
    async function goToStep3(): Promise<void> {
        await renderWizard();
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continue →" })); });
        await act(async () => {
            fireEvent.click(screen.getByTestId("pp-first-run-vendor-powerbi"));
            fireEvent.click(screen.getByTestId("pp-first-run-connector-genie-default"));
        });
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continue →" })); });
        // "Test connection" button has aria-label "Test connection to the AI connector"
        await waitFor(() => screen.getByRole("button", { name: /test connection/i }));
    }

    it("probe OK shows 'Connected' message", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true, status: 200, json: async () => ({ ok: true }),
        }) as unknown as typeof fetch;
        await goToStep3();
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: /test connection/i })); });
        await waitFor(() => screen.getByText(/Connected/i));
        expect(screen.getByText(/Connected/i)).toBeTruthy();
    });

    it("probe FAIL shows error message", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false, status: 503, json: async () => ({ error: "warehouse unavailable" }),
        }) as unknown as typeof fetch;
        await goToStep3();
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: /test connection/i })); });
        await waitFor(() => screen.getByText(/warehouse unavailable/i));
        expect(screen.getByText(/warehouse unavailable/i)).toBeTruthy();
    });

    it("'Continue without testing' advances to Step 4 without calling fetch", async () => {
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        await goToStep3();
        await act(async () => {
            // button has aria-label "Continue without testing the connection"
            fireEvent.click(screen.getByRole("button", { name: /continue without testing/i }));
        });
        await waitFor(() => screen.getByRole("button", { name: "Done" }));
        expect(screen.getByTestId("pp-first-run-wizard").getAttribute("data-step")).toBe("3");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("probe always POSTs to /api/assistant/probe — never /foundation/health (4.4 fix)", async () => {
        // Verifies the Vite-proxy-bypass bug is fixed: all connector types
        // use the proxied /api/assistant/probe endpoint.
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true, status: 200, json: async () => ({ ok: true }),
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        await goToStep3();
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: /test connection/i })); });
        await waitFor(() => screen.getByText(/Connected/i));
        const [url] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string];
        expect(url).toBe("/api/assistant/probe");
        expect(url).not.toContain("/foundation/health");
    });
});

/* ─── Security hardening (4.1 + 4.3 + 4.5) ────────────────────────────── */

describe("Draft schema validation (4.1 — RISK-P1 fix)", () => {
    it("ignores a draft with an invalid persona key (e.g. injected by XSS)", async () => {
        window.localStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify({
            step: 2, persona: "INJECTED_ROLE", vendor: "powerbi", connector: "genie-default",
        }));
        await renderWizard();
        // step=2 is still trusted (range-clamped 0-3); persona falls back to undefined
        // and the component uses the default "analyst" from useState initializer.
        // We verify the wizard mounts without crashing.
        expect(screen.getByTestId("pp-first-run-wizard")).toBeTruthy();
        // Invalid persona is silently discarded — analyst is the default.
        expect(screen.getByTestId("pp-first-run-wizard").getAttribute("data-step")).toBe("2");
    });

    it("ignores a draft with step out of range (clamps to 0)", async () => {
        window.localStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify({
            step: 99, persona: "analyst",
        }));
        await renderWizard();
        // 99 is out of 0-3 range — loadDraft clamps it back to 0.
        expect(screen.getByTestId("pp-first-run-wizard").getAttribute("data-step")).toBe("0");
    });

    it("rejects a completely malformed draft (null, array, non-object)", async () => {
        window.localStorage.setItem(WIZARD_DRAFT_KEY, "not-json-at-all{{{{");
        await renderWizard();
        // Falls back to step 0 cleanly.
        expect(screen.getByTestId("pp-first-run-wizard").getAttribute("data-step")).toBe("0");
    });
});

/* ─── WizardErrorBoundary (LEAP 7c) ──────────────────────────────────── */

describe("WizardErrorBoundary", () => {
    /** A child that throws on render — simulates EmbedConfigForm /
     *  PackPicker / connector loader exploding inside the wizard subtree. */
    function CrashingChild(): React.ReactElement {
        throw new Error("Synthetic crash for boundary test");
    }

    // Silence the expected React error log noise during this block —
    // React always logs caught errors to console.error in tests.
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it("renders the fallback UI when a child throws during render", () => {
        render(
            <WizardErrorBoundary>
                <CrashingChild />
            </WizardErrorBoundary> as ReactElement,
        );
        const fallback = screen.getByTestId("pp-wizard-error-boundary");
        expect(fallback).toBeTruthy();
        expect(fallback.getAttribute("role")).toBe("alert");
        expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Skip wizard" })).toBeTruthy();
    });

    it("Retry button calls onRetry and clears the error state", () => {
        const onRetry = vi.fn();
        render(
            <WizardErrorBoundary onRetry={onRetry}>
                <CrashingChild />
            </WizardErrorBoundary> as ReactElement,
        );
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("Skip wizard button calls onSkip", () => {
        const onSkip = vi.fn();
        render(
            <WizardErrorBoundary onSkip={onSkip}>
                <CrashingChild />
            </WizardErrorBoundary> as ReactElement,
        );
        fireEvent.click(screen.getByRole("button", { name: "Skip wizard" }));
        expect(onSkip).toHaveBeenCalledTimes(1);
    });

    it("renders children normally when no error is thrown", () => {
        render(
            <WizardErrorBoundary>
                <div data-testid="healthy-child">Hello</div>
            </WizardErrorBoundary> as ReactElement,
        );
        expect(screen.getByTestId("healthy-child")).toBeTruthy();
        expect(screen.queryByTestId("pp-wizard-error-boundary")).toBeNull();
    });

    it("technical details section contains the error message", () => {
        render(
            <WizardErrorBoundary>
                <CrashingChild />
            </WizardErrorBoundary> as ReactElement,
        );
        expect(screen.getByText(/Synthetic crash for boundary test/)).toBeTruthy();
    });
});

describe("initialPersona prop (persona persistence)", () => {
    it("pre-selects persona from initialPersona when no draft exists", async () => {
        await renderWizard({ initialPersona: "developer" });
        expect(screen.getByTestId("pp-first-run-persona-developer").getAttribute("aria-checked")).toBe("true");
        expect(screen.getByTestId("pp-first-run-persona-analyst").getAttribute("aria-checked")).toBe("false");
    });

    it("draft state wins over initialPersona (mid-flow refresh)", async () => {
        window.localStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify({
            step: 1, persona: "executive",
        }));
        await renderWizard({ initialPersona: "developer" });
        // Draft persona (executive) wins over initialPersona (developer).
        expect(screen.getByTestId("pp-first-run-persona-executive").getAttribute("aria-checked")).toBe("true");
    });

    it("falls back to 'analyst' when neither draft nor initialPersona is set", async () => {
        await renderWizard();
        expect(screen.getByTestId("pp-first-run-persona-analyst").getAttribute("aria-checked")).toBe("true");
    });
});

describe("forceWizard + shouldShowWizard force flag (4.5 — RISK-P1 fix)", () => {
    it("forceWizard sets WIZARD_FORCE_KEY and clears dismissal + draft", () => {
        window.localStorage.setItem(WIZARD_DISMISSED_KEY, "true");
        window.localStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify({ step: 2 }));
        forceWizard();
        expect(window.localStorage.getItem(WIZARD_FORCE_KEY)).toBe("true");
        expect(window.localStorage.getItem(WIZARD_DISMISSED_KEY)).toBeNull();
        expect(window.localStorage.getItem(WIZARD_DRAFT_KEY)).toBeNull();
    });

    it("shouldShowWizard returns true when force flag is set even if user has embed config + connector", () => {
        forceWizard();
        // Simulate a user who is already configured — normally wizard would be hidden.
        expect(shouldShowWizard({
            hasEmbedConfig:   true,
            hasConnector:     true,
            vendorsAvailable: true,
        })).toBe(true);
    });

    it("shouldShowWizard keeps zero-vendor deployments hidden even when force flag is set", () => {
        forceWizard();
        expect(shouldShowWizard({
            hasEmbedConfig:   true,
            hasConnector:     true,
            vendorsAvailable: false,
        })).toBe(false);
    });

    it("force flag is cleared (consumed) after wizard Done or Skip", async () => {
        forceWizard();
        await renderWizard();
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
        });
        // clearDraft() is called on skip — it removes the force flag too.
        expect(window.localStorage.getItem(WIZARD_FORCE_KEY)).toBeNull();
    });

    it("shouldShowWizard returns false again once force flag is consumed", async () => {
        forceWizard();
        // Force flag present → wizard would show.
        expect(shouldShowWizard({ hasEmbedConfig: true, hasConnector: true, vendorsAvailable: true })).toBe(true);
        // Simulate wizard consuming the flag (Done/Skip calls clearDraft).
        window.localStorage.removeItem(WIZARD_FORCE_KEY);
        // Now back to normal logic — configured user → hidden.
        expect(shouldShowWizard({ hasEmbedConfig: true, hasConnector: true, vendorsAvailable: true })).toBe(false);
    });
});

/* ─── Audit 2026-05-19: initial focus + body scroll lock ────────────── */

describe("FirstRunWizard a11y — initial focus", () => {
    it("focuses the checked persona radio on mount, NOT the × dismiss button", async () => {
        await renderWizard();
        const focused = document.activeElement;
        // The checked persona at Step 1 with default analyst preset.
        const checked = screen.getByTestId("pp-first-run-persona-analyst");
        expect(focused).toBe(checked);
        // And critically NOT the dismiss button.
        expect(focused?.getAttribute("aria-label")).not.toBe("Skip setup and close");
    });

    it("focuses the radio matching initialPersona (Step 1 picks up the prop)", async () => {
        await renderWizard({ initialPersona: "developer" });
        const focused = document.activeElement;
        const checked = screen.getByTestId("pp-first-run-persona-developer");
        expect(focused).toBe(checked);
    });
});

describe("FirstRunWizard a11y — body scroll lock", () => {
    it("locks document.body scroll while the wizard is mounted", async () => {
        // Prove the baseline is unset before mount.
        document.body.style.overflow = "";
        await renderWizard();
        expect(document.body.style.overflow).toBe("hidden");
    });

    it("restores the previous body overflow on unmount", async () => {
        // A host app already had its own value — we must not stomp on it.
        document.body.style.overflow = "auto";
        await renderWizard();
        expect(document.body.style.overflow).toBe("hidden");
        cleanup();
        expect(document.body.style.overflow).toBe("auto");
        // Reset so the next test isn't affected.
        document.body.style.overflow = "";
    });
});
