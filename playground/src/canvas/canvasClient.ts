// playground/src/canvas/canvasClient.ts
//
// Thin client for the /decision-canvas API. All persistence is server-owned; this
// only sends governed section descriptors + action verbs and reads back the
// server's authoritative section/snapshot objects. Never sends business rows or SQL.

import type { CanvasSection, CanvasSnapshot, EligibleSection, SaveState } from "./canvasTypes";

function base(): string {
    if (typeof window === "undefined") return "/api";
    try {
        const raw = window.localStorage.getItem("pulseplay:visual-settings:genieSettings");
        if (raw) {
            const v = JSON.parse(raw)?.apiBaseUrl;
            if (typeof v === "string" && v.trim() && /\/api$/.test(v.trim())) return v.trim();
        }
    } catch { /* swallow */ }
    return "/api";
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${base()}/decision-canvas${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(init?.headers || {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body?.error || `HTTP ${res.status}`), { status: res.status, body });
    return body as T;
}

let opCounter = 0;
function clientOperationId(): string {
    // deterministic-ish per session; only needs to be unique per create attempt
    opCounter += 1;
    return `op-${opCounter}-${(typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : opCounter}`;
}

export async function listSections(saveState?: SaveState): Promise<CanvasSection[]> {
    const q = saveState ? `?save_state=${encodeURIComponent(saveState)}` : "";
    const body = await req<{ sections: CanvasSection[] }>(`/sections${q}`);
    return body.sections || [];
}

/** Create (or focus, via dedupe) a section and optionally apply a save intent. */
export async function saveSection(
    section: EligibleSection, saveOp?: "pin" | "bookmark",
): Promise<{ section: CanvasSection; deduped: boolean }> {
    const idem = `${section.type}:${section.source.prompt_id || section.source.source_object_id || section.source.message_id || section.title}`;
    const body = await req<{ section: CanvasSection; deduped: boolean }>(`/sections`, {
        method: "POST",
        headers: { "Idempotency-Key": idem },
        body: JSON.stringify({ section, save_op: saveOp, client_operation_id: clientOperationId() }),
    });
    return { section: body.section, deduped: body.deduped };
}

type Verb = "pin" | "unpin" | "bookmark" | "unbookmark" | "note" | "highlight" | "unhighlight" | "reorder" | "group" | "tags";

export async function mutateSection(
    sectionId: string, action: Verb, version: number, extra: Record<string, unknown> = {},
): Promise<CanvasSection> {
    const body = await req<{ section: CanvasSection }>(`/sections/${encodeURIComponent(sectionId)}`, {
        method: "PATCH",
        body: JSON.stringify({ action, expected_version: version, ...extra }),
    });
    return body.section;
}

export async function deleteSection(sectionId: string, version: number): Promise<void> {
    await req(`/sections/${encodeURIComponent(sectionId)}?expected_version=${version}`, { method: "DELETE" });
}

export async function listSnapshots(): Promise<CanvasSnapshot[]> {
    const body = await req<{ snapshots: CanvasSnapshot[] }>(`/snapshots`);
    return body.snapshots || [];
}

export async function snapshotSection(sectionId: string): Promise<CanvasSnapshot> {
    const body = await req<{ snapshot: CanvasSnapshot }>(`/sections/${encodeURIComponent(sectionId)}/snapshots`, { method: "POST" });
    return body.snapshot;
}

export async function snapshotSource(section: EligibleSection): Promise<CanvasSnapshot> {
    const body = await req<{ snapshot: CanvasSnapshot }>(`/snapshots`, {
        method: "POST", body: JSON.stringify({ section }),
    });
    return body.snapshot;
}
