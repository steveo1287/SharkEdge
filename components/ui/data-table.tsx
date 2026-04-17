import type { ReactNode } from "react";

import { Card } from "./card";

type DataTableProps = {
  columns: string[];
  rows: ReactNode[][];
  compact?: boolean;
};

/**
 * DataTable — Bloomberg-ish. No zebra stripes. Hairline group separators.
 * Sticky header with frosted backdrop. Tabular mono implied by .num on cell content.
 */
export function DataTable({
  columns,
  rows,
  compact = false
}: DataTableProps) {
  return (
    <Card className="overflow-hidden">
      <div className="table-scroll overflow-x-auto">
        <table className="min-w-[640px] w-full text-left">
          <thead>
            <tr className="border-b border-bone/[0.10]">
              {columns.map((column) => (
                <th
                  key={column}
                  className="sticky top-0 z-[1] bg-panel/95 px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55 backdrop-blur-sm"
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
                className="focusable group border-b border-bone/[0.04] align-middle transition-colors last:border-b-0 hover:bg-raised/60"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${index}-${cellIndex}`}
                    className={
                      compact
                        ? "px-4 py-2.5 text-[13px] text-text-primary"
                        : "px-4 py-3 text-[13px] text-text-primary"
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
