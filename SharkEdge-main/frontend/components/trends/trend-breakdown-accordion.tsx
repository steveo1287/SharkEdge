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
    <div className="grid gap-3">
      {sections.map((section) => (
        <details
          key={section.id}
          open={section.defaultOpen}
          className="overflow-hidden rounded-[20px] border border-white/8 bg-white/[0.02]"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-[1rem] font-medium text-white">
            <span>{section.title}</span>
            <span className="text-slate-500">?</span>
          </summary>
          <div className="border-t border-white/8 px-4 py-4 text-sm text-slate-300">{section.content}</div>
        </details>
      ))}
    </div>
  );
}

