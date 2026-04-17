import type { ReactNode } from "react";

type TrendBreakdownAccordionSection = {
  id: string;
  title: string;
  defaultOpen?: boolean;
  content: ReactNode;
};

export function TrendBreakdownAccordion({
  sections
}: {
  sections: TrendBreakdownAccordionSection[];
}) {
  return (
    <div className="grid gap-2">
      {sections.map((section) => (
        <details
          key={section.id}
          open={section.defaultOpen}
          className="overflow-hidden rounded-md border border-bone/[0.08] bg-surface transition-colors open:border-aqua/20"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[11.5px] font-semibold uppercase tracking-[0.10em] text-text-primary">
            <span>{section.title}</span>
            <span className="text-bone/40 transition-transform group-open:rotate-180">
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden>
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </summary>
          <div className="border-t border-bone/[0.08] bg-panel px-4 py-4 text-[13px] leading-[1.6] text-bone/75">
            {section.content}
          </div>
        </details>
      ))}
    </div>
  );
}
