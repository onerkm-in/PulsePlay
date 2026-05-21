// Quick prompts stay intentionally generic so the same visual can be reused
// across reports without hard-coding domain-specific language into the UI.
export const QUICK_PROMPTS = [
    "Summarize the current filtered view.",
    "What is driving the current result?",
    "Highlight anomalies I should investigate."
];

export const BEST_PRACTICE_DIMENSIONS = [
    "Region",
    "State",
    "City",
    "Segment",
    "Category",
    "Sub-Category",
    "Order Date"
];

export const BEST_PRACTICE_MEASURES = [
    "PBIGENIE_FILTER",
    "Sales",
    "Profit",
    "Quantity"
];

export const RESPONSE_STANDARD = [
    "Answer from the visible report data and provided context only.",
    "Lead with the direct business answer.",
    "Default to English, but reply in the same language as the user's question when they ask in another language.",
    "Keep the answer concise unless the user asks for more detail.",
    "Mention the scope or filters that affect the answer.",
    "If context is missing, say so instead of guessing."
];
