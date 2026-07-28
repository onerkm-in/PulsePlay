// AuthoringCopilotPanel.tsx
//
// Review surface for the authoring copilot: one place that shows every setup
// value PulsePlay can justify from the discovery snapshot, with the reasoning
// attached, and lets the author accept them selectively.
//
// It proposes; the author decides. Nothing is applied without an explicit
// click, proposals that would replace existing author content say so, and a
// snapshot with no signal renders an honest empty state instead of a guess.
//
// Reads the snapshot the parent already has — this panel never fetches, so
// opening Settings costs nothing.

import { useMemo, useState } from "react";
import {
    buildAuthoringProposals,
    applyProposals,
    type AuthoringField,
    type AuthoringProposal,
} from "../lib/authoringCopilot";
import type { DiscoverySnapshot } from "../lib/discoveryClient";

export function AuthoringCopilotPanel(props: {
    snapshot: DiscoverySnapshot | null;
    current: Partial<Record<AuthoringField, string>>;
    domainHint?: string;
    onApply: (patch: Partial<Record<AuthoringField, string>>) => void;
}) {
    const bundle = useMemo(
        () => buildAuthoringProposals({
            snapshot: props.snapshot,
            current: props.current,
            domainHint: props.domainHint,
        }),
        [props.snapshot, props.current, props.domainHint],
    );

    // Default: everything that does NOT overwrite existing work is pre-checked.
    // Replacing something the author wrote is an opt-in, never a default.
    const [rejected, setRejected] = useState<Set<AuthoringField>>(new Set());
    const [optedIn, setOptedIn] = useState<Set<AuthoringField>>(new Set());

    const accepted = bundle.proposals.filter(p =>
        p.overwrites ? optedIn.has(p.field) : !rejected.has(p.field));

    const toggle = (p: AuthoringProposal) => {
        if (p.overwrites) {
            setOptedIn(prev => {
                const next = new Set(prev);
                if (next.has(p.field)) next.delete(p.field); else next.add(p.field);
                return next;
            });
        } else {
            setRejected(prev => {
                const next = new Set(prev);
                if (next.has(p.field)) next.delete(p.field); else next.add(p.field);
                return next;
            });
        }
    };

    if (bundle.noSignal) {
        return (
            <div className="text-muted acp__empty" data-testid="authoring-copilot-empty">
                Connect a data source and run discovery first — there is nothing measured to base
                setup proposals on yet.
            </div>
        );
    }

    if (bundle.proposals.length === 0) {
        return (
            <div className="text-muted acp__empty" data-testid="authoring-copilot-uptodate">
                Your setup already matches everything that can be derived from the connected data.
            </div>
        );
    }

    return (
        <div className="acp" data-testid="authoring-copilot">
            {bundle.summary && (
                <div className="acp__summary text-muted">Based on {bundle.summary}</div>
            )}

            {bundle.proposals.map(p => {
                const on = p.overwrites ? optedIn.has(p.field) : !rejected.has(p.field);
                return (
                    <div key={p.field} className="acp__item">
                        <label className="acp__head">
                            <input
                                type="checkbox"
                                checked={on}
                                onChange={() => toggle(p)}
                                aria-label={`Apply ${p.label}`}
                            />
                            <span className="acp__label">{p.label}</span>
                            <span className={`tag acp__conf acp__conf--${p.confidence}`}>{p.confidence} confidence</span>
                            {p.overwrites && (
                                <span className="tag acp__warn">replaces your text</span>
                            )}
                        </label>

                        <ul className="acp__because text-muted">
                            {p.because.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>

                        <pre className="acp__preview">{p.value}</pre>
                    </div>
                );
            })}

            <div className="acp__actions">
                <button
                    type="button"
                    className="btn btn-primary"
                    disabled={accepted.length === 0}
                    onClick={() => props.onApply(applyProposals(accepted))}
                    data-testid="authoring-copilot-apply"
                >
                    Apply {accepted.length} {accepted.length === 1 ? "proposal" : "proposals"}
                </button>
            </div>
        </div>
    );
}
