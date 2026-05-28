// playground/src/settings/components/SectionMarkdownEditor.tsx
//
// Author-friendly markdown editor for AI Insights sections. Authors write
// `## <Section>` + the per-section AI prompt; each heading becomes a card on
// the AI Insights screen. Writes the canonical `insightsCustomSections` JSON
// the runtime already consumes (preserving any SQL/config-item sections).
//
// 2026-05-28 — Slice 2 of the activator-keyword work. The raw "Custom
// sections JSON" textarea remains as an advanced view; this is the friendly
// front door the user asked for ("define the sections as well as the prompt").

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    parseMarkdownSections,
    customSectionsJsonToMarkdown,
    countSqlSections,
    mergeMarkdownIntoCustomSectionsJson,
} from "../../pulse/sectionMarkdown";

export interface SectionMarkdownEditorProps {
    /** Canonical insightsCustomSections JSON string. */
    value: string;
    /** Called with the new JSON when the author edits the markdown. */
    onChange: (nextJson: string) => void;
}

export function SectionMarkdownEditor({ value, onChange }: SectionMarkdownEditorProps): React.ReactElement {
    // Track the JSON we last emitted so an EXTERNAL change to `value` (e.g. the
    // preset-library picker writing sections) re-seeds the markdown draft,
    // while our own keystrokes don't fight the cursor.
    const lastEmittedRef = useRef<string>("");
    const [draft, setDraft] = useState<string>(() => customSectionsJsonToMarkdown(value));

    useEffect(() => {
        if (value !== lastEmittedRef.current) {
            setDraft(customSectionsJsonToMarkdown(value));
        }
    }, [value]);

    const parsed = useMemo(() => parseMarkdownSections(draft), [draft]);
    const sqlCount = useMemo(() => countSqlSections(value), [value]);

    const handleChange = (md: string) => {
        setDraft(md);
        const json = mergeMarkdownIntoCustomSectionsJson(md, value);
        lastEmittedRef.current = json;
        onChange(json);
    };

    return (
        <div style={{ display: "grid", gap: 6 }} data-testid="pp-section-md-editor">
            <textarea
                value={draft}
                onChange={e => handleChange(e.target.value)}
                rows={9}
                placeholder={"## Executive Brief\nSummarize revenue and margin vs prior year in two sentences.\n\n## Category Mix\nRank category contribution by sales and margin."}
                aria-label="AI Insights sections (markdown)"
                data-testid="pp-section-md-textarea"
                style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--pp-border, rgba(0,0,0,0.18))",
                    fontFamily: "var(--pp-mono, ui-monospace, SFMono-Regular, Consolas, monospace)",
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    resize: "vertical",
                    minHeight: 120,
                }}
            />
            <div
                style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11.5 }}
                data-testid="pp-section-md-status"
            >
                {parsed.length > 0 ? (
                    <span style={{ color: "var(--pp-accent, #0078d4)", fontWeight: 600 }}>
                        ✓ {parsed.length} AI section{parsed.length === 1 ? "" : "s"}
                    </span>
                ) : (
                    <span style={{ color: "var(--pp-text-muted, #64748b)", fontStyle: "italic" }}>
                        No sections yet — add a `## Section` heading to create the first card.
                    </span>
                )}
                {parsed.length > 0 && (
                    <span style={{ color: "var(--pp-text-muted, #64748b)" }}>
                        {parsed.map(s => s.name).join(" · ")}
                    </span>
                )}
                {sqlCount > 0 && (
                    <span
                        title="SQL / config-item sections are authored separately and preserved untouched when you edit here."
                        style={{ color: "var(--pp-text-muted, #64748b)", borderLeft: "1px solid var(--pp-border-subtle, #e4e9ef)", paddingLeft: 8 }}
                    >
                        + {sqlCount} SQL section{sqlCount === 1 ? "" : "s"} preserved
                    </span>
                )}
            </div>
        </div>
    );
}
