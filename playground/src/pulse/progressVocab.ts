// progressVocab.ts — single source of truth for user-facing progress text.
//
// Every loading state in the visual (AI Insights stages, Chat poll status,
// Supervisor fan-out, single-space query) maps through this module. Never
// render raw Genie enums (`PENDING_WAREHOUSE`, `ASKING_AI`) or internal
// profile keys (`sales`, `customer`) directly — they are jargon and they
// leak through to users (BUG-013). Always go via the helpers below so the
// vocabulary stays consistent and replaceable.
//
// Icons are keys into a small set of SVG glyphs rendered by
// <ProgressIndicator>. Each icon has its own subtle CSS animation.

export type StepIcon =
    | "warming"     // cog/gear that rotates — startup work
    | "thinking"    // sparkle wand — model reasoning
    | "querying"    // table grid pulse — data fetch
    | "reading"     // magnifier wiggle — scanning results
    | "writing"     // pencil bobbing — composing answer
    | "calling"     // antenna emanate — supervisor dispatching helpers
    | "fusing"      // braid spin — synthesising multi-source answer
    | "done"        // check mark
    | "failed";     // x mark

export type StepState = "pending" | "active" | "done" | "failed";

export interface ProgressStep {
    id: string;
    label: string;
    icon: StepIcon;
    state: StepState;
    /** Wall-clock ms this step took (set when state transitions to done/failed). */
    elapsedMs?: number;
    /** Optional live sub-status appended after the main label
     *  (e.g. "Spotting trends" + "Pulling the data"). Lets the polished verb stay
     *  the marquee while the underlying Genie poll state is still visible. */
    subLabel?: string;
}

/** Helper-chip view-model used in supervisor flows (Phase 5). */
export interface HelperChipView {
    id: string;
    /** Friendly display name from profile metadata, never the raw profile key. */
    displayName: string;
    state: StepState;
    elapsedMs?: number;
}

const PHRASE: Record<string, { label: string; icon: StepIcon }> = {
    pendingWarehouse:  { label: "Warming up the warehouse",        icon: "warming"  },
    fetchingMetadata:  { label: "Reading your data",               icon: "reading"  },
    filteringContext:  { label: "Applying your filters",           icon: "querying" },
    askingAi:          { label: "Working out the right query",     icon: "thinking" },
    generatingSql:     { label: "Preparing the analysis",          icon: "thinking" },
    evaluatingSql:     { label: "Checking the analysis",           icon: "thinking" },
    executing:         { label: "Pulling the data",                icon: "querying" },
    retrying:          { label: "Retrying",                        icon: "thinking" },
    waiting:           { label: "Waking up resources",             icon: "warming"  },
    working:           { label: "Working on it",                   icon: "thinking" },
    connecting:        { label: "Connecting",                      icon: "calling"  },
    synthesising:      { label: "Pulling everything together",     icon: "fusing"   },
    completed:         { label: "Done",                             icon: "done"     },
    failed:            { label: "That didn't work",                 icon: "failed"   },
    cancelled:         { label: "Cancelled",                        icon: "failed"   }
};

/**
 * Map a raw Genie poll status string to friendly active-step text + icon.
 * Defensive against case + spacing variations and unknown future statuses.
 */
export function describeGenieStatus(status: string | null | undefined): { label: string; icon: StepIcon } {
    const s = String(status || "").trim().toUpperCase();
    if (!s) return PHRASE.working;
    if (s.includes("PENDING_WAREHOUSE"))         return PHRASE.pendingWarehouse;
    if (s.includes("FETCHING_METADATA"))         return PHRASE.fetchingMetadata;
    if (s.includes("FILTERING_CONTEXT"))         return PHRASE.filteringContext;
    if (s.includes("ASKING_AI"))                 return PHRASE.askingAi;
    if (s.includes("GENERATING_SQL"))            return PHRASE.generatingSql;
    if (s.includes("EVALUATING_SQL"))            return PHRASE.evaluatingSql;
    if (s.includes("EXECUTING"))                 return PHRASE.executing;
    if (s.includes("RUNNING"))                   return PHRASE.executing;
    if (s.includes("RETRYING"))                  return PHRASE.retrying;
    if (s.includes("CANCELLED") || s.includes("CANCELED")) return PHRASE.cancelled;
    if (s.includes("COMPLETED") || s === "DONE") return PHRASE.completed;
    if (s.includes("FAILED") || s.includes("ERROR")) return PHRASE.failed;
    if (s.includes("PENDING"))                   return PHRASE.waiting;
    if (s.includes("CONNECT"))                   return PHRASE.connecting;
    if (s.includes("SYNTH") || s.includes("FUSE")) return PHRASE.synthesising;
    return PHRASE.working;
}

/**
 * Map an AI Insights stage title (HEADLINE / KPI SNAPSHOT / TRENDS / etc.) to
 * friendly active-step text + icon. Falls back to title-case of the input
 * for unknown stages so a future stage isn't silently invisible.
 */
