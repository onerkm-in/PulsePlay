/**
 * setupStep5Validation.ts
 *
 * Validation engine + presets registry for Step 5 of the in-visual Setup
 * tab. Validation is purely synchronous structural checks today — async
 * probes (HEAD against supervisorEndpoint, ping against multi-space slots)
 * are reserved for a follow-up commit and surface through the same
 * ValidationResult shape so the UI doesn't need to branch on async vs sync.
 *
 * The presets registry exposes named JSON blobs that authors can apply to
 * a section in one click ("Demo defaults" / "Strict guardrails" / "HSE
 * 4-space"). Presets are partial — they only set the fields they care
 * about; everything else stays as-is.
 */

import { SetupDraft } from "./setupDraft";
import { parseMetricDirectionsJson } from "./rendering/metricDirections";

export type ValidationSeverity = "ok" | "warn" | "err" | "info";

export type FieldValidation = {
    name: keyof SetupDraft;
    severity: ValidationSeverity;
    message: string;
};

export type SectionValidation = {
    section: "0" | "A" | "B" | "C" | "H" | "D" | "E" | "F" | "G";
    overall: ValidationSeverity;
    fields: FieldValidation[];
};

// ────────────────────────────────────────────────────────────────────────
// Per-section validators. Each returns a list of FieldValidation entries.
// `severity: "ok"` is omitted when the field is silently fine — only
// non-trivial findings are surfaced.
// ────────────────────────────────────────────────────────────────────────

function validateSection0(d: SetupDraft): FieldValidation[] {
    const out: FieldValidation[] = [];
    if (d.enabledFeatures === "insightsOnly" && !(d.insightsPrompt || "").trim()) {
        out.push({
            name: "insightsPrompt",
            severity: "info",
            message: "AI Insights will use the default 5-stage prompt — consider customising in Section A for a more focused experience.",
        });
    }
    if (d.enabledFeatures === "chatOnly" && d.insightsCacheTtlMinutes !== 30) {
        out.push({
            name: "insightsCacheTtlMinutes",
            severity: "warn",
            message: "Insights cache TTL has been changed but Chat-only mode disables AI Insights. The setting has no effect.",
        });
    }
    return out;
}

// IDEA-039 Codex Review #2 C2 — length caps for the prompt-affecting author
// fields. Without these, an author can paste an 80 KB transcript into Domain
// Guidance and silently blow the model's context window. Errors at >2× cap;
// warnings at the soft cap so authors can still ship if they accept the risk.
const LEN_CAP_DOMAIN_GUIDANCE = 8000;
const LEN_CAP_INSIGHTS_DOMAIN_GUIDANCE = 8000;
const LEN_CAP_METRIC_DIRECTION_RULES = 4000;
const LEN_CAP_METRIC_DIRECTIONS_JSON = 8000;
const LEN_CAP_CUSTOM_SECTIONS = 12000;

function pushLengthCap(out: FieldValidation[], name: keyof SetupDraft, label: string, value: string, cap: number): void {
    const len = value.length;
    if (len <= cap) return;
    if (len > cap * 2) {
        out.push({
            name,
            severity: "err",
            message: `${label} is ${len.toLocaleString()} characters — over twice the ${cap.toLocaleString()} cap. Trim before applying; the request will exceed the model context window.`,
        });
    } else {
        out.push({
            name,
            severity: "warn",
            message: `${label} is ${len.toLocaleString()} characters — past the recommended ${cap.toLocaleString()} cap. Latency rises and earlier rules may be ignored.`,
        });
    }
}

