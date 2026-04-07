import type { ReactNode } from "react";

type SectionTitleProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
};

export function SectionTitle({
  title,
  description,
  action,
  eyebrow
}: SectionTitleProps) {
  return (
    <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 flex-1">
        {eyebrow ? <div className="section-kicker">{eyebrow}</div> : null}

        <h2 className="text-balance font-display text-xl font-semibold tracking-tight text-white sm:text-2xl">
          {title}
        </h2>

        {description ? (
          <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-slate-400">
            {description}
          </p>
        ) : null}
      </div>

      {action ? <div className="w-full lg:w-auto lg:shrink-0">{action}</div> : null}
    </div>
  );
}