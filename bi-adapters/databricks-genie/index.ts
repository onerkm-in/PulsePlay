// bi-adapters/databricks-genie/index.ts
//
// Databricks Genie Space iframe adapter. Databricks documents Genie Space
// embedding as author-generated iframe code from the Share dialog; PulsePlay
// therefore treats the iframe src as the primary contract instead of inventing
// a private URL scheme.

import { GenericIframeAdapter } from "../generic-iframe/index";
import type { BIEmbedConfig } from "../../playground/src/biPanel/BIAdapter";
import { buildGenieEmbedUrl, type GenieConfig } from "./embedUrl";

// Re-export the pure URL builder so existing importers (the adapter test,
// any future callers) keep resolving it from the adapter entry point. The
// implementation now lives in ./embedUrl so non-adapter callers can import
// it without pulling the whole adapter into the main bundle.
export { buildGenieEmbedUrl } from "./embedUrl";
export type { GenieConfig } from "./embedUrl";

export class DatabricksGenieAdapter extends GenericIframeAdapter {
    readonly vendor = "databricks-genie";
    readonly displayName = "Databricks Genie";
    protected defaultSandbox = "allow-scripts allow-same-origin allow-forms allow-popups";

    async mount(containerEl: HTMLElement | null, embedConfig: BIEmbedConfig): Promise<void> {
        const cfg = embedConfig as GenieConfig;
        const resolvedUrl = buildGenieEmbedUrl(cfg);
        return super.mount(containerEl, {
            ...cfg,
            url: resolvedUrl,
            title: typeof cfg.title === "string" ? cfg.title : "Databricks Genie Space",
            allow: "clipboard-write",
        });
    }
}
