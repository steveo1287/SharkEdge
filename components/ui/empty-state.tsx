import type { ReactNode } from "react";

import { Card } from "./card";

type EmptyStateProps = {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ eyebrow, title, description, action }: EmptyStateProps) {
  return (
    <Card className="p-8 md:p-10">
      <div className="mx-auto flex max-w-xl flex-col items-start gap-3">
        {/* Hairline square illustration — restrained, geometric, not a cartoon */}
        <div
          className="relative mb-2 h-10 w-10 border border-bone/20"
          aria-hidden
        >
          <span className="absolute inset-1 border border-bone/10" />
          <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 bg-aqua" />
        </div>

        {eyebrow ? (
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">
            {eyebrow}
          </div>
        ) : null}

        <div className="font-display text-[22px] font-semibold tracking-[-0.02em] text-text-primary md:text-[26px]">
          {title}
        </div>

        <p className="text-[13.5px] leading-[1.6] text-bone/60">
          {description}
        </p>

        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </Card>
  );
}
