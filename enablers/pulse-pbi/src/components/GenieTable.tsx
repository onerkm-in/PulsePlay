import * as React from "react";
import { QueryResultData } from "../visualTypes";

export function GenieTable({ data }: { data: QueryResultData }): React.JSX.Element {
    if (!data.columns.length || !data.rows.length) return null;

    const colTypes = detectColumnTypes(data);

    return (
        <div className="rx-table-container">
            <table className="rx-table">
                <thead>
                    <tr>
                        <th className="rx-th-rownum">#</th>
                        {data.columns.map((col, i) => (
                            <th key={i}>
                                <span className="rx-th-inner">
                                    <span className={`rx-col-type rx-col-type--${colTypes[i]}`}>
                                        {colTypes[i] === "num" ? "1.2" : colTypes[i] === "date" ? "\u25F7" : "A\u1D2E"}
                                    </span>
                                    {col}
                                </span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.rows.slice(0, 100).map((row, i) => (
                        <tr key={i}>
                            <td className="rx-td-rownum">{i + 1}</td>
                            {row.map((cell, j) => (
                                <td key={j} className={colTypes[j] === "num" ? "rx-td--num" : ""}>
                                    {formatCell(cell, colTypes[j])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {data.rows.length > 100 && (
                <div className="rx-table-overflow">Showing first 100 of {data.rows.length} rows</div>
            )}
        </div>
    );
}

type ColType = "str" | "num" | "date";

function detectColumnTypes(data: QueryResultData): ColType[] {
    return data.columns.map((_, colIdx) => {
        const sample = data.rows.slice(0, 20);
        let numCount = 0;
        let dateCount = 0;
        let total = 0;

        for (const row of sample) {
            const v = row[colIdx];
            if (v === null || v === undefined || v === "") continue;
            total++;
            if (!isNaN(Number(v))) numCount++;
            else if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(String(v))) dateCount++;
        }
        if (total === 0) return "str";
        if (numCount / total > 0.7) return "num";
        if (dateCount / total > 0.5) return "date";
        return "str";
    });
}

function formatCell(cell: any, type: ColType): string {
    if (cell === null || cell === undefined) return "\u2014";
    if (type === "num") {
        const n = Number(cell);
        if (isNaN(n)) return String(cell);
        if (Number.isInteger(n)) return n.toLocaleString();
        return n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 4 });
    }
    return String(cell);
}
