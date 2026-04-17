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
        {eyebrow ? (
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">
            {eyebrow}
          </div>
        ) : null}

        <h2 className="mt-1 text-balance font-display text-[22px] font-semibold tracking-[-0.02em] text-text-primary sm:text-[26px]">
          {title}
        </h2>

        {description ? (
          <p className="mt-2 max-w-3xl break-words text-[13px] leading-[1.55] text-bone/55">
            {description}
          </p>
        ) : null}
      </div>

      {action ? <div className="w-full lg:w-auto lg:shrink-0">{action}</div> : null}
    </div>
  );
}