function validateSectionA(d: SetupDraft): FieldValidation[] {
    const out: FieldValidation[] = [];
    pushLengthCap(out, "domainGuidance", "Domain guidance", d.domainGuidance || "", LEN_CAP_DOMAIN_GUIDANCE);
    pushLengthCap(out, "insightsDomainGuidance", "Insights domain guidance", d.insightsDomainGuidance || "", LEN_CAP_INSIGHTS_DOMAIN_GUIDANCE);
    pushLengthCap(out, "metricDirectionRules", "Metric direction rules", d.metricDirectionRules || "", LEN_CAP_METRIC_DIRECTION_RULES);
    pushLengthCap(out, "insightsMetricDirections", "Metric direction map", d.insightsMetricDirections || "", LEN_CAP_METRIC_DIRECTIONS_JSON);
    pushLengthCap(out, "insightsCustomSections", "Insights custom sections", d.insightsCustomSections || "", LEN_CAP_CUSTOM_SECTIONS);
    // Wave 30 cycle 6 — section-name collision check. A custom section named
    // HEADLINE / KPI SNAPSHOT / TRENDS / RISKS / RECOMMENDED ACTIONS would
    // emit two ## blocks of the same title in the rendered Insights output
    // (one universal, one custom). Warn the author at validation time.
    const RESERVED_SECTION_NAMES = new Set(["HEADLINE", "KPI SNAPSHOT", "TRENDS", "RISKS", "RECOMMENDED ACTIONS", "OPPORTUNITIES"]);
    const customRaw = (d.insightsCustomSections || "").trim();
    if (customRaw) {
        try {
            const parsed = JSON.parse(customRaw);
            if (Array.isArray(parsed)) {
                const collisions: string[] = [];
                for (const entry of parsed) {
                    const name = String(entry?.name || "").trim().toUpperCase();
                    if (name && RESERVED_SECTION_NAMES.has(name)) collisions.push(name);
                }
                if (collisions.length) {
                    out.push({
                        name: "insightsCustomSections",
                        severity: "warn",
                        message: `Custom section name${collisions.length === 1 ? "" : "s"} ${collisions.join(", ")} collide${collisions.length === 1 ? "s" : ""} with a universal stage — the rendered output will show two cards with the same title. Rename to avoid duplication.`,
                    });
                }
            }
        } catch { /* JSON parse errors handled elsewhere */ }
    }
    const metricMap = (d.insightsMetricDirections || "").trim();
    if (metricMap) {
        try {
            const parsed = JSON.parse(metricMap);
            const validRules = parseMetricDirectionsJson(metricMap);
            if (!Array.isArray(parsed)) {
                out.push({
                    name: "insightsMetricDirections",
                    severity: "err",
                    message: "Metric direction map must be a JSON array.",
                });
            } else if (parsed.length > 0 && validRules.length === 0) {
                out.push({
                    name: "insightsMetricDirections",
                    severity: "err",
                    message: "Metric direction map has no valid rules. Each rule needs at least a name and higherIsBetter.",
                });
            }
        } catch {
            out.push({
                name: "insightsMetricDirections",
                severity: "err",
                message: "Metric direction map is not valid JSON.",
            });
        }
    }
    if (d.insightsCacheTtlMinutes < 0) {
        out.push({
            name: "insightsCacheTtlMinutes",
            severity: "err",
            message: "Cache TTL must be 0 or positive.",
        });
    }
    return out;
}

function validateSectionB(d: SetupDraft): FieldValidation[] {
    const out: FieldValidation[] = [];
    if (!d.kbEnabled && (d.kbChartRules || d.kbStatRules || d.kbReportingRules)) {
        out.push({
            name: "kbEnabled",
            severity: "info",
            message: "Sub-rules are ON but the master toggle is OFF — none of the rules below will reach AI for BI.",
        });
    }
    return out;
}

function validateSectionC(d: SetupDraft): FieldValidation[] {
    const out: FieldValidation[] = [];
    if (d.authMode === "oauthObo" && !d.apiBaseUrl.trim()) {
        out.push({
            name: "authMode",
            severity: "warn",
            message: "OAuth on-behalf-of requires a proxy with token-exchange support. Direct mode (no Proxy URL) cannot do OBO.",
        });
    }
    if ((d.ucRowFiltersEnforced || d.ucColumnMasksEnforced) && d.authMode === "sharedPat") {
        out.push({
            name: "authMode",
            severity: "info",
            message: "UC row/column governance is declared but auth is Shared PAT — gating applies service-account-wide, not per-viewer. Combine with OAuth OBO for per-user filters.",
        });
    }
    return out;
}

