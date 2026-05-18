import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { __insightsRenderForTest } from "../visual";

/**
 * Metric rules fixture for the "Arrow = movement, color = meaning" tests.
 * Both metrics declare a direction the renderer can read via getMetricTone:
 *   - Return Rate: lower is better → an UP movement is `bad` (red pill).
 *   - Profit Margin: higher is better → an UP movement is `good` (green pill).
 */
const SEMANTIC_RULES_JSON = JSON.stringify([
    { name: "Return Rate", higherIsBetter: false, aliases: ["return rate"] },
    { name: "Profit Margin", higherIsBetter: true, aliases: ["profit margin"] },
]);
const SEMANTIC_RULES = { structured: SEMANTIC_RULES_JSON };

describe("insights narrative polish", () => {
    it("keeps prose thresholds readable instead of rendering raw rule fragments as pills", () => {
        const node = __insightsRenderForTest.renderNarrative(
            "- Return rate is above the 🟡 caution threshold (>3 ▼ -7%), so margin resilience needs attention.",
            "RISKS",
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).not.toContain("gn-trend-pill");
        expect(html).not.toContain("🟡");
        expect(html).not.toContain("▼");
        expect(html).toContain("caution threshold");
        expect(html).not.toContain("&gt;3");
        expect(html).not.toContain("-7%");
    });

    it("renders labeled risk bullets as insight cards instead of a plain list", () => {
        const node = __insightsRenderForTest.renderNarrative(
            [
                "- **Returns pressure:** Return rate reached **6.2%**, above the caution line.",
                "- **Margin compression:** Profit margin fell to **12.7%**, reducing resilience.",
            ].join("\n"),
            "RISKS",
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-insight-card-grid");
        expect(html).toContain("gn-insight-card-label");
        expect(html).not.toContain("gn-narrative-list");
    });

    it("renders headline text as a summary card", () => {
        const node = __insightsRenderForTest.renderSectionBody(
            "Return rate is on watch at **6.2%**, while profit margin softened year over year.",
            "HEADLINE",
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-headline-card");
        expect(html).toContain("<strong>6.2%</strong>");
    });

    it("uses a physical up cue and amber status tone for lower-is-better KPI increases when status is watch", () => {
        const node = __insightsRenderForTest.renderKpiTiles(
            [
                "| KPI | Current | Prior | Δ pp | Status |",
                "| --- | --- | --- | --- | --- |",
                "| Return Rate | 5.9% | 5.5% | +0.4pp (▲ +6.3%) | 🟡 Watch |",
            ].join("\n"),
            "KPI SNAPSHOT",
            {
                metricDirectionsJson: JSON.stringify([
                    { name: "Return Rate", higherIsBetter: false, amberPct: 4, redPct: 8 },
                ]),
            },
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-kpi-tile--warn");
        expect(html).toContain("gn-kpi-tile-delta--warn");
        expect(html).toContain('data-delta-cue="up"');
        expect(html).toContain("▲");
        expect(html).not.toContain("▼");
        expect(html).toContain("+0.4pp");
        expect(html).toContain("▲ +6.3%");
        expect(html).not.toContain("gn-trend-pill--good");
        expect(html).toContain("KPI increased from the prior period");
    });

    it("uses a physical down cue and amber status tone for higher-is-better KPI decreases when status is watch", () => {
        const node = __insightsRenderForTest.renderKpiTiles(
            [
                "| KPI | Current | Prior | Δ pp | Status |",
                "| --- | --- | --- | --- | --- |",
                "| Profit Margin | 12.7% | 13.4% | -0.7pp | 🟡 Watch |",
            ].join("\n"),
            "KPI SNAPSHOT",
            {
                metricDirectionsJson: JSON.stringify([
                    { name: "Profit Margin", higherIsBetter: true, amberPct: 22, redPct: 12 },
                ]),
            },
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-kpi-tile--warn");
        expect(html).toContain("gn-kpi-tile-delta--warn");
        expect(html).toContain('data-delta-cue="down"');
        expect(html).toContain("▼");
        expect(html).toContain("-0.7pp");
        expect(html).toContain("KPI decreased from the prior period");
    });

    it("falls back to metric-direction tone when a KPI movement has no explicit status", () => {
        const node = __insightsRenderForTest.renderKpiTiles(
            [
                "| KPI | Current | Prior | Δ pp |",
                "| --- | --- | --- | --- |",
                "| Return Rate | 6.2% | 5.9% | +0.3pp |",
            ].join("\n"),
            "KPI SNAPSHOT",
            {
                metricDirectionsJson: JSON.stringify([
                    { name: "Return Rate", higherIsBetter: false, amberPct: 4, redPct: 8 },
                ]),
            },
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-kpi-tile-delta--bad");
        expect(html).toContain('data-delta-cue="up"');
        expect(html).toContain("▲");
        expect(html).toContain("+0.3pp");
        expect(html).toContain("higher is unfavorable");
    });
});

/*
 * Design lock (2026-05-18) — semantic cue consistency for inline trend
 * pills across the WHOLE insights surface (Trends / Risks / Recommended
 * Actions / arbitrary narrative). Mirrors the KPI-tile rule:
 *   - Arrow direction = numeric movement.
 *   - Color/tone class = business meaning (matched via metric rule).
 *
 * Pre-fix bug: pillColorClass returned `gn-trend-pill gn-trend-down` when
 * semanticTone was `bad`, which only changed the COLOR but left the class
 * name pretending the direction was down. The dirClass + toneClass split
 * fixes that — direction class stays honest, tone class carries color.
 */
describe("inline trend pill semantic cue consistency", () => {
    it("Return Rate increase: up arrow + bad tone (red) under matching rule", () => {
        const node = __insightsRenderForTest.renderNarrative(
            "Return rate up 0.4pp this period.",
            "TRENDS",
            SEMANTIC_RULES,
        );
        const html = renderToStaticMarkup(<>{node}</>);

        // Direction class stays UP (numeric movement is up).
        expect(html).toContain("gn-trend-up");
        // Tone class is BAD because the rule says higher is unfavorable.
        expect(html).toContain("gn-trend-tone-bad");
        // The OLD bug — switching to gn-trend-down to force red — must not regress.
        expect(html).not.toContain("gn-trend-down");
    });

    it("Profit Margin increase: up arrow + good tone (green) under matching rule", () => {
        const node = __insightsRenderForTest.renderNarrative(
            "Profit margin up 1.5pp this period.",
            "TRENDS",
            SEMANTIC_RULES,
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-trend-up");
        expect(html).toContain("gn-trend-tone-good");
        expect(html).not.toContain("gn-trend-down");
    });

    it("Profit Margin decrease: down arrow + bad tone (red) under matching rule", () => {
        const node = __insightsRenderForTest.renderNarrative(
            "Profit margin down 0.7pp this period.",
            "TRENDS",
            SEMANTIC_RULES,
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-trend-down");
        expect(html).toContain("gn-trend-tone-bad");
        expect(html).not.toContain("gn-trend-up");
    });

    it("Return Rate decrease: down arrow + good tone (green) under matching rule", () => {
        const node = __insightsRenderForTest.renderNarrative(
            "Return rate down 0.5pp this period.",
            "TRENDS",
            SEMANTIC_RULES,
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-trend-down");
        expect(html).toContain("gn-trend-tone-good");
    });

    it("Unmatched metric: physical direction only, no tone class", () => {
        // Pulse's INLINE_REGEX requires a word boundary after the number, so
        // we use a "pp" suffix (word chars → \b at the trailing space) rather
        // than "%" (a known Pulse regex blind spot — see follow-up note in
        // the test below for the % case).
        const node = __insightsRenderForTest.renderNarrative(
            "Marketing spend up 12pp this period.",
            "TRENDS",
            SEMANTIC_RULES,
        );
        const html = renderToStaticMarkup(<>{node}</>);

        // Direction class present.
        expect(html).toContain("gn-trend-up");
        // No tone class — falls back to physical direction color.
        expect(html).not.toContain("gn-trend-tone-good");
        expect(html).not.toContain("gn-trend-tone-bad");
        expect(html).not.toContain("gn-trend-tone-watch");
    });

    it("No metric rules supplied at all: physical direction only", () => {
        const node = __insightsRenderForTest.renderNarrative(
            "Return rate up 0.4pp this period.",
            "TRENDS",
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-trend-up");
        expect(html).not.toContain("gn-trend-tone-bad");
    });

    it("Fuzzy alias fallback: neutral tone (grey) when metric reads like a known delta phrase", () => {
        // "YoY" matches FUZZY_METRIC_ALIASES → tone-neutral fallback.
        const node = __insightsRenderForTest.renderNarrative(
            "YoY % up 3.2pp this period.",
            "TRENDS",
            SEMANTIC_RULES,
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-trend-tone-neutral");
    });

    it("Watch tone (amber) when a rule's amber threshold fires for a lower-is-better metric", () => {
        // Codex audit 2026-05-18: gn-trend-tone-watch was defined in CSS but
        // pillColorClass never emitted it. This pins the fix: a Return Rate
        // value in the amber band (between amberPct and redPct, lower-is-better)
        // should drive the watch tone even though physical movement is up.
        const watchRules = {
            structured: JSON.stringify([
                { name: "Return Rate", higherIsBetter: false, amberPct: 3, redPct: 6, aliases: ["return rate"] },
            ]),
        };
        const node = __insightsRenderForTest.renderNarrative(
            "Return rate up 4pp this period.",
            "TRENDS",
            watchRules,
        );
        const html = renderToStaticMarkup(<>{node}</>);

        // Direction class stays UP (numeric movement).
        expect(html).toContain("gn-trend-up");
        // Tone class is WATCH (amber) because 4 is between amberPct=3 and redPct=6.
        expect(html).toContain("gn-trend-tone-watch");
        expect(html).not.toContain("gn-trend-tone-good");
        expect(html).not.toContain("gn-trend-tone-bad");
    });

    // The emoji G8/G9 path inside inlineFormat is gated to KPI-style
    // sections (KPI SNAPSHOT / KPI / METRICS / SCORECARD / PERFORMANCE).
    // Other sections strip status emojis before the regex runs (see
    // `statusGlyphsBelongInThisSection` in visual.tsx). The tests below use
    // KPI SNAPSHOT so the emoji actually reaches the inline pill path.

    it("Emoji 🟢 inline path (KPI section): up direction + good tone (green)", () => {
        const node = __insightsRenderForTest.renderNarrative(
            "Sales 🟢 12.4pp this period.",
            "KPI SNAPSHOT",
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-trend-pill");
        expect(html).toContain("gn-trend-up");
        expect(html).toContain("gn-trend-tone-good");
    });

    it("Emoji 🔴 inline path (KPI section): down direction + bad tone (red)", () => {
        const node = __insightsRenderForTest.renderNarrative(
            "Sales 🔴 8.1pp this period.",
            "KPI SNAPSHOT",
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-trend-pill");
        expect(html).toContain("gn-trend-down");
        expect(html).toContain("gn-trend-tone-bad");
    });

    it("Emoji 🟡 inline path (KPI section): flat direction + watch tone (amber)", () => {
        // Codex audit 2026-05-18: 🟡 used to map to flat+grey, which was
        // the right fix at Wave 29 (prevent green-as-up) but now misses the
        // amber signal the model intended. Fix: keep flat direction (no
        // movement signal), add watch tone for amber color.
        const node = __insightsRenderForTest.renderNarrative(
            "Return rate 🟡 5.5pp this period.",
            "KPI SNAPSHOT",
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-trend-pill");
        expect(html).toContain("gn-trend-flat");
        expect(html).toContain("gn-trend-tone-watch");
        // Crucially: not grey/neutral anymore — the watch tone wins.
        expect(html).not.toContain("gn-trend-tone-neutral");
    });

    it("Non-KPI sections still strip status emojis (no emoji pill in TRENDS)", () => {
        // Documents the pre-existing gate so the next agent doesn't try
        // to "fix" what isn't broken. The TRENDS section intentionally
        // strips 🟢/🟡/🔴 before INLINE_REGEX runs.
        const node = __insightsRenderForTest.renderNarrative(
            "Return rate 🟡 5.5pp this period.",
            "TRENDS",
        );
        const html = renderToStaticMarkup(<>{node}</>);
        expect(html).not.toContain("🟡");
        expect(html).not.toContain("gn-trend-tone-watch");
    });

    it("Known follow-up: % suffix is a pre-existing INLINE_REGEX blind spot (no pill renders)", () => {
        // Pulse's regex requires a word boundary after the captured number.
        // "12%" ends with a non-word char, and natural English text never
        // follows it with a word char, so the \b never matches. This shows
        // up as missing pills in real prose like "spend up 12% this period".
        // Tracked as a Pulse follow-up; not a Step-Phase-A regression.
        const node = __insightsRenderForTest.renderNarrative(
            "Profit margin up 1.5% this period.",
            "TRENDS",
            SEMANTIC_RULES,
        );
        const html = renderToStaticMarkup(<>{node}</>);
        expect(html).not.toContain("gn-trend-pill");
    });

    it("Flat movement: no tone class even with a matching rule", () => {
        // Use a flat-glyph + number so the renderer takes the flat branch.
        const node = __insightsRenderForTest.renderNarrative(
            "Profit margin ▪ 0pp.",
            "TRENDS",
            SEMANTIC_RULES,
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-trend-flat");
        expect(html).not.toContain("gn-trend-tone-good");
        expect(html).not.toContain("gn-trend-tone-bad");
    });
});
