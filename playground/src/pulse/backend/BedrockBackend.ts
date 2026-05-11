/**
 * BedrockBackend — SingleSpaceBackend that proxies to AWS Bedrock
 * Knowledge Bases (RetrieveAndGenerate API) via the proxy's `/bedrock/*`
 * routes. Wired against the shared ProxyChatBackend so the only
 * Bedrock-specific bit is the route prefix and label.
 *
 * Profile fields the proxy expects (set in proxy/config.json):
 *   bedrockRegion          — e.g. us-east-1
 *   bedrockKnowledgeBaseId — KB ID from AWS console
 *   bedrockModelArn        — model ARN
 *   bedrockAccessKeyId     — AWS access key
 *   bedrockSecretAccessKey — AWS secret key
 *
 * For production deployments, prefer IAM-role auth via Lambda or API
 * Gateway over static keys in config.json.
 */

import { GenieConfig } from "../genie";
import { ProxyChatBackend } from "./proxyChatBackend";

export class BedrockBackend extends ProxyChatBackend {
    constructor(config: GenieConfig) {
        super(config, "bedrock", "AWS Bedrock");
    }
}
