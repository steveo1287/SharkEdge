import type { ReactNode } from "react";

import { Card } from "./card";

type DataTableProps = {
  columns: string[];
  rows: ReactNode[][];
  compact?: boolean;
};

export function DataTable({ columns, rows, compact = false }: DataTableProps) {
  return (
    <Card className="surface-panel overflow-hidden">
      <div className="table-scroll overflow-x-auto">
        <table className="min-w-full text-left">
          <thead className="border-b border-line/80 bg-slate-950/45">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-line/50 align-top last:border-b-0">
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${index}-${cellIndex}`}
                    className={
                      compact
                        ? "px-4 py-3 text-sm text-slate-300"
                        : "px-4 py-3.5 text-sm text-slate-300"
                    }
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
