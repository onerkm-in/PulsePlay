// playground/src/knowledge/knowledgeRoute.ts
//
// Path router for the Knowledge Base page. Mirrors the Settings router
// pattern (no new dep — pushState + popstate). Routes:
//
//   /knowledge                              → KB index (lists packs)
//   /knowledge/<pack>                       → pack overview
//   /knowledge/<pack>/<section>             → pack section (glossary, ontology,
//                                              references, sub-verticals, runtime,
//                                              demos, governance)
//   /knowledge/<pack>/sub-verticals/<sv>    → sub-vertical detail (KPIs +
//                                              sample-questions + prompt-context +
//                                              bi-ai-fit)

import { useEffect, useState } from "react";

export type KnowledgeSection =
    | "overview"
    | "glossary"
    | "ontology"
    | "references"
    | "sub-verticals"
    | "runtime"
    | "demos";

export const KNOWLEDGE_SECTIONS: ReadonlyArray<KnowledgeSection> = [
    "overview",
    "glossary",
    "ontology",
    "references",
    "sub-verticals",
    "runtime",
    "demos",
];

export interface KnowledgeRouteState {
    isKnowledgeRoute: boolean;
    pack: string | null;
    section: KnowledgeSection;
    subVertical: string | null;
}

const PREFIX = "/knowledge";

function isValidSection(value: string): value is KnowledgeSection {
    return (KNOWLEDGE_SECTIONS as ReadonlyArray<string>).includes(value);
}

export function parseKnowledgeRoute(pathname: string): KnowledgeRouteState {
    if (!pathname.startsWith(PREFIX)) {
        return { isKnowledgeRoute: false, pack: null, section: "overview", subVertical: null };
    }
    const remainder = pathname.slice(PREFIX.length).replace(/^\/+|\/+$/g, "");
    if (!remainder) {
        return { isKnowledgeRoute: true, pack: null, section: "overview", subVertical: null };
    }
    const segments = remainder.split("/").filter(Boolean);
    const pack = segments[0] || null;
    // Handle /knowledge/<pack>/sub-verticals/<sv> explicitly
    if (segments[1] === "sub-verticals" && segments[2]) {
        return {
            isKnowledgeRoute: true,
            pack,
            section: "sub-verticals",
            subVertical: segments[2],
        };
    }
    const rawSection = segments[1];
    const section: KnowledgeSection = rawSection && isValidSection(rawSection) ? rawSection : "overview";
    return { isKnowledgeRoute: true, pack, section, subVertical: null };
}

export function useKnowledgeRoute(): KnowledgeRouteState {
    const [state, setState] = useState<KnowledgeRouteState>(() =>
        typeof window !== "undefined"
            ? parseKnowledgeRoute(window.location.pathname)
            : { isKnowledgeRoute: false, pack: null, section: "overview", subVertical: null }
    );
    useEffect(() => {
        if (typeof window === "undefined") return;
        const sync = () => setState(parseKnowledgeRoute(window.location.pathname));
        window.addEventListener("popstate", sync);
        window.addEventListener("pulseplay:knowledge-navigate", sync as EventListener);
        return () => {
            window.removeEventListener("popstate", sync);
            window.removeEventListener("pulseplay:knowledge-navigate", sync as EventListener);
        };
    }, []);
    return state;
}

function pushUrl(pathname: string): void {
    if (typeof window === "undefined") return;
    if (window.location.pathname === pathname) return;
    window.history.pushState({}, "", pathname);
    window.dispatchEvent(new CustomEvent("pulseplay:knowledge-navigate"));
}

export function navigateToKnowledge(pack?: string, section?: KnowledgeSection, subVertical?: string): void {
    let url = PREFIX;
    if (pack) {
        url += `/${pack}`;
        if (section && section !== "overview") {
            url += `/${section}`;
            if (section === "sub-verticals" && subVertical) {
                url += `/${subVertical}`;
            }
        }
    }
    pushUrl(url);
}
