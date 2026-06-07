import { Card } from "@/components/ui/card";
import type { MlbPlayerStatProjectionGame } from "@/services/simulation/mlb-player-stat-inning-engine";

type Hitter = MlbPlayerStatProjectionGame["awayHitters"][number];
type Starter = NonNullable<MlbPlayerStatProjectionGame["awayStarter"]>;

function one(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

function hitterScore(hitter: Hitter) {
  return hitter.expectedHits * 1.5 + hitter.expectedTotalBases + hitter.expectedRuns * 0.6 + hitter.expectedRbi * 0.6 + hitter.expectedHomeRuns * 2 + hitter.stolenBaseProbability;
}

function topHitters(stats: MlbPlayerStatProjectionGame) {
  return [...stats.awayHitters, ...stats.homeHitters]
    .sort((left, right) => hitterScore(right) - hitterScore(left))
    .slice(0, 4);
}

function starters(stats: MlbPlayerStatProjectionGame) {
  return [stats.awayStarter, stats.homeStarter].filter((starter): starter is Starter => Boolean(starter));
}

function HitterCard({ hitter }: { hitter: Hitter }) {
  return (
    <Card className="surface-panel p-4">
      <div className="text-[0.58rem] uppercase tracking-[0.18em] text-slate-500">Impact hitter</div>
      <div className="mt-2 truncate font-display text-xl font-semibold text-white">{hitter.playerName}</div>
      <div className="mt-1 text-xs text-slate-500">{hitter.team} · #{hitter.battingOrder}</div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Mini label="H" value={one(hitter.expectedHits)} />
        <Mini label="TB" value={one(hitter.expectedTotalBases)} />
        <Mini label="RBI" value={one(hitter.expectedRbi)} />
      </div>
    </Card>
  );
}

function StarterCard({ starter }: { starter: Starter }) {
  return (
    <Card className="surface-panel p-4">
      <div className="text-[0.58rem] uppercase tracking-[0.18em] text-slate-500">Starting pitcher</div>
      <div className="mt-2 truncate font-display text-xl font-semibold text-white">{starter.pitcherName}</div>
      <div className="mt-1 text-xs text-slate-500">{starter.team}</div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Mini label="IP" value={one(starter.expectedInningsPitched)} />
        <Mini label="K" value={one(starter.expectedStrikeouts)} />
        <Mini label="ER" value={one(starter.expectedEarnedRuns)} />
      </div>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-slate-950/55 p-2">
      <div className="text-[0.55rem] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

export function MlbImpactPlayers({ stats }: { stats?: MlbPlayerStatProjectionGame | null }) {
  if (!stats) return null;
  const hitters = topHitters(stats);
  const pitcherRows = starters(stats);
  return (
    <section className="grid gap-4">
      <div>
        <div className="text-[0.64rem] uppercase tracking-[0.2em] text-slate-500">Impact players</div>
        <div className="mt-1 text-sm text-slate-400">Quick franchise-style player cards. Full box score stays on the Box Score tab.</div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
        {hitters.map((hitter) => <HitterCard key={`hitter:${hitter.playerId}`} hitter={hitter} />)}
      </div>
      {pitcherRows.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {pitcherRows.map((starter) => <StarterCard key={`starter:${starter.pitcherId}`} starter={starter} />)}
        </div>
      ) : null}
    </section>
  );
}
