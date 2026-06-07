import { SimSignalCard } from "@/components/sim/sim-ui";

export type FranchiseImpactPlayer = {
  name: string;
  team: string;
  role: string;
  summary: string;
  score: number | null;
};

function fmt(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(1);
}

export function MlbFranchiseImpactPlayers({ players }: { players: FranchiseImpactPlayer[] }) {
  return (
    <SimSignalCard>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Impact Players</div>
          <div className="mt-1 text-[11px] text-slate-500">Projected roles from recent MLB stat rows and roster intelligence.</div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {players.length ? players.map((player) => (
          <div key={`${player.team}:${player.name}:${player.role}`} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold text-white">{player.name}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">{player.team} - {player.role}</div>
              </div>
              <div className="font-mono text-lg font-bold text-aqua">{fmt(player.score)}</div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">{player.summary}</p>
          </div>
        )) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-slate-400 md:col-span-2 xl:col-span-3">
            No player-level stat rows are linked to this game yet. Team projection remains available.
          </div>
        )}
      </div>
    </SimSignalCard>
  );
}
