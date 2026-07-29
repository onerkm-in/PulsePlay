// playground/src/experience/sinceLastVisit.ts
//
// Change tracking across visits, computed from data the page already has.
//
// The card promised "Updated / Stale / Resolved / New … with the relevance
// phase" and shipped as a placeholder. It does not need a relevance engine:
// snapshot each visit's prompt ids + statuses locally, and diff the next
// visit against it. Zero extra queries, zero model calls.
//
// Local by design: this is "what changed since *I* last looked", which is a
// per-person, per-device fact. Nothing here is authoritative — the server
// remains the source of truth for every status it reports.

import type { DecisionPrompt } from "../components/DecisionPromptCard";

const SNAPSHOT_KEY = "pulseplay:last-visit-snapshot:v1";

export type ChangeKind = "new" | "resolved" | "updated";

export interface VisitChange {
    prompt_id: string;
    kind: ChangeKind;
    headline: string;
    /** Plain-language reason, e.g. "was waiting for approval, now done". */
    detail: string;
}

interface Snapshot {
    at: number;
    /** prompt_id -> status at that moment. */
    statuses: Record<string, string>;
}

const TERMINAL = new Set(["actioned", "rejected", "false-positive", "snoozed"]);

function readSnapshot(): Snapshot | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(SNAPSHOT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Snapshot;
        return parsed && parsed.statuses && typeof parsed.at === "number" ? parsed : null;
    } catch { return null; }
}

export function writeSnapshot(prompts: DecisionPrompt[]): void {
    if (typeof window === "undefined") return;
    const statuses: Record<string, string> = {};
    for (const p of prompts) statuses[p.prompt_id] = p.status;
    try {
        window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ at: Date.now(), statuses }));
    } catch { /* quota/private mode */ }
}

/** Human wording for a status transition, in the same plain register as the cards. */
function describe(from: string | undefined, to: string): string {
    if (!from) return "showed up since your last visit";
    if (TERMINAL.has(to) && !TERMINAL.has(from)) {
        return to === "actioned" ? "you sent the action" : `closed as ${to.replace("-", " ")}`;
    }
    if (to === "pending-approval" && from !== "pending-approval") return "now waiting on an approver";
    return `moved from ${from.replace("-", " ")} to ${to.replace("-", " ")}`;
}

/**
 * Diff the current prompts against the previous visit's snapshot.
 * Returns null when there is no prior snapshot — a first visit has nothing
 * to compare, and saying "5 new" then would be a lie.
 */
export function diffSinceLastVisit(prompts: DecisionPrompt[]): { at: number; changes: VisitChange[] } | null {
    const snap = readSnapshot();
    if (!snap) return null;

    const changes: VisitChange[] = [];
    const seen = new Set<string>();

    for (const p of prompts) {
        seen.add(p.prompt_id);
        const before = snap.statuses[p.prompt_id];
        if (before === undefined) {
            changes.push({ prompt_id: p.prompt_id, kind: "new", headline: p.headline, detail: describe(undefined, p.status) });
        } else if (before !== p.status) {
            const kind: ChangeKind = TERMINAL.has(p.status) && !TERMINAL.has(before) ? "resolved" : "updated";
            changes.push({ prompt_id: p.prompt_id, kind, headline: p.headline, detail: describe(before, p.status) });
        }
    }

    // Prompts that were open last time and are absent now (e.g. scoped out or
    // retired server-side) count as resolved-from-your-view, said honestly.
    for (const [id, status] of Object.entries(snap.statuses)) {
        if (seen.has(id) || TERMINAL.has(status)) continue;
        changes.push({ prompt_id: id, kind: "resolved", headline: "A decision you saw last time", detail: "is no longer in your list" });
    }

    // Newest-relevant first: new, then resolved, then other movement.
    const rank: Record<ChangeKind, number> = { new: 0, resolved: 1, updated: 2 };
    changes.sort((a, b) => rank[a.kind] - rank[b.kind]);
    return { at: snap.at, changes };
}

export function agoLabel(ts: number): string {
    const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (mins < 1) return "moments ago";
    if (mins < 60) return `${mins} min ago`;
    const h = Math.round(mins / 60);
    if (h < 24) return h === 1 ? "1 hour ago" : `${h} hours ago`;
    const d = Math.round(h / 24);
    return d === 1 ? "yesterday" : `${d} days ago`;
}