export function describeInsightsStage(title: string | null | undefined): { label: string; icon: StepIcon } {
    const t = String(title || "").trim().toLowerCase();
    if (!t) return { label: "Working on it", icon: "thinking" };

    // Single-stage chip / custom-prompt overrides ("Adjust summary" buttons).
    // Match these FIRST — they use verb-leading labels ("Highlight risks",
    // "Explain drivers", "Compare periods") and would otherwise be swallowed
    // by the more general stage tokens (risk / driver / etc.) below.
    if (t.includes("compare"))                                          return { label: "Comparing periods",            icon: "reading"  };
    if (t.includes("highlight"))                                        return { label: "Highlighting risks",           icon: "thinking" };
    if (t.includes("explain"))                                          return { label: "Explaining drivers",           icon: "thinking" };
    if (t.includes("exec") || t.includes("board") || t.includes("c-suite")) return { label: "Drafting an executive summary", icon: "writing" };
    if (t.includes("summarize") || t.includes("summarise"))             return { label: "Spotting trends",              icon: "reading"  };
    if (t.includes("custom"))                                           return { label: "Working on your request",      icon: "thinking" };
    if (t === "response")                                               return { label: "Working on your request",      icon: "thinking" };

    // Multi-stage Insights pipeline (the 5-stage default run).
    if (t.includes("headline"))                                         return { label: "Reading the headline numbers", icon: "reading" };
    if (t.includes("kpi") || t.includes("snapshot"))                    return { label: "Capturing the KPI snapshot",   icon: "reading" };
    if (t.includes("trend"))                                            return { label: "Spotting trends",              icon: "reading" };
    if (t.includes("driver"))                                           return { label: "Finding what's driving it",    icon: "thinking" };
    if (t.includes("risk"))                                             return { label: "Flagging risks",               icon: "thinking" };
    if (t.includes("action") || t.includes("recommend"))                return { label: "Recommending next actions",   icon: "writing" };
    if (t.includes("summary") || t.includes("executive"))               return { label: "Summarising for executives",  icon: "writing" };

    // Unknown but explicit stage name: keep it but title-case it nicely.
    return { label: titleCase(title!), icon: "thinking" };
}

export type SupervisorStage = "fanOut" | "helperRun" | "synthesis" | "done" | "failed";

/**
 * Friendly text for supervisor-stage transitions. helperCount is used to
 * pluralise "Calling on 3 helpers" vs "Calling on the helper". The
 * helperRun phrase needs displayName + dataDomain from profile metadata
 * (Phase 4) — pass them via formatHelperRunLabel.
 */
export function describeSupervisorStage(
    stage: SupervisorStage,
    helperCount?: number
): { label: string; icon: StepIcon } {
    switch (stage) {
        case "fanOut": {
            const n = helperCount ?? 0;
            if (n <= 0) return { label: "Calling on the helpers", icon: "calling" };
            if (n === 1) return { label: "Calling on the helper", icon: "calling" };
            return { label: `Calling on ${n} helpers`, icon: "calling" };
        }
        case "helperRun":  return { label: "A helper is checking the data", icon: "querying" };
        case "synthesis":  return { label: "Pulling everything together",   icon: "fusing"   };
        case "done":       return { label: "Done",                            icon: "done"     };
        case "failed":     return { label: "Synthesis failed",                icon: "failed"   };
    }
}

/**
 * Pick an icon for a friendly progress label that's already been rendered
 * to user-facing text (e.g. "Analysing your data" stored on a chat
 * message's currentStatus). Looks for verb / noun cues; falls back to the
 * generic "thinking" wand. Used by chat surfaces where the raw Genie
 * status enum is no longer accessible at render time.
 */
export function inferIconFromLabel(label: string | null | undefined): StepIcon {
    const t = String(label || "").trim().toLowerCase();
    if (!t) return "thinking";
    // Order matters: more specific phrases first so generic verbs
    // ("pull", "analys") don't pre-empt synthesis / writing / failure
    // labels that happen to share those substrings.
    if (/(fail|error|cancel|wrong|didn'?t work)/.test(t))                  return "failed";
    if (/(done|complet|finished)/.test(t))                                  return "done";
    if (/(synth|fuse|together)/.test(t))                                    return "fusing";
    if (/(write|recommend|summar|draft)/.test(t))                           return "writing";
    if (/(work out|prepar|check|understand|think|generat|evaluat|retry)/.test(t)) return "thinking";
    if (/(filter|apply)/.test(t))                                           return "querying";
    if (/(pull|execut|analys|analyz|run.*query|fetch.*data)/.test(t))       return "querying";
    if (/(read|scan)/.test(t))                                              return "reading";
    if (/(warm|wak|spinning up)/.test(t))                                   return "warming";
    if (/(connect|call|reach)/.test(t))                                     return "calling";
    return "thinking";
}

/**
 * Compose a per-helper run label using profile metadata. displayName +
 * dataDomain come from `proxy/config.json` profile entries (Phase 4 adds
 * these fields). Falls back to a generic phrase when metadata is missing
 * so we never leak the raw profile key.
 */
export function formatHelperRunLabel(displayName: string | null | undefined, dataDomain: string | null | undefined): string {
    const name = (displayName || "").trim() || "Helper";
    const domain = (dataDomain || "").trim() || "the data";
    return `${name} is checking ${domain}`;
}

/**
 * Format ms as `m:ss`. Used in the timer + per-step elapsed.
 */
export function fmtElapsed(ms: number | null | undefined): string {
    const n = Math.max(0, Math.floor(Number(ms) || 0));
    const totalSec = Math.floor(n / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

function titleCase(s: string): string {
    return s
        .toLowerCase()
        .split(/\s+/)
        .map(w => w ? w[0].toUpperCase() + w.slice(1) : "")
        .join(" ")
        .trim();
}
