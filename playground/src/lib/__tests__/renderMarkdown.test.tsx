// playground/src/lib/__tests__/renderMarkdown.test.tsx
//
// Coverage for the minimal Markdown renderer used by UnifiedAssistantSurface narrative.
// Pins both the supported subset (so removals don't slip through) and the
// security posture (no inline HTML passthrough, link protocols vetted).

import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { parseBlocks, renderMarkdown, renderInline } from "../renderMarkdown";

afterEach(() => cleanup());

describe("parseBlocks", () => {
    it("treats blank-line-separated text as paragraphs", () => {
        const blocks = parseBlocks("Hello world.\n\nSecond paragraph.");
        expect(blocks.length).toBe(2);
        expect(blocks[0]).toEqual({ kind: "p", text: "Hello world." });
        expect(blocks[1]).toEqual({ kind: "p", text: "Second paragraph." });
    });

    it("parses ATX headings h1..h6", () => {
        const blocks = parseBlocks("# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6");
        expect(blocks.map(b => b.kind)).toEqual(["h1", "h2", "h3", "h4", "h5", "h6"]);
        expect(blocks[0].text).toBe("H1");
    });

    it("collapses adjacent bullet lines into a ul block", () => {
        const blocks = parseBlocks("- one\n- two\n- three");
        expect(blocks.length).toBe(1);
        expect(blocks[0].kind).toBe("ul");
        expect(blocks[0].items).toEqual(["one", "two", "three"]);
    });

    it("collapses adjacent numbered lines into an ol block", () => {
        const blocks = parseBlocks("1. first\n2. second\n3. third");
        expect(blocks.length).toBe(1);
        expect(blocks[0].kind).toBe("ol");
        expect(blocks[0].items).toEqual(["first", "second", "third"]);
    });

    it("parses fenced code blocks with optional language", () => {
        const blocks = parseBlocks("```sql\nSELECT 1;\n```");
        expect(blocks.length).toBe(1);
        expect(blocks[0]).toEqual({ kind: "code", text: "SELECT 1;", lang: "sql" });
    });

    it("parses blockquotes", () => {
        const blocks = parseBlocks("> quoted line\n> second quoted");
        expect(blocks.length).toBe(1);
        expect(blocks[0]).toEqual({ kind: "quote", text: "quoted line\nsecond quoted" });
    });
});

describe("renderInline", () => {
    it("renders bold via ** **", () => {
        const tree = render(<>{renderInline("Hello **world**")}</>).container;
        expect(tree.textContent).toBe("Hello world");
        expect(tree.querySelector("strong")?.textContent).toBe("world");
    });

    it("renders italic via single * or _", () => {
        const a = render(<>{renderInline("a *b* c")}</>).container;
        expect(a.querySelector("em")?.textContent).toBe("b");
        cleanup();
        const b = render(<>{renderInline("a _b_ c")}</>).container;
        expect(b.querySelector("em")?.textContent).toBe("b");
    });

    it("renders inline code via backticks", () => {
        const tree = render(<>{renderInline("call `foo()` here")}</>).container;
        expect(tree.querySelector("code")?.textContent).toBe("foo()");
    });

    it("renders safe http(s) and mailto links with rel=noopener noreferrer", () => {
        const tree = render(<>{renderInline("see [docs](https://example.com)")}</>).container;
        const a = tree.querySelector("a") as HTMLAnchorElement | null;
        expect(a?.getAttribute("href")).toBe("https://example.com");
        expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
        expect(a?.getAttribute("target")).toBe("_blank");
    });

    it("renders javascript: links as PLAIN TEXT (no anchor element emitted)", () => {
        const tree = render(<>{renderInline("[click](javascript:alert(1))")}</>).container;
        expect(tree.querySelector("a")).toBeNull();
        expect(tree.textContent).toContain("[click](javascript:alert(1))");
    });

    it("renders data: links as plain text too", () => {
        const tree = render(<>{renderInline("[x](data:text/html,<script>alert(1)</script>)")}</>).container;
        expect(tree.querySelector("a")).toBeNull();
    });
});

describe("renderMarkdown (security + integration)", () => {
    it("does NOT honor raw <script> in input — renders as literal text", () => {
        const tree = render(<>{renderMarkdown("<script>alert(1)</script>")}</>).container;
        // No script tag — React escaped it. The text appears verbatim as
        // safe characters.
        expect(tree.querySelector("script")).toBeNull();
        expect(tree.textContent).toContain("<script>");
    });

    it("does NOT honor <img onerror=...> in input", () => {
        const tree = render(<>{renderMarkdown('<img src=x onerror="alert(1)">')}</>).container;
        expect(tree.querySelector("img")).toBeNull();
    });

    it("renders a realistic Genie-shape narrative cleanly", () => {
        const src = [
            "## Headline",
            "",
            "Sales are **up 12%** vs. last quarter.",
            "",
            "Key drivers:",
            "- Loyalty members converted at `28%`",
            "- New SKUs in the Midwest region",
            "",
            "```sql",
            "SELECT region, SUM(net_sales) FROM fact_sales GROUP BY 1",
            "```",
        ].join("\n");
        const tree = render(<>{renderMarkdown(src)}</>).container;
        expect(tree.querySelector("h2")?.textContent).toBe("Headline");
        expect(tree.querySelector("strong")?.textContent).toBe("up 12%");
        expect(tree.querySelectorAll("li").length).toBe(2);
        expect(tree.querySelector("pre code")?.textContent).toContain("SELECT region");
    });

    it("returns null for empty / missing input rather than crashing", () => {
        expect(renderMarkdown("")).toBeNull();
        expect(renderMarkdown(null)).toBeNull();
        expect(renderMarkdown(undefined)).toBeNull();
    });
});