function validateSectionD(d: SetupDraft): FieldValidation[] {
    const out: FieldValidation[] = [];
    if (!d.multiSpaceEnabled) return out;
    const visible = Math.min(Math.max(d.multiSpaceCount, 1), 9);
    for (let n = 2; n <= 1 + visible; n++) {
        const label = String(d[`space${n}Label` as keyof SetupDraft] ?? "").trim();
        const profile = String(d[`space${n}AssistantProfile` as keyof SetupDraft] ?? "").trim();
        const sid = String(d[`space${n}SpaceId` as keyof SetupDraft] ?? "").trim();
        if (label && !profile && !sid) {
            out.push({
                name: `space${n}Label` as keyof SetupDraft,
                severity: "warn",
                message: `Space ${n} has a label but no profile or Space ID. Set one for the slot to be reachable at runtime.`,
            });
        }
    }
    return out;
}

function validateSectionE(d: SetupDraft): FieldValidation[] {
    const out: FieldValidation[] = [];
    const ep = d.supervisorEndpoint.trim();
    if (ep && !ep.startsWith("https://")) {
        out.push({
            name: "supervisorEndpoint",
            severity: "err",
            message: "Supervisor endpoint must be HTTPS.",
        });
    }
    if (ep && !ep.includes("/serving-endpoints/")) {
        out.push({
            name: "supervisorEndpoint",
            severity: "warn",
            message: "Supervisor endpoint URL does not contain '/serving-endpoints/'. Confirm this is a Mosaic AI serving endpoint.",
        });
    }
    return out;
}

function validateSectionG(d: SetupDraft): FieldValidation[] {
    const out: FieldValidation[] = [];
    const checkJsonArray = (name: keyof SetupDraft, label: string) => {
        const raw = String(d[name] ?? "").trim();
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                out.push({ name, severity: "err", message: `${label} JSON must be an array.` });
                return;
            }
            for (const item of parsed) {
                if (!item.id || !/^[0-9a-f]{32}$/.test(item.id)) {
                    out.push({ name, severity: "warn", message: `${label} contains an entry with a missing or malformed id (must be 32-char lowercase hex).` });
                    return;
                }
            }
        } catch (e) {
            out.push({ name, severity: "err", message: `${label} JSON parse failed: ${(e as Error).message}` });
        }
    };
    checkJsonArray("genieTextInstructionsJson", "Text instructions");
    checkJsonArray("genieSampleQuestionsJson", "Sample questions");
    checkJsonArray("genieExampleSqlsJson", "Example SQLs");
    return out;
}

function validateSectionF(d: SetupDraft): FieldValidation[] {
    const out: FieldValidation[] = [];
    const enabledCount = [d.devMode, d.showSql, d.showTrace, d.showGuidedFilters].filter(Boolean).length;
    if (enabledCount > 0) {
        out.push({
            name: "devMode",
            severity: "info",
            message: `${enabledCount} dev surface toggle${enabledCount === 1 ? "" : "s"} ON — turn all OFF before publishing to end users.`,
        });
    }
    return out;
}

