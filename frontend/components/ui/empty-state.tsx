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
    <Card className="surface-panel p-6 text-center md:p-8">
      <div className="mx-auto max-w-xl">
        {eyebrow ? (
          <div className="font-mono text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</div>
        ) : null}
        <div className="mt-2 font-display text-[1.8rem] font-semibold tracking-[-0.04em] text-white md:text-[2rem]">{title}</div>
        <p className="mt-3 text-sm leading-7 text-slate-400 md:text-[0.96rem]">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </Card>
  );
}
