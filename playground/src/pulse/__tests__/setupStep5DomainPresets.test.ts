import { describe, expect, it } from "vitest";
import { CUSTOM_SECTION_PRESETS, METRIC_DIRECTION_PRESETS } from "../insightsPresetLibrary";
import { DOMAIN_PRESETS, isDomainRelated } from "../setupStep5";

describe("Setup Step 5 domain-driven preset relationships", () => {
    it("includes every custom-section and metric-direction preset domain", () => {
        const visibleDomains = new Set(DOMAIN_PRESETS);
        for (const preset of CUSTOM_SECTION_PRESETS) {
            expect(visibleDomains.has(preset.domain)).toBe(true);
        }
        for (const preset of METRIC_DIRECTION_PRESETS) {
            expect(visibleDomains.has(preset.domain)).toBe(true);
        }
    });

    it("keeps domain options case-insensitively unique", () => {
        const keys = DOMAIN_PRESETS.map(domain => domain.toLowerCase());
        expect(new Set(keys).size).toBe(DOMAIN_PRESETS.length);
    });

    it("matches presets by meaningful domain tokens without generic false positives", () => {
        expect(isDomainRelated("Supply Chain Operations", "CPG / Supply Chain")).toBe(true);
        expect(isDomainRelated("Financial Performance", "Financial Analysis")).toBe(true);
        expect(isDomainRelated("Strategic Analysis", "Financial Analysis")).toBe(false);
        expect(isDomainRelated("Marketing Analytics", "Hospital Operations")).toBe(false);
    });
});
