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
