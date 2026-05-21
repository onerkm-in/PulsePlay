import powerbiVisualsConfigs from "eslint-plugin-powerbi-visuals";

export default [
    powerbiVisualsConfigs.configs.recommended,
    {
        ignores: ["node_modules/**", "dist/**", ".vscode/**", ".tmp/**"],
    },
    {
        rules: {
            // Disabled: we use innerHTML intentionally with sanitized content in a trusted PBI context
            "powerbi-visuals/no-inner-outer-html": "off",
        },
    },
];