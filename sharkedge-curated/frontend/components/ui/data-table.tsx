import type { ReactNode } from "react";

import { Card } from "./card";

type DataTableProps = {
  columns: string[];
  rows: ReactNode[][];
  compact?: boolean;
};

export function DataTable({
  columns,
  rows,
  compact = false
}: DataTableProps) {
  return (
    <Card className="surface-panel overflow-hidden">
      <div className="table-scroll overflow-x-auto">
        <table className="min-w-[640px] w-full text-left">
          <thead className="border-b border-line/80 bg-slate-950/45">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:px-4 sm:text-[11px] sm:tracking-[0.18em]"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr
                key={index}
                className="border-b border-line/50 align-top last:border-b-0"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${index}-${cellIndex}`}
                    className={
                      compact
                        ? "px-3 py-3 text-sm text-slate-300 sm:px-4"
                        : "px-3 py-3.5 text-sm text-slate-300 sm:px-4"
                    }
                  >
                    <div className="min-w-0">{cell}</div>
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