import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { GameDetailView } from "@/lib/types/domain";

type OverviewPanelProps = {
  detail: GameDetailView;
};

export function OverviewPanel({ detail }: OverviewPanelProps) {
  return (
    <Card className="p-5">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="brand">{detail.league.key}</Badge>
            <Badge tone="premium">Consensus {detail.consensus}</Badge>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Best Spread</div>
              <div className="mt-3 font-display text-xl text-white">{detail.bestMarkets.spread.label}</div>
            </div>
            <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Best Moneyline</div>
              <div className="mt-3 font-display text-xl text-white">{detail.bestMarkets.moneyline.label}</div>
            </div>
            <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Best Total</div>
              <div className="mt-3 font-display text-xl text-white">{detail.bestMarkets.total.label}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {detail.insights.map((insight) => (
              <div
                key={insight}
                className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300"
              >
                {insight}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Edge Score</div>
            <div className="mt-3 font-display text-4xl text-white">{detail.edgeScore.score}</div>
            <div className="mt-2 text-sm text-slate-400">{detail.edgeScore.label}</div>
          </div>
          <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Injuries</div>
            <div className="mt-3 grid gap-3">
              {detail.injuries.length ? (
                detail.injuries.map((injury) => (
                  <div key={injury.id} className="text-sm text-slate-300">
                    <span className="font-medium text-white">
                      {injury.playerName ?? injury.teamName}
                    </span>{" "}
                    | {injury.status}
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-400">No notable injuries flagged in mock data.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