// Wave 30 cycle 5 — Section H structural pre-checks. The CTE preamble is
// the highest-blast-radius field in setup (injected into every Genie
// request), so flag obvious syntax / variable-mismatch issues before save.
function validateSectionH(d: SetupDraft): FieldValidation[] {
    const out: FieldValidation[] = [];
    const cte = String((d as any).sqlCtePreamble || "").trim();
    const rlsHint = !!(d as any).sqlRlsHintEnabled;
    if (!cte) return out;

    if (!/^with\b/i.test(cte)) {
        out.push({
            name: "sqlCtePreamble" as keyof SetupDraft,
            severity: "warn",
            message: "CTE preamble should start with WITH (case-insensitive). Genie will append a SELECT after this — non-WITH prefixes usually break.",
        });
    }
    if (/;\s*$/.test(cte)) {
        out.push({
            name: "sqlCtePreamble" as keyof SetupDraft,
            severity: "warn",
            message: "CTE preamble ends with a semicolon. Remove it — the runtime concatenates SELECT… after, which would produce a syntax error.",
        });
    }
    const tokens = (cte.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) || []).map(t => t.replace(/\{\{|\}\}|\s/g, ""));
    const documented = new Set(["role", "user", "viewer"]);
    const undocumented = tokens.filter(t => !documented.has(t));
    if (undocumented.length) {
        out.push({
            name: "sqlCtePreamble" as keyof SetupDraft,
            severity: "warn",
            message: `Unknown template variables: ${undocumented.slice(0, 3).join(", ")}. Documented ones are {{role}}, {{user}}, {{viewer}}.`,
        });
    }
    if (tokens.includes("role") && !rlsHint) {
        out.push({
            name: "sqlRlsHintEnabled" as keyof SetupDraft,
            severity: "info",
            message: "CTE references {{role}} but RLS hint is OFF. The viewer role will not be injected at runtime.",
        });
    }
    if (!tokens.includes("role") && rlsHint) {
        out.push({
            name: "sqlRlsHintEnabled" as keyof SetupDraft,
            severity: "info",
            message: "RLS hint is ON but CTE never references {{role}}. The injection will be a no-op until you reference the variable.",
        });
    }
    return out;
}

const VALIDATORS: Record<SectionValidation["section"], (d: SetupDraft) => FieldValidation[]> = {
    "0": validateSection0,
    "A": validateSectionA,
    "B": validateSectionB,
    "C": validateSectionC,
    "H": validateSectionH,
    "D": validateSectionD,
    "E": validateSectionE,
    "F": validateSectionF,
    "G": validateSectionG,
};

/**
 * Run validation for a single section. Returns the per-field findings plus
 * an `overall` severity computed from the worst finding (err > warn > info > ok).
 */
export function validateSection(section: SectionValidation["section"], draft: SetupDraft): SectionValidation {
    const fields = VALIDATORS[section](draft);
    const order: ValidationSeverity[] = ["err", "warn", "info", "ok"];
    let overall: ValidationSeverity = "ok";
    for (const sev of order) {
        if (fields.some(f => f.severity === sev)) {
            overall = sev;
            break;
        }
    }
    return { section, overall, fields };
}

/**
 * Run validation for every section. Used by the step-level Validate-all
 * button (added in 48.7) and by the Apply path to refuse the persist call
 * when the overall result is "err".
 */
export function validateAll(draft: SetupDraft): SectionValidation[] {
    return (["0", "A", "B", "C", "D", "E", "F", "G"] as const).map(s => validateSection(s, draft));
}

// ────────────────────────────────────────────────────────────────────────
// Presets registry — partial drafts that authors can apply per-section
// in one click. Presets only set the fields they care about; the rest
// of the draft is untouched.
// ────────────────────────────────────────────────────────────────────────

export type Preset = {
    id: string;
    section: SectionValidation["section"];
    label: string;
    description: string;
    /** Partial draft to apply on click. */
    apply: Partial<SetupDraft>;
};

