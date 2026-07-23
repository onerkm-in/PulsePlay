// playground/src/experience/experienceMode.ts
//
// Author-selectable interface mode (v3.2 §10). Two permanent presentation modes:
//   - "segregated": the existing multi-surface PulsePlay shell (default + fallback)
//   - "combined":   the My Decision Canvas single-workspace experience
//
// The SERVED mode is server-authoritative (GET /experience/config → served_mode).
// End users cannot change it. Only an author (via the author-gated Settings
// control) may PREVIEW a mode locally before publishing; preview is scoped to the
// author's own browser session and never affects what end users are served.
//
// Resolution order: author preview (this session only) → published served mode →
// segregated fallback.

import { useEffect, useState, useCallback } from "react";

export type PulsePlayExperienceMode = "segregated" | "combined";

export const EXPERIENCE_FALLBACK_MODE: PulsePlayExperienceMode = "segregated";

// Author preview is session-scoped tooling, not the served authority.
const PREVIEW_KEY = "pulseplay:experience-preview";
const PREVIEW_EVENT = "pulseplay:experience-preview-change";

export interface PublishedExperience {
    served_mode: PulsePlayExperienceMode;
    published_mode: PulsePlayExperienceMode;
    version: number;
    kill_switch: boolean;
    updated_at: string | null;
}

/** Vite proxies /api/* to the proxy; fall back to that relative base. */
function experienceApiBase(): string {
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

function isMode(v: unknown): v is PulsePlayExperienceMode {
    return v === "segregated" || v === "combined";
}

export function readPreviewMode(): PulsePlayExperienceMode | null {
    if (typeof window === "undefined") return null;
    try {
        const v = window.sessionStorage.getItem(PREVIEW_KEY);
        return isMode(v) ? v : null;
    } catch { return null; }
}

/** Author tooling: set (or clear with null) the local preview mode. */
export function setPreviewMode(mode: PulsePlayExperienceMode | null): void {
    if (typeof window === "undefined") return;
    try {
        if (mode) window.sessionStorage.setItem(PREVIEW_KEY, mode);
        else window.sessionStorage.removeItem(PREVIEW_KEY);
        window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: { mode } }));
    } catch { /* swallow */ }
}

export async function fetchPublishedExperience(): Promise<PublishedExperience> {
    const res = await fetch(`${experienceApiBase()}/experience/config`, {
        headers: { "Cache-Control": "no-store" },
    });
    if (!res.ok) throw new Error(`experience config HTTP ${res.status}`);
    const body = await res.json();
    return {
        served_mode: isMode(body?.served_mode) ? body.served_mode : EXPERIENCE_FALLBACK_MODE,
        published_mode: isMode(body?.published_mode) ? body.published_mode : EXPERIENCE_FALLBACK_MODE,
        version: Number(body?.version || 0),
        kill_switch: Boolean(body?.kill_switch),
        updated_at: body?.updated_at ?? null,
    };
}

export async function publishExperienceMode(
    mode: PulsePlayExperienceMode, expectedVersion?: number,
): Promise<PublishedExperience> {
    const res = await fetch(`${experienceApiBase()}/experience/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({ mode, expected_version: expectedVersion }),
    });
    if (res.status === 403) throw new Error("Not permitted to change the interface mode.");
    if (res.status === 409) throw new Error("The interface mode changed elsewhere. Reload and retry.");
    if (!res.ok) throw new Error(`publish HTTP ${res.status}`);
    await res.json();
    return fetchPublishedExperience();
}

export interface ExperienceModeState {
    /** The mode to actually render: preview wins for the author, else served. */
    effectiveMode: PulsePlayExperienceMode;
    servedMode: PulsePlayExperienceMode;
    publishedMode: PulsePlayExperienceMode;
    previewMode: PulsePlayExperienceMode | null;
    version: number;
    killSwitch: boolean;
    loading: boolean;
    refresh: () => void;
}

/**
 * Resolve the interface mode. Fetches the server-published mode once, watches
 * the author preview key, and falls back to segregated if the server is
 * unreachable (fail-safe — the existing interface always renders).
 */
export function useExperienceMode(): ExperienceModeState {
    const [published, setPublished] = useState<PublishedExperience | null>(null);
    const [previewMode, setPreview] = useState<PulsePlayExperienceMode | null>(() => readPreviewMode());
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(() => {
        let cancelled = false;
        setLoading(true);
        fetchPublishedExperience()
            .then((p) => { if (!cancelled) setPublished(p); })
            .catch(() => { if (!cancelled) setPublished(null); }) // fail-safe → segregated
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => refresh(), [refresh]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const onPreview = () => setPreview(readPreviewMode());
        window.addEventListener(PREVIEW_EVENT, onPreview);
        return () => window.removeEventListener(PREVIEW_EVENT, onPreview);
    }, []);

    const servedMode = published?.served_mode ?? EXPERIENCE_FALLBACK_MODE;
    const publishedMode = published?.published_mode ?? EXPERIENCE_FALLBACK_MODE;
    const effectiveMode = previewMode ?? servedMode;

    return {
        effectiveMode,
        servedMode,
        publishedMode,
        previewMode,
        version: published?.version ?? 0,
        killSwitch: published?.kill_switch ?? false,
        loading,
        refresh,
    };
}
