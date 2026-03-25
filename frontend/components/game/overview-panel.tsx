import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { MatchupDetailView } from "@/lib/types/domain";

type OverviewPanelProps = {
  detail: MatchupDetailView;
};

function getSupportTone(status: MatchupDetailView["supportStatus"]) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
}

export function OverviewPanel({ detail }: OverviewPanelProps) {
  return (
    <Card className="p-5">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={getSupportTone(detail.supportStatus)}>{detail.supportStatus}</Badge>
            {detail.currentOddsProvider ? (
              <Badge tone="brand">{detail.currentOddsProvider}</Badge>
            ) : null}
            {detail.propsSupport.supportedMarkets.length ? (
              <Badge tone="premium">
                {detail.propsSupport.supportedMarkets.length} prop market
                {detail.propsSupport.supportedMarkets.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Best Spread
              </div>
              <div className="mt-3 font-display text-xl text-white">
                {detail.oddsSummary?.bestSpread ?? "Pending"}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Best Moneyline
              </div>
              <div className="mt-3 font-display text-xl text-white">
                {detail.oddsSummary?.bestMoneyline ?? "Pending"}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Best Total
              </div>
              <div className="mt-3 font-display text-xl text-white">
                {detail.oddsSummary?.bestTotal ?? "Pending"}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {detail.notes.length ? (
              detail.notes.map((note) => (
                <div
                  key={note}
                  className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300"
                >
                  {note}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-400">
                Matchup notes will appear here when the provider returns explicit context.
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Coverage
            </div>
            <div className="mt-3 font-display text-2xl text-white">{detail.supportStatus}</div>
            <div className="mt-2 text-sm leading-6 text-slate-400">{detail.supportNote}</div>
          </div>
          <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Provider Mesh
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-300">
              <div>Scores: {detail.liveScoreProvider ?? "Pending"}</div>
              <div>Stats: {detail.statsProvider ?? "Pending"}</div>
              <div>Current odds: {detail.currentOddsProvider ?? "Pending"}</div>
              <div>Historical: {detail.historicalOddsProvider ?? "Pending"}</div>
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Props Support
            </div>
            <div className="mt-3 text-sm leading-6 text-slate-300">
              {detail.propsSupport.note}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
