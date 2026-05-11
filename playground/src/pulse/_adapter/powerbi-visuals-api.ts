// playground/src/pulse/_adapter/powerbi-visuals-api.ts
//
// Minimal stub of the `powerbi-visuals-api` namespace surface that Pulse's
// ported source uses. ONLY the symbols referenced anywhere under
// playground/src/pulse/ are declared here:
//
//   powerbi.IFilter, IViewport, PrimitiveValue, DataView
//   powerbi.FilterAction (enum)
//   powerbi.extensibility.visual.IVisual / IVisualHost /
//   VisualConstructorOptions / VisualUpdateOptions
//
// This isn't a faithful PBI typing — just enough for `tsc --noEmit` to
// resolve the imports and for the Pulse code to type-check unchanged.
// At runtime, PulsePlay never mounts these as a PBI visual; a wrapper
// component in Cycle E will supply a stub IVisualHost when constructing
// the Visual class.
//
// tsconfig path mapping (see playground/tsconfig.json `paths`) routes
// `import powerbi from "powerbi-visuals-api"` here.

/* eslint-disable @typescript-eslint/no-namespace */

namespace powerbi {
    /** Filter shape compatible with the PBI `applyJsonFilter` argument. */
    export interface IFilter {
        $schema?: string;
        target?: unknown;
        operator?: string;
        values?: unknown[];
        filterType?: number;
    }

    export interface IViewport {
        width: number;
        height: number;
    }

    /** Cell-level primitive values produced by a DataView. */
    export type PrimitiveValue = string | number | boolean | Date | null;

    /** Minimal DataView shape. Pulse reads `.metadata.columns` + the
     *  categorical / table / matrix branches; we declare just the
     *  structural shape it queries. */
    export interface DataView {
        metadata?: {
            columns?: Array<{
                displayName?: string;
                queryName?: string;
                index?: number;
                type?: { numeric?: boolean; dateTime?: boolean; text?: boolean };
                roles?: Record<string, boolean>;
            }>;
            objects?: unknown;
        };
        categorical?: {
            categories?: Array<{
                source?: {
                    displayName?: string;
                    queryName?: string;
                    roles?: Record<string, boolean>;
                    type?: { numeric?: boolean; dateTime?: boolean; text?: boolean };
                };
                values?: PrimitiveValue[];
            }>;
            values?: Array<{
                source?: {
                    displayName?: string;
                    queryName?: string;
                    roles?: Record<string, boolean>;
                    type?: { numeric?: boolean; dateTime?: boolean; text?: boolean };
                };
                values?: PrimitiveValue[];
                highlights?: PrimitiveValue[];
            }>;
        };
        table?: {
            columns?: Array<{ displayName?: string; queryName?: string }>;
            rows?: PrimitiveValue[][];
        };
        single?: { value?: PrimitiveValue };
    }

    /** Filter actions consumed by `IVisualHost.applyJsonFilter`. */
    export enum FilterAction {
        merge = 0,
        remove = 1,
    }

    export namespace extensibility {
        export namespace visual {
            /** The PBI Visual lifecycle interface. Pulse exports a class
             *  that implements this. PulsePlay never invokes it through
             *  the PBI runtime; a Cycle-E wrapper calls update() directly. */
            export interface IVisual {
                update(options: VisualUpdateOptions): void;
                destroy?(): void;
                enumerateObjectInstances?(options: unknown): unknown;
                getFormattingModel?(): unknown;
            }

            /** Host services PBI supplies to the visual at constructor time.
             *  Stub no-ops everywhere that wouldn't otherwise reach the
             *  active BI adapter in PulsePlay. */
            export interface IVisualHost {
                applyJsonFilter(
                    filter: powerbi.IFilter | powerbi.IFilter[] | null,
                    objectName: string,
                    propertyName: string,
                    action: FilterAction,
                ): void;
                createLocalizationManager(): {
                    getDisplayName: (key: string) => string;
                };
                eventService?: unknown;
                colorPalette?: unknown;
                tooltipService?: unknown;
                persistProperties(changes: unknown): void;
                refreshHostData?(): void;
                hostCapabilities?: unknown;
                instanceId?: string;
                launchUrl?(url: string): void;
            }

            export interface VisualConstructorOptions {
                element: HTMLElement;
                host: IVisualHost;
            }

            export interface VisualUpdateOptions {
                dataViews?: powerbi.DataView[];
                viewport?: powerbi.IViewport;
                viewMode?: number;
                editMode?: number;
                isInFocus?: boolean;
                operationKind?: number;
                jsonFilters?: powerbi.IFilter[];
                type?: number;
            }
        }
    }
}

export default powerbi;
