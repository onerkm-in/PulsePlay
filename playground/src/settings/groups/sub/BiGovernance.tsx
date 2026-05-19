// playground/src/settings/groups/sub/BiGovernance.tsx
//
// BI → Governance sub-route. Resurfaces the Pulse SQL / UC governance
// settings that constrain what the assistant can do at query time:
// forbidden columns/tables, mandatory row filters, read-only enforcement,
// RLS hints, and Unity Catalog row-filter / column-mask enforcement flags.

import { FieldCard, FieldRow, Toggle } from "../../primitives";
import { asBool, asStr, useGenieSettingsSlice } from "./genieSettingsBridge";
import { SubPageHeader } from "./AiKnowledgeBase";

interface GovState {
    ucRowFiltersEnforced: boolean;
    ucColumnMasksEnforced: boolean;
    runtimeReadOnlyEnforced: boolean;
    runtimeForbiddenColumns: string;
    runtimeMandatoryRowFilter: string;
    sqlForbiddenTables: string;
    sqlRlsHintEnabled: boolean;
    authMode: "sharedPat" | "oauthObo";
}

function safeParse(s: string): Record<string, unknown> {
    try { const p = JSON.parse(s); return p && typeof p === "object" ? p : {}; } catch { return {}; }
}

function asAuthMode(value: unknown): "sharedPat" | "oauthObo" {
    return value === "oauthObo" ? "oauthObo" : "sharedPat";
}

const readSlice = (): GovState => {
    const raw = (typeof window !== "undefined" ? window.localStorage.getItem("pulseplay:visual-settings:genieSettings") : null);
    const obj = raw ? safeParse(raw) : {};
    return {
        ucRowFiltersEnforced: asBool(obj.ucRowFiltersEnforced, true),
        ucColumnMasksEnforced: asBool(obj.ucColumnMasksEnforced, true),
        runtimeReadOnlyEnforced: asBool(obj.runtimeReadOnlyEnforced, true),
        runtimeForbiddenColumns: asStr(obj.runtimeForbiddenColumns, ""),
        runtimeMandatoryRowFilter: asStr(obj.runtimeMandatoryRowFilter, ""),
        sqlForbiddenTables: asStr(obj.sqlForbiddenTables, ""),
        sqlRlsHintEnabled: asBool(obj.sqlRlsHintEnabled, true),
        authMode: asAuthMode(obj.authMode),
    };
};

