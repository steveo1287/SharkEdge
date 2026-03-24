import { Card } from "./card";

type SetupStateCardProps = {
  title: string;
  detail: string;
  steps: string[];
};

export function SetupStateCard({ title, detail, steps }: SetupStateCardProps) {
  return (
    <Card className="border-amber-400/20 bg-amber-500/5 p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-amber-300">
        Setup Required
      </div>
      <div className="mt-3 font-display text-2xl font-semibold text-white">{title}</div>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{detail}</p>
      <div className="mt-4 grid gap-2">
        {steps.map((step, index) => (
          <div
            key={`${index}-${step}`}
            className="rounded-2xl border border-line bg-slate-950/70 px-4 py-3 text-sm text-slate-300"
          >
            {index + 1}. {step}
          </div>
        ))}
      </div>
    </Card>
  );
}
