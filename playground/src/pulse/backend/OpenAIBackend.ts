/**
 * OpenAIBackend — SingleSpaceBackend that proxies to Azure OpenAI Chat
 * Completions via the proxy's `/openai/*` routes. Wired against the
 * shared ProxyChatBackend so the only OpenAI-specific bit is the route
 * prefix and label.
 *
 * Profile fields the proxy expects (set in proxy/config.json):
 *   azureOpenAiEndpoint     — e.g. https://<resource>.openai.azure.com
 *   azureOpenAiKey          — Azure subscription key
 *   azureOpenAiDeployment   — model deployment name (e.g. gpt-4o)
 *   azureOpenAiApiVersion   — API version (default: 2024-08-01-preview)
 */

import { GenieConfig } from "../genie";
import { ProxyChatBackend } from "./proxyChatBackend";

export class OpenAIBackend extends ProxyChatBackend {
    constructor(config: GenieConfig) {
        super(config, "openai", "Azure OpenAI");
    }
}
