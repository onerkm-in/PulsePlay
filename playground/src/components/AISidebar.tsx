// playground/src/components/AISidebar.tsx
//
// The AI assistant — the WHOLE point of PulsePlay. Stays mounted as the
// user switches between BI vendors, accumulating event context (which
// page, which filters, which selection) so its prompts can reason about
// "the thing the user is currently looking at."
//
// v0 is a stub: a textarea + "Ask" button that POSTs to the proxy at
// /api/assistant/conversations/start (proxied via vite.config.ts).
// v1 will reuse the proven Insights pipeline shape from
// DwD_AI_Assistant_for_PBI (parallel stages, conversation reuse,
// validator framework, foundation-model fallback for reasoning).

import { useState } from "react";
import type { BIEvent } from "../biPanel/BIAdapter";

interface AISidebarProps {
    activeVendor: string;
    /** PulsePlay 2-axis: connector profile name from /assistant/profiles. */
    activeConnector: string;
    recentEvents: BIEvent[];
}

interface AnswerEntry {
    id: number;
    question: string;
    answer: string;
    error?: string;
    pending: boolean;
}

let nextEntryId = 1;

export function AISidebar(props: AISidebarProps) {
    const [question, setQuestion] = useState("");
    const [history, setHistory] = useState<AnswerEntry[]>([]);

    const ask = async () => {
        const q = question.trim();
        if (!q) return;
        const entry: AnswerEntry = { id: nextEntryId++, question: q, answer: "", pending: true };
        setHistory(prev => [...prev, entry]);
        setQuestion("");

        // Build a small context block from recent BI events so the LLM
        // knows what the user is looking at. Same idea as DwD's
        // contextBuilder, but sourced from BI vendor events.
        const eventLines = props.recentEvents
            .slice(-5)
            .map(e => `- ${e.type}${e.payload ? ": " + JSON.stringify(e.payload).slice(0, 120) : ""}`);
        const contextBlock = [
            `[BI Context]`,
            `- Active vendor: ${props.activeVendor}`,
            ...(eventLines.length > 0 ? ["- Recent events:", ...eventLines] : ["- No recent events captured."]),
        ].join("\n");

        try {
            // PulsePlay 2-axis: pass the active connector profile so the
            // proxy routes to the right backend (genie / openai / bedrock /
            // foundation / supervisor). Connector-agnostic on the wire.
            const res = await fetch("/api/assistant/conversations/start", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(props.activeConnector ? { "X-Assistant-Profile": props.activeConnector } : {}),
                },
                body: JSON.stringify({
                    content: `${contextBlock}\n\n[Question]\n${q}`,
                    assistantProfile: props.activeConnector || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
            // Backend-agnostic response reading. Different backends return
            // content under different field names (per docs/research/CODEBASE_AUDIT.md):
            //   - orchestrator-wrapped (OpenAI/Bedrock/Foundation): data.content
            //   - Genie native: data.message.content (and/or attachments[].text.content)
            //   - Supervisor: data.content (synthesized) or data.synthesis
            // v1 will poll /assistant/conversations/:cid/messages/:mid for IN_PROGRESS.
            const attachmentText = Array.isArray(data?.message?.attachments)
                ? data.message.attachments.find((a: { text?: { content?: string } }) => a?.text?.content)?.text?.content
                : undefined;
            const answer =
                (typeof data?.content === "string" && data.content)
                || (typeof data?.synthesis === "string" && data.synthesis)
                || (typeof data?.message?.content === "string" && data.message.content)
                || attachmentText
                || (data?.status === "IN_PROGRESS" ? "(in progress; polling not yet implemented in v0)" : "(no content returned)");
            setHistory(prev => prev.map(h => h.id === entry.id ? { ...h, answer, pending: false } : h));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setHistory(prev => prev.map(h => h.id === entry.id ? { ...h, error: msg, pending: false } : h));
        }
    };

    return (
        <section className="pp-ai-sidebar">
            <h2 className="pp-ai-sidebar__title">AI Assistant</h2>
            <p className="pp-ai-sidebar__intro">
                Ask questions across whichever BI tool is loaded. Context from the active panel's
                recent events ({props.recentEvents.length} captured) is sent with every prompt.
            </p>
            <div className="pp-ai-sidebar__history">
                {history.map(h => (
                    <article key={h.id} className="pp-ai-sidebar__entry">
                        <div className="pp-ai-sidebar__q"><strong>You:</strong> {h.question}</div>
                        {h.pending && <div className="pp-ai-sidebar__pending">Thinking…</div>}
                        {h.answer && <div className="pp-ai-sidebar__a"><strong>AI:</strong> {h.answer}</div>}
                        {h.error && <div className="pp-ai-sidebar__error">Error: {h.error}</div>}
                    </article>
                ))}
            </div>
            <div className="pp-ai-sidebar__composer">
                <textarea
                    className="pp-ai-sidebar__input"
                    rows={3}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask about the loaded view…"
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) ask(); }}
                />
                <button type="button" className="pp-ai-sidebar__ask" onClick={ask}>
                    Ask
                </button>
            </div>
        </section>
    );
}
