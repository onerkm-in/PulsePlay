// playground/src/components/__tests__/AssistantEmptyState.test.tsx
//
// Locks the configured vs unconfigured render + the two CTAs.

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AssistantEmptyState } from "../AssistantEmptyState";

afterEach(cleanup);

describe("AssistantEmptyState", () => {
    it("renders the connect-AI CTAs when not configured", () => {
        render(<AssistantEmptyState isConfigured={false} />);
        expect(screen.getByTestId("pp-assistant-empty")).toBeTruthy();
        expect(screen.getByTestId("pp-assistant-empty-connect")).toBeTruthy();
        expect(screen.getByTestId("pp-assistant-empty-browse-packs")).toBeTruthy();
        expect(screen.getByText(/Connect an AI assistant/i)).toBeTruthy();
    });

    it("renders the configured lede (no CTAs) when AI is wired", () => {
        render(<AssistantEmptyState isConfigured={true} />);
        expect(screen.getByTestId("pp-assistant-empty")).toBeTruthy();
        expect(screen.queryByTestId("pp-assistant-empty-connect")).toBeNull();
        expect(screen.queryByTestId("pp-assistant-empty-browse-packs")).toBeNull();
        expect(screen.getByText(/Ask anything about your data/i)).toBeTruthy();
    });

    it("fires the supplied connect handler on click", () => {
        const onConnectClick = vi.fn();
        render(<AssistantEmptyState isConfigured={false} onConnectClick={onConnectClick} />);
        fireEvent.click(screen.getByTestId("pp-assistant-empty-connect"));
        expect(onConnectClick).toHaveBeenCalledTimes(1);
    });

    it("fires the supplied browse-packs handler on click", () => {
        const onBrowsePacksClick = vi.fn();
        render(<AssistantEmptyState isConfigured={false} onBrowsePacksClick={onBrowsePacksClick} />);
        fireEvent.click(screen.getByTestId("pp-assistant-empty-browse-packs"));
        expect(onBrowsePacksClick).toHaveBeenCalledTimes(1);
    });
});
