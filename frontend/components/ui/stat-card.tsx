import type { ReactNode } from "react";

import { Card } from "./card";

type StatCardProps = {
  label: string;
  value: string;
  note?: string;
  accent?: ReactNode;
};

export function StatCard({ label, value, note, accent }: StatCardProps) {
  return (
    <Card className="surface-panel p-4 md:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</div>
          <div className="mt-3 font-display text-[1.85rem] font-semibold tracking-[-0.04em] text-white md:text-[2.15rem]">
            {value}
          </div>
          {note ? <div className="mt-2 text-sm leading-6 text-slate-400">{note}</div> : null}
        </div>
        {accent}
      </div>
    </Card>
  );
}
