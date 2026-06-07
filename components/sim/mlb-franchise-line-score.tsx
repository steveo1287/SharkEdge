import { SimSignalCard } from "@/components/sim/sim-ui";

export type FranchiseLineScoreTeam = {
  name: string;
  runs: number | null;
  innings: number[];
  hits?: number | null;
  errors?: number | null;
};

function fmt(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

export function MlbFranchiseLineScore({ away, home }: { away: FranchiseLineScoreTeam; home: FranchiseLineScoreTeam }) {
  const innings = Array.from({ length: 9 }, (_, index) => index + 1);
  return (
    <SimSignalCard className="overflow-hidden p-0">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Projected Line Score</div>
        <div className="mt-1 text-[11px] text-slate-500">Inning shape is projection-only until official box-score tracking lands.</div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[760px] w-full text-sm">
          <thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.14em] text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">Team</th>
              {innings.map((inning) => <th key={inning} className="px-2 py-3 text-center">{inning}</th>)}
              <th className="px-3 py-3 text-center text-white">R</th>
              <th className="px-3 py-3 text-center">H</th>
              <th className="px-3 py-3 text-center">E</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {[away, home].map((team) => (
              <tr key={team.name}>
                <td className="px-4 py-3 font-semibold text-white">{team.name}</td>
                {team.innings.map((runs, index) => <td key={`${team.name}:${index}`} className="px-2 py-3 text-center font-mono text-slate-300">{fmt(runs, 1)}</td>)}
                <td className="px-3 py-3 text-center font-mono font-bold text-aqua">{fmt(team.runs, 1)}</td>
                <td className="px-3 py-3 text-center font-mono text-slate-300">{fmt(team.hits, 1)}</td>
                <td className="px-3 py-3 text-center font-mono text-slate-500">{team.errors ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SimSignalCard>
  );
}
