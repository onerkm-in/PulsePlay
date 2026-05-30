// playground/src/settings/primitives/__tests__/SettingsCombobox.test.tsx

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SettingsCombobox } from "../SettingsCombobox";

afterEach(cleanup);

const FRUITS = [
    { value: "apple",  label: "Apple",  group: "Common" },
    { value: "banana", label: "Banana", group: "Common" },
    { value: "cherry", label: "Cherry", group: "Common" },
    { value: "durian", label: "Durian", group: "Exotic", description: "Spiky + smelly" },
    { value: "kiwi",   label: "Kiwi",   group: "Exotic" },
] as const;

describe("SettingsCombobox", () => {
    it("renders trigger with placeholder when no value selected", () => {
        render(
            <SettingsCombobox
                value=""
                onChange={() => {}}
                options={FRUITS}
                ariaLabel="Pick a fruit"
                placeholder="Choose…"
            />,
        );
        expect(screen.getByText("Choose…")).toBeTruthy();
    });

    it("shows the selected option label on the trigger", () => {
        render(
            <SettingsCombobox
                value="banana"
                onChange={() => {}}
                options={FRUITS}
                ariaLabel="Pick a fruit"
            />,
        );
        expect(screen.getByText("Banana")).toBeTruthy();
    });

    it("clicking trigger opens the popover with all options", () => {
        render(
            <SettingsCombobox
                value=""
                onChange={() => {}}
                options={FRUITS}
                ariaLabel="Pick a fruit"
            />,
        );
        fireEvent.click(screen.getByTestId("pp-combobox-trigger"));
        expect(screen.getByTestId("pp-combobox-popover")).toBeTruthy();
        for (const f of FRUITS) {
            expect(screen.getByTestId(`pp-combobox-option-${f.value}`)).toBeTruthy();
        }
    });

    it("renders group headers in the popover", () => {
        render(
            <SettingsCombobox
                value=""
                onChange={() => {}}
                options={FRUITS}
                ariaLabel="Pick a fruit"
            />,
        );
        fireEvent.click(screen.getByTestId("pp-combobox-trigger"));
        expect(screen.getByText("Common")).toBeTruthy();
        expect(screen.getByText("Exotic")).toBeTruthy();
    });

    it("clicking an option fires onChange with its value", () => {
        const onChange = vi.fn();
        render(
            <SettingsCombobox
                value=""
                onChange={onChange}
                options={FRUITS}
                ariaLabel="Pick a fruit"
            />,
        );
        fireEvent.click(screen.getByTestId("pp-combobox-trigger"));
        fireEvent.click(screen.getByTestId("pp-combobox-option-cherry"));
        expect(onChange).toHaveBeenCalledWith("cherry");
    });

    it("search input filters options by label (case-insensitive)", () => {
        render(
            <SettingsCombobox
                value=""
                onChange={() => {}}
                options={FRUITS}
                ariaLabel="Pick a fruit"
            />,
        );
        fireEvent.click(screen.getByTestId("pp-combobox-trigger"));
        const search = screen.getByTestId("pp-combobox-search");
        fireEvent.change(search, { target: { value: "RI" } });
        // "Cherry" + "Durian" + "Kiwi" all contain "ri" or "rI" — wait,
        // "Cherry"=cherry, has "ri"? no. "Durian" has "ri". "Kiwi" no.
        // Let me check: cherry → "cherry" → no "ri" substring. wait yes!
        // cherry = c-h-e-r-r-y → has "rr" not "ri". "Durian" = d-u-r-i-a-n → yes "ri".
        // So only Durian matches.
        expect(screen.queryByTestId("pp-combobox-option-durian")).toBeTruthy();
        expect(screen.queryByTestId("pp-combobox-option-cherry")).toBeNull();
    });

    it("renders empty state when search yields no matches", () => {
        render(
            <SettingsCombobox
                value=""
                onChange={() => {}}
                options={FRUITS}
                ariaLabel="Pick a fruit"
            />,
        );
        fireEvent.click(screen.getByTestId("pp-combobox-trigger"));
        const search = screen.getByTestId("pp-combobox-search");
        fireEvent.change(search, { target: { value: "zzz" } });
        expect(screen.getByText(/No matches for "zzz"/)).toBeTruthy();
    });

    it("renders option descriptions when provided", () => {
        render(
            <SettingsCombobox
                value=""
                onChange={() => {}}
                options={FRUITS}
                ariaLabel="Pick a fruit"
            />,
        );
        fireEvent.click(screen.getByTestId("pp-combobox-trigger"));
        expect(screen.getByText("Spiky + smelly")).toBeTruthy();
    });

    it("disabled state prevents opening the popover", () => {
        render(
            <SettingsCombobox
                value=""
                onChange={() => {}}
                options={FRUITS}
                ariaLabel="Pick a fruit"
                disabled
            />,
        );
        fireEvent.click(screen.getByTestId("pp-combobox-trigger"));
        expect(screen.queryByTestId("pp-combobox-popover")).toBeNull();
    });

    it("ariaLabel propagates to the listbox", () => {
        render(
            <SettingsCombobox
                value=""
                onChange={() => {}}
                options={FRUITS}
                ariaLabel="Pick a fruit"
            />,
        );
        fireEvent.click(screen.getByTestId("pp-combobox-trigger"));
        const listbox = screen.getByRole("listbox");
        expect(listbox.getAttribute("aria-label")).toBe("Pick a fruit");
    });
});
