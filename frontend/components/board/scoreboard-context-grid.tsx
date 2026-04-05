import { Card } from "@/components/ui/card";

type Props = {
  items: any[];
};

export function ScoreboardContextGrid({ items }: Props) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((i, idx) => (
        <Card key={idx} className="surface-panel p-5">
          <div className="text-white">{i.label}</div>
          <div className="text-slate-400 text-sm mt-2">
            {i.scoreboard}
          </div>
        </Card>
      ))}
    </section>
  );
}