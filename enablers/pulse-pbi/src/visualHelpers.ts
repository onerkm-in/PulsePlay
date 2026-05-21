import powerbi from "powerbi-visuals-api";
import PrimitiveValue = powerbi.PrimitiveValue;

import { ContextSummary } from "./contextBuilder";
import { GenieClient, GenieFeedbackPayload } from "./genie";
import { GenieVisualSettings } from "./settings";
import { RESPONSE_STANDARD } from "./visualConstants";
import { ChatMessage, FeedbackRating, FieldValidation, SelectableContextItem } from "./visualTypes";

// Lightweight markdown-ish rendering for Genie responses. Supports bold, italic,
// inline code, bullet lists, and line breaks without pulling in a full parser.
export const esc = (value: string): string =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function fmt(value: string): string {
    const escaped = esc(value);
    const lines = escaped.split("\n");
    const out: string[] = [];
    let inList = false;

    for (const line of lines) {
        const trimmed = line.trim();
        const bullet = trimmed.match(/^[-*•]\s+(.*)/);
        if (bullet) {
            if (!inList) { out.push('<ul class="rx-md-list">'); inList = true; }
            out.push(`<li>${inlineFmt(bullet[1])}</li>`);
        } else {
            if (inList) { out.push("</ul>"); inList = false; }
            if (!trimmed) { out.push("<br />"); }
            else { out.push(`<p class="rx-md-p">${inlineFmt(trimmed)}</p>`); }
        }
    }
    if (inList) out.push("</ul>");
    return out.join("");
}

