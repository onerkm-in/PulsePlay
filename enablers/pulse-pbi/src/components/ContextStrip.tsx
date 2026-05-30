import * as React from "react";
import { SelectableContextItem } from "../visualTypes";

interface ContextStripProps {
    selectableContext: SelectableContextItem[];
    selectedContextIds: string[];
    onSelect: (item: SelectableContextItem) => void;
    onClear: () => void;
}

export function ContextStrip({ selectableContext, selectedContextIds, onSelect, onClear }: ContextStripProps): React.JSX.Element {
    return (
        <div className="rx-context-strip">
            <div className="rx-chip-row">
                {selectableContext.map(item => (
                    <button
                        key={item.id}
                        className={`rx-chip${selectedContextIds.includes(item.id) ? " rx-chip--active" : ""}`}
                        onClick={() => onSelect(item)}
                        title={`Filter: ${item.field} = ${item.value}`}
                    >
                        {item.field}: {item.value}
                    </button>
                ))}
                {selectedContextIds.length > 0 && (
                    <button className="rx-chip rx-chip--clear" onClick={onClear} title="Clear filter">
                        Clear
                    </button>
                )}
            </div>
        </div>
    );
}
