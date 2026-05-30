import type { BICapabilities } from "../../playground/src/biPanel/BIAdapter";

export interface NativeRendererCapabilities {
    authoring: false;
    dragLayout: false;
    crossFilter: false;
    drill: false;
    semanticModeling: false;
    liveRefresh: false;
    permissions: false;
    queryExecution: false;
    persistence: false;
}

export const NATIVE_BI_CAPABILITIES: Readonly<BICapabilities> = Object.freeze({
    canNavigatePages: false,
    canApplyFilters: false,
    canExport: false,
    canRefresh: false,
    canFullscreen: false,
    requiresContainerEl: true,
});

export const NATIVE_RENDERER_CAPABILITIES: Readonly<NativeRendererCapabilities> = Object.freeze({
    authoring: false,
    dragLayout: false,
    crossFilter: false,
    drill: false,
    semanticModeling: false,
    liveRefresh: false,
    permissions: false,
    queryExecution: false,
    persistence: false,
});

