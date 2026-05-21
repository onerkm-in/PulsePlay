import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import visuals = powerbi.visuals;
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "../style/visual.less";

import { buildContext } from "./contextBuilder";
import { VisualFormattingSettingsModel, toGenieVisualSettings } from "./settings";
import { VisualApp } from "./VisualApp";
import { buildSelectableContext, extractHighlights } from "./visualHelpers";

/**
 * Power BI host bridge for the React-based Genie visual.
 *
 * This class stays intentionally thin: Power BI lifecycle and selection APIs
 * remain here, while the conversational experience lives in the React app.
 */
export class Visual implements IVisual {
    private root: Root;
    private hostElement: HTMLElement;
    private formattingSettingsService: FormattingSettingsService;
    private formattingSettings: VisualFormattingSettingsModel;
    private selectionManager: ISelectionManager;
    private host: powerbi.extensibility.visual.IVisualHost;

    constructor(options: VisualConstructorOptions) {
        this.hostElement = options.element;
        this.root = createRoot(this.hostElement);
        this.formattingSettingsService = new FormattingSettingsService();
        this.formattingSettings = new VisualFormattingSettingsModel();
        this.host = options.host;
        this.selectionManager = options.host.createSelectionManager();
    }

    // Power BI calls update whenever bindings, filters, highlights, or viewport
    // dimensions change. Rebuild the report context and hand it to React here.
    public update(options: VisualUpdateOptions): void {
        const renderStartedAt = Date.now();
        const dataView = options.dataViews?.[0];
        if (dataView) {
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel,
                dataView
            );
        }

        const settings = toGenieVisualSettings(this.formattingSettings);
        const highlights = extractHighlights(dataView);
        const context = buildContext(dataView, highlights);
        const compact = options.viewport.width < 720 || options.viewport.height < 520;
        const selectableContext = buildSelectableContext(dataView, this.host);
        const renderInfo = {
            renderedAt: new Date().toISOString(),
            renderDurationMs: Date.now() - renderStartedAt,
            viewportWidth: options.viewport.width,
            viewportHeight: options.viewport.height
        };

        this.root.render(
            <VisualApp
                settings={settings}
                context={context}
                compact={compact}
                renderInfo={renderInfo}
                selectableContext={selectableContext}
                onSelectContext={async item => {
                    await this.selectionManager.select(item.selectionId, false);
                }}
                onClearContextSelection={async () => {
                    await this.selectionManager.clear();
                }}
            />
        );
    }

    public getFormattingModel(): visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