export const STEP5_PRESETS: Preset[] = [
    // Section A presets
    {
        id: "A.demo",
        section: "A",
        label: "Demo defaults",
        description: "Open exploration: domain guidance blank, default insights prompt, 30-min cache, context ON.",
        apply: {
            genieFields: "",
            domainGuidance: "",
            sendContextToGenie: true,
            insightsPrompt: "",
            insightsCacheTtlMinutes: 30,
            refreshInsights: false,
        },
    },
    {
        id: "A.strict",
        section: "A",
        label: "Strict guardrails",
        description: "Disable report context, focus AI Insights on KPI accuracy, short 5-min cache.",
        apply: {
            sendContextToGenie: false,
            insightsPrompt: "Summarise the bound KPIs accurately. Flag every assumption you make. Do NOT speculate beyond what the data shows.",
            insightsCacheTtlMinutes: 5,
            refreshInsights: false,
        },
    },
    {
        id: "A.exec",
        section: "A",
        label: "Executive briefing",
        description: "BLUF-style insights focused on action and risk, 2-hour cache for stable dashboards.",
        apply: {
            insightsPrompt: "Lead with the bottom line. Highlight the 3 most important trends, the largest risks, and the recommended actions in plain business language. Avoid technical jargon.",
            insightsCacheTtlMinutes: 120,
            sendContextToGenie: true,
        },
    },

    // Section B presets
    {
        id: "B.full",
        section: "B",
        label: "All KB rules ON",
        description: "Inject every analytics rule set — chart selection, statistical standards, reporting principles. Default for new reports.",
        apply: {
            kbEnabled: true,
            kbChartRules: true,
            kbStatRules: true,
            kbReportingRules: true,
        },
    },
    {
        id: "B.minimal",
        section: "B",
        label: "Minimal — rules off",
        description: "Disable the embedded KB. Use when your domain guidance already covers chart and stats best practices.",
        apply: {
            kbEnabled: false,
            kbChartRules: false,
            kbStatRules: false,
            kbReportingRules: false,
        },
    },
    {
        id: "B.stat-only",
        section: "B",
        label: "Statistical correctness only",
        description: "Keep statistical guardrails (mean vs median, YoY math) but skip chart and storytelling rules.",
        apply: {
            kbEnabled: true,
            kbChartRules: false,
            kbStatRules: true,
            kbReportingRules: false,
        },
    },

    // Section C presets
    {
        id: "C.shared-open",
        section: "C",
        label: "Shared PAT — open",
        description: "Service-identity PAT, no UC governance declared. Suitable when all viewers see the same data.",
        apply: {
            authMode: "sharedPat",
            ucRowFiltersEnforced: false,
            ucColumnMasksEnforced: false,
        },
    },
    {
        id: "C.uc-service",
        section: "C",
        label: "Shared PAT + UC governance",
        description: "Service identity but UC row filters and column masks are declared as active upstream.",
        apply: {
            authMode: "sharedPat",
            ucRowFiltersEnforced: true,
            ucColumnMasksEnforced: true,
        },
    },
    {
        id: "C.obo-full",
        section: "C",
        label: "OBO + UC enforced (per-user)",
        description: "OAuth on-behalf-of with full UC governance. Strongest per-user posture; requires proxy v2.",
        apply: {
            authMode: "oauthObo",
            ucRowFiltersEnforced: true,
            ucColumnMasksEnforced: true,
        },
    },

    // Section D presets
    {
        id: "D.single",
        section: "D",
        label: "Single space",
        description: "Disable multi-space; use only the primary connection from Steps 1-3.",
        apply: {
            multiSpaceEnabled: false,
        },
    },
    {
        id: "D.hse-4space",
        section: "D",
        label: "HSE 4-space demo",
        description: "Sales, Customer + Returns, Targets + HSE, plus the primary HSE space. Matches the bundled DwD_PBI_Demo multi-space configuration.",
        apply: {
            multiSpaceEnabled: true,
            multiSpaceCount: 3,
            space2Label: "Sales",
            space2AssistantProfile: "sales",
            space3Label: "Customer",
            space3AssistantProfile: "customer",
            space4Label: "Ops",
            space4AssistantProfile: "ops",
        },
    },

    // Section F presets
    {
        id: "F.author",
        section: "F",
        label: "Author / build mode",
        description: "Dev mode + SQL + trace + filters all ON. Use during report build / debugging.",
        apply: {
            devMode: true,
            showSql: true,
            showTrace: true,
            showGuidedFilters: true,
            allowReportActions: true,
        },
    },
    {
        id: "F.publish",
        section: "F",
        label: "Publish-ready",
        description: "Every dev surface toggle OFF. Use before publishing to end users.",
        apply: {
            devMode: false,
            showSql: false,
            showTrace: false,
            showGuidedFilters: false,
            allowReportActions: true,
        },
    },
];

/**
 * Look up presets for a given section.
 */
export function presetsForSection(section: SectionValidation["section"]): Preset[] {
    return STEP5_PRESETS.filter(p => p.section === section);
}
