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
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
          <div className="mt-3 font-display text-3xl font-semibold tracking-tight text-white">
            {value}
          </div>
          {note ? <div className="mt-2 text-sm text-slate-400">{note}</div> : null}
        </div>
        {accent}
      </div>
    </Card>
  );
}
