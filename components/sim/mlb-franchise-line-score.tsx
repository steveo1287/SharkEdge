import { Card } from "@/components/ui/card";
import type { MlbInningMarketProjection } from "@/services/simulation/mlb-player-stat-inning-engine";

type TeamLine = {
  team: string;
  total: number;
  inningRuns: number[];
};

function one(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

function lineForTeam(team: string, total: number, innings: MlbInningMarketProjection["innings"], side: "away" | "home"): TeamLine {
  const key = side === "away" ? "awayExpectedRuns" : "homeExpectedRuns";
  return {
    team,
    total,
    inningRuns: innings.slice(0, 5).map((inning) => inning[key])
  };
}

function Row({ line }: { line: TeamLine }) {
  return (
    <div className="grid grid-cols-[1.4fr_repeat(5,0.5fr)_0.65fr] gap-3 border-t border-white/8 py-3 text-sm">
      <div className="truncate font-semibold text-white">{line.team}</div>
      {line.inningRuns.map((runs, index) => (
        <div key={`${line.team}:${index}`} className="tabular-nums text-slate-300">{one(runs)}</div>
      ))}
      <div className="tabular-nums font-semibold text-white">{one(line.total)}</div>
    </div>
  );
}

export function MlbProjectedLineScore({ awayTeam, homeTeam, awayRuns, homeRuns, inningStats }: {
  awayTeam: string;
  homeTeam: string;
  awayRuns: number;
  homeRuns: number;
  inningStats?: MlbInningMarketProjection | null;
}) {
  const innings = inningStats?.innings ?? [];
  const awayLine = lineForTeam(awayTeam, awayRuns, innings, "away");
  const homeLine = lineForTeam(homeTeam, homeRuns, innings, "home");

  return (
    <Card className="surface-panel overflow-hidden p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.58rem] uppercase tracking-[0.18em] text-slate-500">Projected line score</div>
          <div className="mt-1 font-display text-2xl font-semibold text-white">First five shape + full-game total</div>
        </div>
        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Projection</div>
      </div>
      <div className="grid grid-cols-[1.4fr_repeat(5,0.5fr)_0.65fr] gap-3 pb-2 text-[0.58rem] uppercase tracking-[0.16em] text-slate-500">
        <div>Team</div><div>1</div><div>2</div><div>3</div><div>4</div><div>5</div><div>R</div>
      </div>
      <Row line={awayLine} />
      <Row line={homeLine} />
    </Card>
  );
}
