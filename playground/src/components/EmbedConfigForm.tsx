import { useState } from "react";
import type { BIEmbedConfig } from "../biPanel/BIAdapter";

// Vendor-specific config form. v0 is intentionally minimal — a single
// URL field for generic-iframe, and per-vendor tooltip notes for the
// adapters that need real credentials. v1 will swap in proper forms
// (PBI: workspace + report + embed-token, Tableau: server URL + ticket,
// Qlik: tenant + app, Looker: signed URL).
interface EmbedConfigFormProps {
    vendor: string;
    value: BIEmbedConfig;
    onChange: (next: BIEmbedConfig) => void;
}

export function EmbedConfigForm(props: EmbedConfigFormProps) {
    const [url, setUrl] = useState<string>((props.value.url as string) || "");

    const apply = () => {
        if (!url.trim()) return;
        props.onChange({ url: url.trim() });
    };

    const placeholder = (() => {
        switch (props.vendor) {
            case "powerbi":   return "https://app.powerbi.com/reportEmbed?reportId=… (or use Setup → PBI Embed Token)";
            case "tableau":   return "https://server/views/Workbook/View";
            case "qlik":      return "https://tenant.qlikcloud.com/sense/app/<id>/sheet/<id>";
            case "looker":    return "https://looker.example.com/embed/dashboards/123";
            default:          return "https://any-bi-url.example.com/embed/...";
        }
    })();

    return (
        <section className="pp-embed-config">
            <label htmlFor="pp-embed-url" className="pp-embed-config__label">Embed URL</label>
            <input
                id="pp-embed-url"
                type="url"
                className="pp-embed-config__input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={apply}
                onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
                placeholder={placeholder}
            />
            <button type="button" className="pp-embed-config__apply" onClick={apply}>
                Load
            </button>
            <p className="pp-embed-config__hint">
                v0: paste any embed URL. v1 will add per-vendor credential helpers + token issuance via the proxy.
            </p>
        </section>
    );
}
