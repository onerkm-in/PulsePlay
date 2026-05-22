// playground/src/pulse/state/stagedReveal.ts
// ──────────────────────────────────────────────────────────────────────
// Client-side progressive reveal of an already-generated briefing.
//
// Genie answers single-shot: one message id, one full markdown response.
// To get the perceived "1-then-2-then-2" cadence WITHOUT re-querying the
// LLM (which would multiply cost + latency by N), we hold the rendered
// sections back and reveal them on a wall-clock schedule once the answer
// has landed.
//
// This module is pure + transport-agnostic. The React wiring lives in
// `useStagedReveal.ts`; the integration into Pulse Insights lives in
// `visual.tsx`. Tests pin the schedule semantics so future tweaks don't
// silently change reveal cadence.
//
// Design notes
// ────────────
// - Sections are addressed by their canonical UPPER-CASE title (HEADLINE,
//   KPI SNAPSHOT, TRENDS, RISKS, RECOMMENDED ACTIONS, OPPORTUNITIES, …).
// - Sections not listed in any stage are revealed at t=0 (graceful default
//   for custom Adjust prompts that emit unknown titles like SWOT,
//   STRENGTHS, etc — we'd rather show them than hide them forever).
// - Empty stages are tolerated but stripped from `totalStages`.
// - Schedule with stage.atMs values must be non-decreasing; validateSchedule
//   reports problems but does not throw — callers decide whether to fall
//   back to DEFAULT_REVEAL_SCHEDULE.

export type CanonicalSectionId = string;

export interface RevealStage {
    /** Wall-clock ms after reveal start when these sections become visible. */
    readonly atMs: number;
    /** Canonical section IDs to reveal at this tick (UPPER CASE). */
    readonly sections: ReadonlyArray<CanonicalSectionId>;
    /** Optional human label for the spinner stage tooltip. */
    readonly label?: string;
}

export type RevealSchedule = ReadonlyArray<RevealStage>;

/** Default cadence per Rajesh 2026-05-20 brief:
 *  - t=0:    HEADLINE alone (head shot)
 *  - t=10s:  KPI SNAPSHOT + TRENDS (first follow-up pair)
 *  - t=20s:  RISKS + RECOMMENDED ACTIONS (second pair)
 *  - OPPORTUNITIES is treated as a tail extension at t=30s when present. */
export const DEFAULT_REVEAL_SCHEDULE: RevealSchedule = Object.freeze([
    { atMs: 0,     sections: ["HEADLINE"],                              label: "Headline" },
    { atMs: 10000, sections: ["KPI SNAPSHOT", "TRENDS"],                label: "KPIs + Trends" },
    { atMs: 20000, sections: ["RISKS", "RECOMMENDED ACTIONS"],          label: "Risks + Actions" },
    { atMs: 30000, sections: ["OPPORTUNITIES"],                         label: "Opportunities" },
]);

/** Schedule preset for the "fast" cadence lever — headline immediately,
 *  everything else after 4 s. Useful for demo settings where the author
 *  wants a fast perceived response and doesn't care about per-section
 *  beats. */
export const FAST_REVEAL_SCHEDULE: RevealSchedule = Object.freeze([
    { atMs: 0,    sections: ["HEADLINE"],                                                         label: "Headline" },
    { atMs: 4000, sections: ["KPI SNAPSHOT", "TRENDS", "RISKS", "RECOMMENDED ACTIONS", "OPPORTUNITIES"], label: "Body" },
]);

/** Schedule preset for the "full" cadence lever — every section gets its
 *  own visible beat at 8 s spacing. Slower wall-clock but each section
 *  paints distinctly. */
export const FULL_REVEAL_SCHEDULE: RevealSchedule = Object.freeze([
    { atMs: 0,     sections: ["HEADLINE"],            label: "Headline" },
    { atMs: 8000,  sections: ["KPI SNAPSHOT"],        label: "KPIs" },
    { atMs: 16000, sections: ["TRENDS"],              label: "Trends" },
    { atMs: 24000, sections: ["RISKS"],               label: "Risks" },
    { atMs: 32000, sections: ["RECOMMENDED ACTIONS"], label: "Actions" },
    { atMs: 40000, sections: ["OPPORTUNITIES"],       label: "Opportunities" },
]);

/** The "instant" cadence has no schedule — every section is treated as
 *  unscheduled and falls through to the t=0 default. Returned as an empty
 *  schedule; the visual layer pairs this with the existing
 *  `insightsStagedRevealEnabled === false` path so the same code disables
 *  staged reveal in either case. */
export const INSTANT_REVEAL_SCHEDULE: RevealSchedule = Object.freeze([]);

/** Map a cadence label to its concrete schedule. Unknown labels fall back
 *  to the balanced default. */
export function revealScheduleFromCadence(
    cadence: "instant" | "fast" | "balanced" | "full" | string | undefined,
): RevealSchedule {
    switch (cadence) {
        case "instant":  return INSTANT_REVEAL_SCHEDULE;
        case "fast":     return FAST_REVEAL_SCHEDULE;
        case "full":     return FULL_REVEAL_SCHEDULE;
        case "balanced":
        default:         return DEFAULT_REVEAL_SCHEDULE;
    }
}

/** Upper bound on a single inter-stage gap. Anything longer is almost
 *  certainly a unit confusion (seconds vs ms) — clamp to keep the UI from
 *  hanging on a phantom future stage. */
export const STAGE_GAP_MAX_MS = 60_000;

export interface ScheduleProblem {
    readonly index: number;
    readonly message: string;
}

