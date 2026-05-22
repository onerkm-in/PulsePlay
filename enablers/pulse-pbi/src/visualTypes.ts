import powerbi from "powerbi-visuals-api";
import { GenieVisualSettings } from "./settings";
import { ContextSummary } from "./contextBuilder";

import ISelectionId = powerbi.visuals.ISelectionId;

export type ChatRole = "assistant" | "user" | "system";
export type FeedbackRating = "up" | "down";
export type QueryResultData = { columns: string[]; rows: any[][] };

export interface SelectableContextItem {
    id: string;
    field: string;
    value: string;
    selectionId: ISelectionId;
}

export interface ChatMessage {
    id: string;
    role: ChatRole;
    content: string;
    sql?: string;
    data?: QueryResultData;
    queryTitle?: string;
    followUpQuestions?: string[];
    feedback?: {
        rating?: FeedbackRating;
        comment: string;
        submitted: boolean;
        error?: string;
    };
    meta?: {
        conversationId?: string | null;
        messageId?: string | null;
        scope: string;
        contextLines: number;
        filterCount: number;
        trace?: string[];
        question?: string;
    };
}

export interface FieldValidation {
    assignedFields: string[];
    genieFields: string[];
    matchedFields: string[];
    missingFields: string[];
    hasConfiguredGenieFields: boolean;
    hasAssignedFields: boolean;
    hasAnyMatch: boolean;
}

export interface AppProps {
    settings: GenieVisualSettings;
    context: ContextSummary;
    compact: boolean;
    renderInfo: RenderInfo;
    selectableContext: SelectableContextItem[];
    onSelectContext: (item: SelectableContextItem) => Promise<void>;
    onClearContextSelection: () => Promise<void>;
}

export interface RenderInfo {
    renderedAt: string;
    renderDurationMs: number;
    viewportWidth: number;
    viewportHeight: number;
}

export interface RequestMetrics {
    startedAt: string;
    finishedAt?: string;
    totalMs?: number;
    progressEvents: number;
    promptChars: number;
}
