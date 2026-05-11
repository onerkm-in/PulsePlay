export type TrendDirection = "up" | "down" | "neutral";
export type Tone = "good" | "warn" | "bad" | "neutral";

export function normaliseDirectionalGlyphs(text: string): string {
    if (!text) return text;
    return text
        .replace(/[↑⬆↗⤴]/g, "▲")
        .replace(/[↓⬇↘⤵]/g, "▼")
        .replace(/▲\s*\/\s*▼/g, "↔")
        .replace(/▼\s*\/\s*▲/g, "↔")
        .replace(/(?:▲\s*){2,}/g, "▲ ")
        .replace(/(?:▼\s*){2,}/g, "▼ ")
        .replace(/(?:↔\s*){2,}/g, "↔ ")
        .replace(/\s+([,.;:])/g, "$1");
}

export function stripLeadingDirectionGlyphs(text: string): string {
    return normaliseDirectionalGlyphs(text).replace(/^[▲▼↔]\s*/, "").trim();
}

export function getTrendDirectionFromDelta(raw: string): TrendDirection {
    const clean = normaliseDirectionalGlyphs(raw.replace(/\*\*/g, "").trim());
    if (!clean) return "neutral";
    if (/▲|\+/.test(clean)) return "up";
    if (/▼|^-/.test(clean)) return "down";
    return "neutral";
}

export function getStatusTone(raw: string): Tone {
    const clean = raw.replace(/[*`]/g, "").trim();
    if (!clean) return "neutral";
    const lower = clean.toLowerCase();

    if (
        /🟢|✅|✔|green/.test(clean) ||
        /\b(on[-\s]?track|good|healthy|positive|strong|improving|improved|favo[u]?rable|within target|up)\b/.test(lower)
    ) {
        return "good";
    }
    if (
        /🟡|⚠|amber|yellow/.test(clean) ||
        /\b(at[-\s]?risk|watch|caution|flat|stable|neutral|mixed|review)\b/.test(lower)
    ) {
        return "warn";
    }
    if (
        /🔴|❌|✖|red/.test(clean) ||
        /\b(off[-\s]?track|bad|critical|declining|weak|down|alert|breach|unfavo[u]?rable|worse|worsening)\b/.test(lower)
    ) {
        return "bad";
    }
    return "neutral";
}

export function getSemanticTone(direction: TrendDirection, statusTone: Tone): Tone {
    if (statusTone !== "neutral") return statusTone;
    if (direction === "up") return "good";
    if (direction === "down") return "bad";
    return "neutral";
}

export function getStatusA11y(tone: Tone): { title: string; ariaLabel: string } {
    switch (tone) {
        case "good": return { title: "Performance is on track", ariaLabel: "KPI status: on track" };
        case "warn": return { title: "Performance needs review", ariaLabel: "KPI status: needs review" };
        case "bad": return { title: "Performance is off track", ariaLabel: "KPI status: off track" };
        default: return { title: "Performance status", ariaLabel: "KPI status: neutral" };
    }
}

export function getDeltaPillA11y(direction: TrendDirection, tone: Tone): { title: string; ariaLabel: string } {
    if (direction === "up" && tone === "bad") {
        return { title: "Increased from prior period", ariaLabel: "KPI increased; higher is unfavorable for this metric" };
    }
    if (direction === "down" && tone === "good") {
        return { title: "Decreased from prior period", ariaLabel: "KPI decreased; lower is favorable for this metric" };
    }
    if (direction === "down") {
        return { title: "Decreased from prior period", ariaLabel: "KPI decreased from the prior period" };
    }
    if (direction === "up") {
        return { title: "Increased from prior period", ariaLabel: "KPI increased from the prior period" };
    }
    return { title: "No clear prior-period change", ariaLabel: "KPI change is neutral or unavailable" };
}

export function stripStatusGlyphs(text: string): string {
    return text.replace(/[🟢🟡🔴✅❌✔✖⚠]/g, "").trim();
}