/** Best-effort static checks. Returns a list of problems (empty = OK). */
export function validateSchedule(schedule: RevealSchedule | null | undefined): ReadonlyArray<ScheduleProblem> {
    const problems: ScheduleProblem[] = [];
    if (!Array.isArray(schedule) || schedule.length === 0) {
        problems.push({ index: -1, message: "schedule must be a non-empty array" });
        return problems;
    }
    let prevAt = -Infinity;
    for (let i = 0; i < schedule.length; i++) {
        const stage = schedule[i];
        if (!stage || typeof stage !== "object") {
            problems.push({ index: i, message: "stage must be an object" });
            continue;
        }
        if (typeof stage.atMs !== "number" || !isFinite(stage.atMs) || stage.atMs < 0) {
            problems.push({ index: i, message: "stage.atMs must be a non-negative number" });
        }
        if (!Array.isArray(stage.sections)) {
            problems.push({ index: i, message: "stage.sections must be an array" });
        }
        if (stage.atMs < prevAt) {
            problems.push({ index: i, message: "stage.atMs must be non-decreasing" });
        }
        if (stage.atMs - prevAt > STAGE_GAP_MAX_MS && prevAt !== -Infinity) {
            problems.push({ index: i, message: `stage gap exceeds ${STAGE_GAP_MAX_MS}ms (likely a seconds-vs-ms mistake)` });
        }
        prevAt = stage.atMs;
    }
    return problems;
}

export interface RevealState {
    /** Set of canonical section IDs that should currently render. */
    readonly visibleSections: ReadonlySet<CanonicalSectionId>;
    /** 0-based index of the most-recently-fired stage. -1 before any stage fires. */
    readonly currentStageIndex: number;
    /** Total stages in the schedule (after pruning empties). */
    readonly totalStages: number;
    /** Wall-clock ms remaining until the next stage fires, or null if all stages done. */
    readonly msUntilNextStage: number | null;
    /** True while more stages remain to fire. */
    readonly isRevealing: boolean;
    /** Per-stage status snapshot for the spinner UI. */
    readonly stageProgress: ReadonlyArray<RevealStageProgress>;
}

export type RevealStageStatus = "pending" | "current" | "done";

export interface RevealStageProgress {
    readonly index: number;
    readonly atMs: number;
    readonly label: string;
    readonly status: RevealStageStatus;
    readonly sections: ReadonlyArray<CanonicalSectionId>;
}

/** Pure resolver — given an elapsed time and schedule, what's visible?
 *
 *  Sections present in the parsed content but NOT named in any stage are
 *  always visible (treated as "tail" — preserves Adjust-prompt custom
 *  sections like SWOT/STRENGTHS that the schedule doesn't know about).
 */
export function computeRevealState(
    schedule: RevealSchedule,
    elapsedMs: number,
    parsedSectionIds: ReadonlyArray<CanonicalSectionId>,
): RevealState {
    const visible = new Set<CanonicalSectionId>();
    const scheduledIds = new Set<CanonicalSectionId>();
    const usefulStages: RevealStage[] = [];

    for (const stage of schedule) {
        if (!stage.sections || stage.sections.length === 0) continue;
        // Only count stages that contribute at least one section present in
        // the parsed content. A stage whose sections didn't make it into
        // the answer (e.g. OPPORTUNITIES on a 4-section briefing) shouldn't
        // show up in the spinner as a phantom future step.
        const stageHasPresent = stage.sections.some(id => parsedSectionIds.includes(id.toUpperCase()));
        if (!stageHasPresent) continue;
        usefulStages.push(stage);
        for (const id of stage.sections) scheduledIds.add(id.toUpperCase());
    }

    let currentStageIndex = -1;
    for (let i = 0; i < usefulStages.length; i++) {
        if (elapsedMs >= usefulStages[i].atMs) {
            currentStageIndex = i;
            for (const id of usefulStages[i].sections) visible.add(id.toUpperCase());
        }
    }

    // Tail: sections present in the parsed content but absent from the
    // schedule are revealed unconditionally so custom-Adjust outputs don't
    // get stuck behind a schedule that doesn't know about them.
    for (const id of parsedSectionIds) {
        const upper = id.toUpperCase();
        if (!scheduledIds.has(upper)) visible.add(upper);
    }

    const nextStage = usefulStages[currentStageIndex + 1];
    const msUntilNextStage = nextStage ? Math.max(0, nextStage.atMs - elapsedMs) : null;
    const isRevealing = msUntilNextStage !== null;

    const stageProgress: RevealStageProgress[] = usefulStages.map((s, i) => ({
        index: i,
        atMs: s.atMs,
        label: s.label || s.sections.join(" + "),
        status: i < currentStageIndex ? "done" : i === currentStageIndex ? "current" : "pending",
        sections: [...s.sections.map(x => x.toUpperCase())],
    }));

    return {
        visibleSections: visible,
        currentStageIndex,
        totalStages: usefulStages.length,
        msUntilNextStage,
        isRevealing,
        stageProgress,
    };
}

/** Helper for tests + the hook — extract the next tick time (absolute ms
 *  from reveal start) so setTimeout can schedule it.
 */
export function nextRevealTickMs(
    schedule: RevealSchedule,
    elapsedMs: number,
    parsedSectionIds: ReadonlyArray<CanonicalSectionId>,
): number | null {
    for (const stage of schedule) {
        if (!stage.sections || stage.sections.length === 0) continue;
        if (!stage.sections.some(id => parsedSectionIds.includes(id.toUpperCase()))) continue;
        if (stage.atMs > elapsedMs) return stage.atMs;
    }
    return null;
}
