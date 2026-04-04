import type { ReactNode } from "react";

type SectionTitleProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
};

export function SectionTitle({ title, description, action, eyebrow }: SectionTitleProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 flex-1">
        {eyebrow ? <div className="section-kicker">{eyebrow}</div> : null}
        <h2 className="text-balance font-display text-[1.9rem] font-semibold tracking-tight text-white xl:text-[2.15rem]">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 max-w-3xl text-pretty break-words text-sm leading-7 text-slate-400">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
