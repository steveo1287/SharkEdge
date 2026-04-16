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
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">
            {label}
          </div>
          <div className="display-number mt-3 text-[30px] leading-none text-text-primary md:text-[34px]">
            {value}
          </div>
          {note ? (
            <div className="mt-2 text-[13px] leading-[1.5] text-bone/60">{note}</div>
          ) : null}
        </div>
        {accent}
      </div>
    </Card>
  );
}
