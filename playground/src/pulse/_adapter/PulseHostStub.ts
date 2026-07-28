// playground/src/pulse/_adapter/PulseHostStub.ts
//
// Runtime IVisualHost stub for mounting Pulse's visual.tsx outside Power BI.
//
// Pulse's `Visual` class is constructed with `{ element, host }` where
// `host: IVisualHost`. PBI's host provides:
//   - applyJsonFilter(filter, "general", "filter", FilterAction)  -> applies a filter to the report
//   - persistProperties({ merge: [{ objectName, selector, properties }] }) -> writes settings to the .pbix file
//   - createLocalizationManager() -> returns a localization service
//   - colorPalette -> reads from the active PBI theme
//
// PulsePlay isn't a PBI host. We provide PulsePlay-shaped runtime
// behaviour for each method:
//
//   applyJsonFilter      -> routes to the active BIAdapter via the
//                            optional onApplyFilter callback the wrapper
//                            installs (so Pulse's filter UI talks to the
//                            BI panel)
//   persistProperties    -> writes to localStorage under the key
//                            `pulseplay:visual-settings:<objectName>`
//                            so settings survive reloads
//   createLocalizationManager -> identity translator (key -> key)
//   colorPalette         -> minimal palette object the visual reads
//                            when "Use Report Theme" is on; PulsePlay
//                            falls back to the browser's color scheme
//                            or whatever theme the wrapper supplies

import powerbi from "./powerbi-visuals-api";

type FilterArg = powerbi.IFilter | powerbi.IFilter[] | null;
type FilterAction = powerbi.FilterAction;

/** Settings persisted per objectName + propertyName under
 *  `pulseplay:visual-settings:<objectName>` in localStorage. */
const STORAGE_KEY_PREFIX = "pulseplay:visual-settings:";

export interface PulseHostCallbacks {
    /** Called when Pulse's UI applies a filter. The wrapper routes this
     *  to the active BIAdapter's `send({ kind: "apply-filter", ... })`
     *  so the filter actually reaches the embedded BI tool. */
    onApplyFilter?: (filter: FilterArg, action: FilterAction) => void;
    /** Called when Pulse persists a property change. The wrapper can use
     *  this to trigger a re-render or to push the change into shared
     *  state. localStorage is always written regardless. */
    onPersist?: (changes: PersistChanges) => void;
    /** Optional palette override. When supplied, Pulse's "Use Report Theme"
     *  reads from here instead of the browser's prefers-color-scheme
     *  defaults. */
    palette?: {
        background?: { value: string };
        foreground?: { value: string };
        accent?: { value: string };
    };
}

export interface PersistChanges {
    merge?: Array<{
        objectName: string;
        selector?: unknown;
        properties: Record<string, unknown>;
    }>;
    remove?: Array<{
        objectName: string;
        selector?: unknown;
        properties: Record<string, unknown>;
    }>;
}

/** Implementation of IVisualHost that routes PBI semantics to PulsePlay-
 *  shaped runtime: localStorage for persistence, BIAdapter for filters,
 *  identity localizer, and a sensible default palette. */
export class PulseHostStub {
    public readonly applyJsonFilter: (filter: FilterArg, objectName: string, propertyName: string, action: FilterAction) => void;
    public readonly persistProperties: (changes: unknown) => void;
    public readonly createLocalizationManager: () => { getDisplayName: (key: string) => string };
    public readonly colorPalette: unknown;
    public readonly eventService: unknown;
    public readonly tooltipService: unknown;
    public readonly refreshHostData: () => void;
    public readonly launchUrl: (url: string) => void;
    public readonly hostCapabilities: unknown;
    public readonly instanceId: string;

