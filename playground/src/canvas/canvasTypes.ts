// playground/src/canvas/canvasTypes.ts
//
// Frontend mirror of the server-side CanvasSection contract (proxy/lib/canvasSection.js).
// The server is authoritative for validation and for what it derives (owner, version,
// content hash); this is the shape the UI reads and the eligible-source descriptor it
// sends.

export type CanvasSectionType = "decision_prompt" | "data_insight" | "grounded_answer" | "bi_view_state";
export type SaveState = "none" | "pinned" | "bookmarked" | "pinned-and-bookmarked";
export type Freshness = "current" | "changed" | "stale" | "resolved" | "revoked";

export interface CanvasSectionSource {
    surface?: string | null;
    prompt_id?: string | null;
    rule_id?: string | null;
    conversation_id?: string | null;
    message_id?: string | null;
    source_object_id?: string | null;
}

export interface CanvasSection {
    section_id: string;
    schema_version: number;
    owner_actor_id: string;
    type: CanvasSectionType;
    title: string;
    source: CanvasSectionSource;
    provenance: {
        semantic_ref: string;
        evidence_ref?: string | null;
        refresh_binding_id?: string | null;
        data_as_of?: string | null;
        filters: Record<string, unknown>;
        content_hash: string;
        classification: string;
    };
    state: {
        lifecycle: string;
        freshness: Freshness;
        save_state: SaveState;
        emphasis: "normal" | "highlighted";
        note?: string | null;
        tags?: string[];
    };
    capabilities: {
        can_pin: boolean;
        can_bookmark: boolean;
        can_snapshot: boolean;
        can_highlight: boolean;
        can_note: boolean;
        can_refresh: boolean;
        can_act: boolean;
    };
    layout?: { group_id?: string; order: number; size?: "small" | "medium" | "large" };
    version: number;
    created_at: string;
    updated_at: string;
}

export interface CanvasSnapshot {
    snapshot_id: string;
    section_id: string;
    section_version: number;
    type: CanvasSectionType;
    title: string;
    summary: string;
    data_as_of?: string | null;
    classification: string;
    note?: string | null;
    created_at: string;
}

/** What a surface sends to pin/bookmark/snapshot a section. Only governed,
 *  non-sensitive descriptors — never business rows or executable SQL. */
export interface EligibleSection {
    type: CanvasSectionType;
    title: string;
    source: CanvasSectionSource;
    provenance?: {
        semantic_ref?: string;
        evidence_ref?: string | null;
        refresh_binding_id?: string | null;
        data_as_of?: string | null;
        filters?: Record<string, unknown>;
        classification?: string;
    };
}
