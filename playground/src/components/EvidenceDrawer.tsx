import { useState } from "react";

export interface EvidenceItem {
    label: string;
    kind: "sql" | "metric-view" | "genie" | "lineage" | "vector-search" | "source";
    value: string;
    source?: string;
}

export interface EvidenceDrawerProps {
    items: EvidenceItem[];
}

const LABELS: Record<EvidenceItem["kind"], string> = {
    sql: "SQL",
    "metric-view": "Metric view",
    genie: "Genie",
    lineage: "Lineage",
    "vector-search": "Vector Search",
    source: "Source",
};

export function EvidenceDrawer(props: EvidenceDrawerProps): React.ReactElement | null {
    const [open, setOpen] = useState(false);
    const items = props.items.filter(item => item.value.trim());
    if (items.length === 0) return null;

    return (
        <div className="pp-evidence">
            <button
                type="button"
                className="pp-evidence__toggle"
                onClick={() => setOpen(v => !v)}
                aria-expanded={open}
            >
                Evidence ({items.length})
            </button>
            {open && (
                <div className="pp-evidence__drawer">
                    {items.map((item, index) => (
                        <section key={`${item.kind}:${item.label}:${index}`} className="pp-evidence__item">
                            <header>
                                <span>{LABELS[item.kind]}</span>
                                <strong>{item.label}</strong>
                            </header>
                            <pre>{item.value}</pre>
                            {item.source && <p>{item.source}</p>}
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
