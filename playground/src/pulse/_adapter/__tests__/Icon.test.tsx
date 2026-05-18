// playground/src/pulse/_adapter/__tests__/Icon.test.tsx
//
// Smoke for the icon registry — proves named SVGs resolve and the union
// stays in sync with the PATHS map. Catches the "added IconName but
// forgot to add to PATHS" regression that would render an empty svg.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Icon, type IconName } from "../Icon";

const ALL_NAMES: ReadonlyArray<IconName> = [
    "copy", "check", "refresh", "stop", "code", "settings",
    "external-link", "download", "search", "filter", "x",
    "file-html", "printer", "maximize", "minimize", "restore",
    "float-window", "pin", "show-both", "more-vertical",
];

describe("Icon registry", () => {
    it("renders an <svg> for every IconName in the union", () => {
        for (const name of ALL_NAMES) {
            const html = renderToStaticMarkup(<Icon name={name} />);
            expect(html.startsWith("<svg")).toBe(true);
            // Non-empty content — guards against IconName added without PATHS entry.
            expect(html.length).toBeGreaterThan(20);
        }
    });

    it("more-vertical renders three circles (Phase C 2026-05-18 — overflow trigger)", () => {
        const html = renderToStaticMarkup(<Icon name="more-vertical" />);
        // Three vertical dots — assert all three circles are present.
        const circleCount = (html.match(/<circle/g) || []).length;
        expect(circleCount).toBe(3);
    });

    it("honors the size prop", () => {
        const html = renderToStaticMarkup(<Icon name="copy" size={24} />);
        expect(html).toContain('width="24"');
        expect(html).toContain('height="24"');
    });

    it("defaults size to 14px when not supplied", () => {
        const html = renderToStaticMarkup(<Icon name="copy" />);
        expect(html).toContain('width="14"');
        expect(html).toContain('height="14"');
    });
});