export function BiGovernance(): React.ReactElement {
    const [state, patch] = useGenieSettingsSlice<GovState>(readSlice);
    const layeredEnforcement = state.ucRowFiltersEnforced && state.ucColumnMasksEnforced && state.runtimeReadOnlyEnforced;

    return (
        <section id="settings-bi-governance" aria-labelledby="settings-bi-gov-title">
            <SubPageHeader
                title="Governance"
                blurb="Constrain what the assistant can do at query time. Most enforcement happens server-side at the warehouse (Unity Catalog row filters + column masks); these toggles add a prompt-layer reminder so the LLM doesn't even try to write SQL that would be blocked downstream."
            />

            <FieldCard
                title="Authentication model"
                subtitle="Who the proxy authenticates as when running queries on the user's behalf."
                status={{ tone: "info", label: state.authMode === "oauthObo" ? "OAuth on-behalf-of" : "Shared PAT" }}
                tip={{
                    title: "Shared PAT vs OAuth on-behalf-of",
                    body: [
                        "Shared PAT: every query runs as the proxy's service principal. Simpler, weaker audit/RLS.",
                        "OAuth OBO: every query runs as the signed-in user. Required for per-user RLS.",
                    ],
                }}
            >
                <FieldRow
                    label="Auth mode"
                    hint="Pick OAuth on-behalf-of when your governance team requires per-user query attribution."
                    tip={<>The proxy must be configured with the matching auth flow in <code>proxy/config.json</code>. Changing this here without server changes will silently fall back.</>}
                >
                    <select
                        id="gov-auth-mode"
                        value={state.authMode}
                        onChange={e => patch({ authMode: e.target.value as GovState["authMode"] })}
                    >
                        <option value="sharedPat">Shared PAT (proxy service principal)</option>
                        <option value="oauthObo">OAuth on-behalf-of (per-user identity)</option>
                    </select>
                </FieldRow>
            </FieldCard>

            <FieldCard
                title="Unity Catalog enforcement"
                subtitle="Tell the proxy your Unity Catalog enforces row filters / column masks so it doesn't add redundant SQL."
                status={{ tone: layeredEnforcement ? "ok" : "warn", label: layeredEnforcement ? "Full enforcement" : "Partial" }}
                tip={{
                    title: "Prompt construction only",
                    body: [
                        "These toggles don't enforce anything themselves.",
                        "Set them to match what your Databricks workspace actually does.",
                        "Mismatch → the assistant generates SQL that fights downstream policy.",
                    ],
                }}
            >
                <FieldRow
                    label="UC row filters enforced"
                    hint="Set to ON if your Unity Catalog tables have row-filter functions attached."
                    tip={<>When ON, the LLM is told it doesn't need to add <code>WHERE region = 'X'</code> to match the user's role — UC will filter automatically.</>}
                >
                    <Toggle id="gov-uc-rls" checked={state.ucRowFiltersEnforced} onChange={v => patch({ ucRowFiltersEnforced: v })} label={state.ucRowFiltersEnforced ? "Enforced" : "Not enforced"} />
                </FieldRow>

                <FieldRow
                    label="UC column masks enforced"
                    hint="Set to ON if your Unity Catalog tables have column-mask functions attached."
                    tip={<>When ON, the LLM is told it can select sensitive columns freely — UC will mask values for unauthorized users at query time.</>}
                >
                    <Toggle id="gov-uc-mask" checked={state.ucColumnMasksEnforced} onChange={v => patch({ ucColumnMasksEnforced: v })} label={state.ucColumnMasksEnforced ? "Enforced" : "Not enforced"} />
                </FieldRow>

                <FieldRow
                    label="Read-only enforcement"
                    hint="Block the assistant from generating any DML (INSERT, UPDATE, DELETE, DROP, etc.)."
                    tip={<>This is layered: the LLM is told to refuse DML in the prompt, AND the proxy validates the query before sending it to Genie. Both layers must be on for true safety.</>}
                >
                    <Toggle id="gov-readonly" checked={state.runtimeReadOnlyEnforced} onChange={v => patch({ runtimeReadOnlyEnforced: v })} label={state.runtimeReadOnlyEnforced ? "Read-only" : "Read-write allowed"} />
                </FieldRow>
            </FieldCard>

            <FieldCard
                title="Prompt-layer rules"
                subtitle="Tell the assistant which columns / tables to never touch + which row filter to always apply."
                tip="Useful when UC isn't configured (yet) but you still need to keep sensitive fields out of answers. Belt-and-braces over UC, not a substitute."
            >
                <FieldRow
                    label="Forbidden columns"
                    hint="Comma-separated list of column names the assistant should never select."
                    tip={<>Example: <code>ssn, dob, salary, credit_card</code>. Names are matched case-insensitively; tables are not specified (matches anywhere).</>}
                >
                    <input
                        id="gov-forbidden-cols"
                        type="text"
                        value={state.runtimeForbiddenColumns}
                        onChange={e => patch({ runtimeForbiddenColumns: e.target.value })}
                        placeholder="ssn, dob, salary, ..."
                        spellCheck={false}
                    />
                </FieldRow>

                <FieldRow
                    label="Forbidden tables"
                    hint="Comma-separated list of fully-qualified table names off-limits to the assistant."
                    tip={<>Example: <code>finance.private.payroll, hr.internal.compensation</code>. Use the same case the catalog uses.</>}
                >
                    <input
                        id="gov-forbidden-tables"
                        type="text"
                        value={state.sqlForbiddenTables}
                        onChange={e => patch({ sqlForbiddenTables: e.target.value })}
                        placeholder="catalog.schema.table, ..."
                        spellCheck={false}
                    />
                </FieldRow>

                <FieldRow
                    label="Mandatory row filter"
                    hint="A SQL WHERE fragment the assistant should always include. Supports {{role}}, {{currentDate}}, {{year}} substitutions."
                    tip={<>Example: <code>region = '{`{{`}role{`}}`}'</code>. Used when UC row filters aren't yet wired but you need every query scoped to the user's region/role.</>}
                >
                    <textarea
                        id="gov-row-filter"
                        rows={3}
                        value={state.runtimeMandatoryRowFilter}
                        onChange={e => patch({ runtimeMandatoryRowFilter: e.target.value })}
                        placeholder="region = '{{role}}' AND year >= {{year}} - 2"
                        spellCheck={false}
                        style={{ fontFamily: "var(--pp-font-mono)", fontSize: 12 }}
                    />
                </FieldRow>

                <FieldRow
                    label="RLS role hint"
                    hint="Inject the signed-in user's role into the system prompt so the LLM can reason about its own permissions."
                    tip={<>When ON, the assistant sees a system prompt fragment like 'You are answering for user X with role Y.' Useful for role-aware answers; off when you want the assistant to be role-agnostic.</>}
                >
                    <Toggle id="gov-rls-hint" checked={state.sqlRlsHintEnabled} onChange={v => patch({ sqlRlsHintEnabled: v })} label={state.sqlRlsHintEnabled ? "Role hint on" : "Role hint off"} />
                </FieldRow>
            </FieldCard>
        </section>
    );
}
