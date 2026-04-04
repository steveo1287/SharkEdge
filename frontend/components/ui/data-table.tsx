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
          <thead className="border-b border-line/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent),rgba(2,8,18,0.72)]">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="px-4 py-3 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500"
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
                className="border-b border-line/40 align-top transition last:border-b-0 hover:bg-white/[0.02]"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${index}-${cellIndex}`}
                    className={
                      compact
                        ? "px-4 py-3 text-sm text-slate-300"
                        : "px-4 py-4 text-sm text-slate-300"
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