function inlineFmt(text: string): string {
    return text
        .replace(/`([^`]+)`/g, '<code class="rx-md-code">$1</code>')
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>");
}

export function describeScope(context: ContextSummary): string {
    if (context.hasSelection) {
        return "Current report selection";
    }
    if (Object.keys(context.dimensions).length > 0) {
        return "Current filtered view";
    }
    return "Visible dataset";
}

// Build the final context block sent to Genie. Domain guidance stays separated
// from the Power BI-derived context so report authors can inspect both clearly.
export function buildFullContext(context: ContextSummary, domainContext: string): string {
    const parts: string[] = [];
    if (domainContext.trim()) {
        parts.push(`[Domain Context]\n${domainContext.trim()}`);
    }
    parts.push(context.contextText);
    return parts.join("\n\n");
}

export function buildGenieRequest(question: string, contextText: string): string {
    const compactContext = contextText.trim();

    return [
        "[Instructions]",
        ...RESPONSE_STANDARD.map(item => `- ${item}`),
        compactContext ? `Context:\n${compactContext}` : "",
        `Question: ${question}`
    ]
        .filter(Boolean)
        .join("\n\n");
}

export function formatGenieProgress(status: string): string {
    switch (status.toUpperCase()) {
        case "ASKING_AI":
            return "Asking AI";
        case "PENDING_WAREHOUSE":
            return "Waiting for SQL warehouse";
        case "EXECUTING_QUERY":
            return "Running SQL query";
        case "COMPLETED":
            return "Completed";
        case "FAILED":
            return "Failed";
        case "CANCELLED":
            return "Cancelled";
        default:
            return status
                .toLowerCase()
                .split("_")
                .map(part => part.charAt(0).toUpperCase() + part.slice(1))
                .join(" ");
    }
}

// The visual validates bound Power BI fields against the configured metric-view
// fields so authors can catch mapping issues before trusting the assistant output.
export function validateAssignedFields(context: ContextSummary, genieFieldsInput: string): FieldValidation {
    const assignedFields = [
        ...Object.keys(context.dimensions),
        ...Object.keys(context.measures)
    ];

    const genieFields = genieFieldsInput
        .split(/[\n,;]+/)
        .map(item => item.trim())
        .filter(Boolean);

    const normalizedGenieFields = new Map(genieFields.map(field => [normalizeFieldName(field), field]));
    const matchedFields: string[] = [];
    const missingFields: string[] = [];

    assignedFields.forEach(field => {
        if (normalizedGenieFields.has(normalizeFieldName(field))) {
            matchedFields.push(field);
        } else {
            missingFields.push(field);
        }
    });

    return {
        assignedFields,
        genieFields,
        matchedFields,
        missingFields,
        hasConfiguredGenieFields: genieFields.length > 0,
        hasAssignedFields: assignedFields.length > 0,
        hasAnyMatch: matchedFields.length > 0
    };
}

// This is a configuration-readiness check, not a live connectivity test.
export function getConfigIssues(settings: GenieVisualSettings): string[] {
    const issues: string[] = [];
    const hasProxyUrl = settings.apiBaseUrl.trim().length > 0;

    if (!hasProxyUrl) {
        if (!settings.host.trim()) {
            issues.push("workspace URL");
        } else if (!isValidWorkspaceUrl(settings.host)) {
            issues.push("workspace URL with https://");
        }
    } else if (!isValidApiBaseUrl(settings.apiBaseUrl)) {
        issues.push("API base URL");
    }

    if (!hasProxyUrl && !settings.token.trim()) {
        issues.push("access token");
    }
    if (!settings.spaceId.trim()) {
        issues.push("Genie Space ID");
    }
    return issues;
}

export function hasValidConnectionEndpoint(settings: GenieVisualSettings): boolean {
    if (settings.apiBaseUrl.trim()) {
        return isValidApiBaseUrl(settings.apiBaseUrl);
    }

    return isValidWorkspaceUrl(settings.host);
}

// These factories keep React event handlers focused on interaction flow instead
// of repeating the same object construction in multiple branches.
export function createGenieClient(settings: GenieVisualSettings): GenieClient {
    return new GenieClient({
        host: settings.host,
        apiBaseUrl: settings.apiBaseUrl,
        token: settings.token,
        spaceId: settings.spaceId
    });
}

export function createUserMessage(content: string): ChatMessage {
    return {
        id: `user-${Date.now()}`,
        role: "user",
        content
    };
}

export function createMessageMeta(
    conversationId: string | null,
    messageId: string | null | undefined,
    scope: string,
    contextLines: number,
    trace: string[],
    question: string
): NonNullable<ChatMessage["meta"]> {
    return {
        conversationId,
        messageId,
        scope,
        contextLines,
        filterCount: 0,
        trace,
        question
    };
}

export function buildFeedbackPayload(message: ChatMessage, rating: FeedbackRating): GenieFeedbackPayload {
    return {
        conversationId: message.meta?.conversationId,
        messageId: message.meta?.messageId,
        rating,
        comment: message.feedback?.comment.trim(),
        question: message.meta?.question,
        answer: message.content,
        sql: message.sql,
        trace: message.meta?.trace,
        scope: message.meta?.scope
    };
}

export function extractHighlights(dataView: powerbi.DataView | undefined): PrimitiveValue[] | null {
    const series = dataView?.categorical?.values;
    if (!series) {
        return null;
    }

    for (const valueSeries of series) {
        if (valueSeries.highlights && valueSeries.highlights.length > 0) {
            return valueSeries.highlights as PrimitiveValue[];
        }
    }

    return null;
}

// Outbound interaction is only possible for categorical fields Power BI exposes
// with identities. Those identities become the clickable chips in the UI.
export function buildSelectableContext(
    dataView: powerbi.DataView | undefined,
    host: powerbi.extensibility.visual.IVisualHost
): SelectableContextItem[] {
    const categories = dataView?.categorical?.categories;
    if (!categories?.length) {
        return [];
    }

    const items: SelectableContextItem[] = [];
    const seen = new Set<string>();

    categories.forEach(category => {
        const field = category.source?.displayName ?? "Dimension";
        const values = category.values ?? [];
        const identities = category.identity ?? [];

        values.forEach((value, index) => {
            if (value === null || value === undefined || !identities[index]) {
                return;
            }

            const displayValue = String(value);
            const key = `${field}::${displayValue}`;
            if (seen.has(key)) {
                return;
            }

            seen.add(key);
            items.push({
                id: key,
                field,
                value: displayValue,
                selectionId: host.createSelectionIdBuilder()
                    .withCategory(category, index)
                    .createSelectionId()
            });
        });
    });

    return items.slice(0, 18);
}

function normalizeFieldName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isValidWorkspaceUrl(value: string): boolean {
    return /^https:\/\/[^/\s]+/i.test(value.trim());
}

function isValidApiBaseUrl(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) {
        return false;
    }

    if (/^https:\/\/[^/\s]+/i.test(trimmed)) {
        return true;
    }

    return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(trimmed);
}