    constructor(private callbacks: PulseHostCallbacks = {}) {
        this.instanceId = `pulseplay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        this.applyJsonFilter = (filter, _objectName, _propertyName, action) => {
            try {
                this.callbacks.onApplyFilter?.(filter, action);
            } catch (err) {
                console.warn("[PulseHostStub] applyJsonFilter callback failed:", err);
            }
        };

        this.persistProperties = (rawChanges) => {
            const changes = rawChanges as PersistChanges;
            try {
                for (const merge of changes?.merge ?? []) {
                    if (!merge.objectName || !merge.properties) continue;
                    const key = STORAGE_KEY_PREFIX + merge.objectName;
                    const existing = readStoredObject(key);
                    const next = { ...existing, ...merge.properties };
                    writeStoredObject(key, next);
                }
                for (const removal of changes?.remove ?? []) {
                    if (!removal.objectName) continue;
                    const key = STORAGE_KEY_PREFIX + removal.objectName;
                    const existing = readStoredObject(key);
                    for (const propName of Object.keys(removal.properties ?? {})) {
                        delete (existing as Record<string, unknown>)[propName];
                    }
                    writeStoredObject(key, existing);
                }
                this.callbacks.onPersist?.(changes);
            } catch (err) {
                console.warn("[PulseHostStub] persistProperties failed:", err);
            }
        };

        this.createLocalizationManager = () => ({
            // Identity translator. Pulse's strings are all English already;
            // localisation isn't a v1 concern.
            getDisplayName: (key: string) => key,
        });

        // colorPalette stub. Pulse's `Use Report Theme` toggle reads
        // host.colorPalette and maps it onto CSS custom properties.
        // We supply either the wrapper-provided palette or sensible
        // defaults based on the browser's prefers-color-scheme.
        const isDark = typeof window !== "undefined"
            && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
        this.colorPalette = this.callbacks.palette ?? {
            background: { value: isDark ? "#1f1f1f" : "#ffffff" },
            foreground: { value: isDark ? "#f5f5f5" : "#202020" },
            accent: { value: "#0078d4" },
        };

        // Stubbed-but-safe: Pulse may reach for these but PulsePlay
        // doesn't need the PBI event/tooltip services. Returning null
        // (rather than throwing) keeps optional accesses non-fatal.
        this.eventService = null;
        this.tooltipService = null;
        this.hostCapabilities = { allowInteractions: true };

        this.refreshHostData = () => {
            // PBI calls this to ask the host to re-fetch; PulsePlay has
            // nothing to re-fetch at this layer. No-op.
        };

        this.launchUrl = (url: string) => {
            if (typeof window !== "undefined") {
                window.open(url, "_blank", "noopener,noreferrer");
            }
        };
    }
}

/** Read all settings for an objectName (e.g. "genieSettings") from
 *  localStorage. Returns {} when nothing has been written yet. */
export function readStoredObject(key: string): Record<string, unknown> {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writeStoredObject(key: string, value: Record<string, unknown>): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
        console.warn(`[PulseHostStub] localStorage write failed for ${key}:`, err);
    }
}

/** Convenience reader for the canonical Pulse settings object. */
export function readGenieSettings(): Record<string, unknown> {
    return readStoredObject(STORAGE_KEY_PREFIX + "genieSettings");
}

/** Project number-format standard, authored as domain guidance so the AI
 *  applies it consistently across AI Insights + Ask Pulse. The default format
 *  contract treats author guidance as higher precedence, so these win. Roman
 *  scale (M = thousand, MN = million, B = billion) per the project convention. */
export const DEFAULT_NUMBER_FORMAT_GUIDANCE = [
    "Number format standard — apply to EVERY value in every section, consistently:",
    "- Thousands → `x.xx M`. Millions → `x.xx MN`. Billions → `x.xx B`.",
    "- CRITICAL: on this scale `M` means THOUSAND, NOT million. A MILLION is always `MN` (two letters). Examples: 50,000 → `50.00 M`; 1,138,707 → `1.14 MN` (NEVER `1.14 M`); 989,340,000 → `989.34 MN`; 1,031,000,000 → `1.03 B`.",
    "- Percentages and ANY change to a percentage metric: `x.xx %` with the % symbol — never a `pp` suffix.",
    "- Always show exactly 2 decimals. Prefix a change / delta with an explicit sign, e.g. `+0.81 %`, `-65.42 MN`.",
    "- Currency keeps its symbol before the number: `$1.03 B`, `$989.34 MN`.",
    "- PROMOTE THE UNIT rather than comma-grouping: the number before the unit must have 1-3 digits and NEVER a thousands separator. If you are about to write `$1,031.41 MN`, the unit is wrong — promote it to `$1.03 B`. A comma before a unit suffix always means you failed to promote.",
    "- Use the SAME unit for the same quantity everywhere in one answer. Do not write `$1,031.41 MN` in one section and `$1.03 B` in another for the identical figure.",
    "- Plain ASCII punctuation only: use a hyphen `-`, never an em dash or en dash; straight quotes, not curly; `...` rather than a single ellipsis character.",
].join("\n");

/** First-run defaults seeder. Keep this intentionally small: Settings is
 *  the canonical authoring surface, while Pulse's Console is operational
 *  only. We still write explicit defaults for legacy keys so older sessions
 *  hydrate predictably, but we do not turn the old in-Console Setup editor
 *  on for new users. */
export function seedPulsePlayDefaults(): void {
    if (typeof window === "undefined") return;
    const key = STORAGE_KEY_PREFIX + "genieSettings";
    try {
        const existing = readStoredObject(key);
        const defaults: Record<string, unknown> = {
            // Legacy gate for the old in-Console Setup tab. Settings now
            // owns configuration, so new sessions should not surface the
            // duplicate editor.
            showSetupAccess: false,
            // Per-card "Generated by PulsePlay · Source: … · Updated …"
            // provenance footer is developer/QA chrome that confuses end
            // users. Default it OFF for PulsePlay here (adapter-level, so the
            // shared heritage `settings.ts` default stays true for the PBI
            // sibling). Authors can re-enable via Settings → AI → Response
            // behavior → "Show provenance footer" (writes true, not stomped).
            insightsShowProvenanceFooter: false,
            // PepsiCo-inspired blue is the PulsePlay default look (2026-07-27).
            // Authors can switch via Settings → Appearance. Absent themeName also
            // resolves to "pepsico" (resolveThemeTokens), so this just persists it.
            themeName: "pepsico",
            // Project number-format standard, expressed as DOMAIN GUIDANCE so it
            // is injected into every AI surface (AI Insights + Ask Pulse) and
            // takes precedence over the default format contract. insightsDomain-
            // Guidance falls back to this when empty. Authors can extend it in
            // Settings → AI → Domain guidance (their edits are never stomped).
            domainGuidance: DEFAULT_NUMBER_FORMAT_GUIDANCE,
        };
        // Only set keys that are NOT already present, so we never stomp
        // a user's explicit choice. Granular merge lets existing-user
        // sessions still pick up showSetupAccess: true without losing
        // their other Setup-tab edits.
        let changed = false;
        for (const [k, v] of Object.entries(defaults)) {
            if (!(k in existing)) {
                existing[k] = v;
                changed = true;
            }
        }
        if (changed) {
            window.localStorage.setItem(key, JSON.stringify(existing));
        }
    } catch {
        /* swallow */
    }
}

/** Build a synthetic DataView.metadata.objects bag from localStorage so
 *  Pulse's populateFormattingSettingsModel() can hydrate the model with
 *  previously-persisted values. */
export function buildPersistedObjectsBag(): {
    objects: Record<string, Record<string, unknown>>;
} {
    const objects: Record<string, Record<string, unknown>> = {};
    if (typeof window === "undefined") return { objects };
    try {
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (!key || !key.startsWith(STORAGE_KEY_PREFIX)) continue;
            const objectName = key.slice(STORAGE_KEY_PREFIX.length);
            objects[objectName] = readStoredObject(key);
        }
    } catch {
        /* swallow */
    }
    return { objects };
}

/** Force the powerbi import not to be tree-shaken — keeps the FilterAction
 *  enum's runtime values available for callers that route them through. */
void powerbi;
