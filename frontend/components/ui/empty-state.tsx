import type { ReactNode } from "react";

import { Card } from "./card";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Card className="p-8 text-center">
      <div className="mx-auto max-w-xl">
        <div className="font-display text-2xl font-semibold text-white">{title}</div>
        <p className="mt-3 text-sm leading-7 text-slate-400">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </Card>
  );
}
