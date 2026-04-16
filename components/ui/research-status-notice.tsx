import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type ResearchStatusNoticeProps = {
  eyebrow: string;
  title: string;
  body: string;
  tone?: "success" | "brand" | "premium" | "muted" | "danger";
  meta?: ReactNode;
};

export function ResearchStatusNotice({
  eyebrow,
  title,
  body,
  tone = "premium",
  meta
}: ResearchStatusNoticeProps) {
  return (
    <Card className="surface-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">{eyebrow}</div>
          <div className="mt-2 text-xl font-semibold text-white">{title}</div>
        </div>
        <Badge tone={tone}>{tone === "premium" ? "Research beta" : title}</Badge>
      </div>
      <div className="mt-3 text-sm leading-7 text-slate-300">{body}</div>
      {meta ? <div className="mt-4 text-sm leading-6 text-slate-400">{meta}</div> : null}
    </Card>
  );
}
