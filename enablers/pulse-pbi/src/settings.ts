import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsModel = formattingSettings.Model;
import FormattingSettingsSimpleCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;

// Shared UI-facing settings contract used by the format pane and React app.
export interface GenieVisualSettings {
    host: string;
    apiBaseUrl: string;
    token: string;
    spaceId: string;
    genieFields: string;
    domainGuidance: string;
    darkMode: boolean;
    showSql: boolean;
    devMode: boolean;
}

// The format pane is intentionally kept as one card so report authors can set up
// the visual from top to bottom without jumping across multiple sections.
class GenieSettingsCard extends FormattingSettingsSimpleCard {
    name = "genieSettings";
    displayName = "Genie Settings";
    visible = true;

    host = new formattingSettings.TextInput({
        name: "host",
        displayName: "Step 1 - Databricks Workspace URL",
        description: "Enter the full Databricks workspace URL for your environment, for example an AWS host like https://dbc-xxxx.cloud.databricks.com or an Azure host like https://adb-<workspace>.<region>.azuredatabricks.net.",
        placeholder: "https://<your-workspace-host>",
        value: ""
    });

    apiBaseUrl = new formattingSettings.TextInput({
        name: "apiBaseUrl",
        displayName: "Optional - API Base URL Override",
        description: "Optional. Use a proxy or local gateway instead of direct browser-to-Databricks calls, for example http://localhost:8787 or https://proxy.company.com. The visual will append the Genie REST path automatically.",
        placeholder: "http://localhost:8787",
        value: ""
    });

    token = new formattingSettings.TextInput({
        name: "token",
        displayName: "Optional - Databricks Access Token",
        description: "Use a Databricks PAT for direct mode. Leave this blank when your proxy or gateway handles authentication server-side.",
        placeholder: "Paste token only for direct mode",
        value: ""
    });

    spaceId = new formattingSettings.TextInput({
        name: "spaceId",
        displayName: "Step 2 - Genie Space ID",
        description: "Paste the Genie room or space identifier used by this report.",
        placeholder: "Genie Space ID",
        value: ""
    });

    genieFields = new formattingSettings.TextArea({
        name: "genieFields",
        displayName: "Optional - Approved Genie Fields For Validation",
        description: "Optional. Paste approved Genie metric-view field names, one per line or comma-separated, so the visual can validate Power BI field bindings.",
        placeholder: "City\nCountry\nRegion\nSales\nProfit",
        value: ""
    });

    domainGuidance = new formattingSettings.TextArea({
        name: "domainGuidance",
        displayName: "Prompt - Domain Guidance",
        description: "Optional. Add business rules or KPI interpretation guidance that should be included with every question.",
        placeholder: "Example: Treat returns as negative sales. Use fiscal quarter naming.",
        value: ""
    });

    darkMode = new formattingSettings.ToggleSwitch({
        name: "darkMode",
        displayName: "Appearance - Dark Mode",
        value: false
    });

    showSql = new formattingSettings.ToggleSwitch({
        name: "showSql",
        displayName: "Validation - Show Generated SQL",
        value: false
    });

    devMode = new formattingSettings.ToggleSwitch({
        name: "devMode",
        displayName: "Developer Mode - Show Setup And Reasoning Tools",
        value: false
    });

    // The order here becomes the authoring flow shown in the format pane.
    slices: FormattingSettingsSlice[] = [
        this.host,
        this.apiBaseUrl,
        this.token,
        this.spaceId,
        this.genieFields,
        this.domainGuidance,
        this.darkMode,
        this.showSql,
        this.devMode
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    genieSettings = new GenieSettingsCard();

    cards = [this.genieSettings];
}

// Convert formatting-model slices into a plain object that the React app can use
// without depending on Power BI formatting APIs in the UI layer.
export function toGenieVisualSettings(model: VisualFormattingSettingsModel): GenieVisualSettings {
    return {
        host: model.genieSettings.host.value,
        apiBaseUrl: model.genieSettings.apiBaseUrl.value,
        token: model.genieSettings.token.value,
        spaceId: model.genieSettings.spaceId.value,
        genieFields: model.genieSettings.genieFields.value,
        domainGuidance: model.genieSettings.domainGuidance.value,
        darkMode: model.genieSettings.darkMode.value,
        showSql: model.genieSettings.showSql.value,
        devMode: model.genieSettings.devMode.value
    };
}
