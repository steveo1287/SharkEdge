import Link from "next/link";
import { buildPlayerSimProjection } from "@/services/simulation/player-sim-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatScore(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "—";
  }
  return value.toFixed(2);
}

function formatOdds(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "—";
  }
  return value > 0 ? `+${value.toFixed(0)}` : `${value.toFixed(0)}`;
}

function edgeTone(value: number | null | undefined) {
  if (typeof value !== "number") return "border-bone/[0.08] text-bone/55";
  if (value > 8) return "border-aqua/20 bg-aqua/[0.05] text-aqua";
  if (value > 4) return "border-amber-500/20 bg-amber-500/[0.05] text-amber-500";
  return "border-red-500/20 bg-red-500/[0.05] text-red-400";
}

type SimRow = {
  player: string;
  team: string;
  propType: string;
  line: number;
  teamTotal: number;
  minutes: number;
  usageRate: number;
  bookOdds: number;
};

// Mock player prop data for demonstration
const MOCK_PROPS: SimRow[] = [
  {
    player: "Luka Doncic",
    team: "DAL",
    propType: "Points",
    line: 33.5,
    teamTotal: 115,
    minutes: 36,
    usageRate: 0.35,
    bookOdds: -110
  },
  {
    player: "Luka Doncic",
    team: "DAL",
    propType: "Assists",
    line: 9.5,
    teamTotal: 115,
    minutes: 36,
    usageRate: 0.25,
    bookOdds: -110
  },
  {
    player: "Jayson Tatum",
    team: "BOS",
    propType: "Points",
    line: 29.5,
    teamTotal: 112,
    minutes: 35,
    usageRate: 0.32,
    bookOdds: -110
  },
  {
    player: "Jayson Tatum",
    team: "BOS",
    propType: "Rebounds",
    line: 8.5,
    teamTotal: 112,
    minutes: 35,
    usageRate: 0.22,
    bookOdds: -110
  },
  {
    player: "Nikola Jokic",
    team: "DEN",
    propType: "Points",
    line: 26.5,
    teamTotal: 118,
    minutes: 34,
    usageRate: 0.30,
    bookOdds: -110
  },
  {
    player: "Nikola Jokic",
    team: "DEN",
    propType: "Assists",
    line: 10.5,
    teamTotal: 118,
    minutes: 34,
    usageRate: 0.28,
    bookOdds: -110
  },
  {
    player: "Stephen Curry",
    team: "GSW",
    propType: "Points",
    line: 28.5,
    teamTotal: 113,
    minutes: 33,
    usageRate: 0.33,
    bookOdds: -110
  },
  {
    player: "Giannis Antetokounmpo",
    team: "MIL",
    propType: "Points",
    line: 31.5,
    teamTotal: 117,
    minutes: 35,
    usageRate: 0.34,
    bookOdds: -110
  }
];

function buildSimRows() {
  return MOCK_PROPS.map((prop) => {
    const sim = buildPlayerSimProjection({
      player: prop.player,
      propType: prop.propType,
      line: prop.line,
      teamTotal: prop.teamTotal,
      minutes: prop.minutes,
      usageRate: prop.usageRate,
      bookOdds: prop.bookOdds
    });

    return {
      ...prop,
      ...sim
    };
  });
}

export default async function SimPlayersPage() {
  const rows = buildSimRows();

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-30 border-b border-bone/[0.06] bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
          <div className="flex items-center justify-between py-3">
            <h1 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
              Player Simulation Engine
            </h1>
            <div className="flex gap-1">
              <Link
                href="/sim"
                className="rounded-lg px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-bone/70 hover:bg-bone/[0.08] transition-colors"
              >
                Board
              </Link>
              <Link
                href="/sim/players"
                className="rounded-lg px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-text-primary hover:bg-bone/[0.08] transition-colors"
              >
                Players
              </Link>
              <Link
                href="/sim/ab-test"
                className="rounded-lg px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-bone/70 hover:bg-bone/[0.08] transition-colors"
              >
                A/B Test
              </Link>
              <Link
                href="/sim/calibration"
                className="rounded-lg px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-bone/70 hover:bg-bone/[0.08] transition-colors"
              >
                Calibration
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-bone/[0.07] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bone/45">Total Props</p>
            <p className="mt-2 font-mono text-[24px] text-text-primary">{rows.length}</p>
          </div>
          <div className="rounded-xl border border-bone/[0.07] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bone/45">With Edge</p>
            <p className="mt-2 font-mono text-[24px] text-aqua">{rows.filter((r) => (r.edgePct ?? 0) > 4).length}</p>
          </div>
          <div className="rounded-xl border border-bone/[0.07] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bone/45">Avg Over Rate</p>
            <p className="mt-2 font-mono text-[24px] text-text-primary">
              {formatPercent(rows.reduce((sum, r) => sum + (r.overPct ?? 0), 0) / rows.length)}
            </p>
          </div>
          <div className="rounded-xl border border-aqua/20 bg-aqua/[0.04] p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-aqua/80">Avg Confidence</p>
            <p className="mt-2 font-mono text-[24px] text-aqua">
              {formatPercent(rows.reduce((sum, r) => sum + (r.confidence ?? 0), 0) / rows.length)}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-bone/[0.07] bg-surface overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-bone/[0.07]">
                <th className="px-4 py-3 text-left font-semibold text-bone/60">Player</th>
                <th className="px-4 py-3 text-left font-semibold text-bone/60">Prop</th>
                <th className="px-4 py-3 text-right font-semibold text-bone/60">Line</th>
                <th className="px-4 py-3 text-right font-semibold text-bone/60">Sim Mean</th>
                <th className="px-4 py-3 text-right font-semibold text-bone/60">Over %</th>
                <th className="px-4 py-3 text-right font-semibold text-bone/60">Fair Odds</th>
                <th className="px-4 py-3 text-right font-semibold text-bone/60">Edge %</th>
                <th className="px-4 py-3 text-right font-semibold text-bone/60">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-b border-bone/[0.04] hover:bg-bone/[0.02]">
                  <td className="px-4 py-3 font-semibold text-text-primary">
                    {row.player}
                    <span className="ml-2 text-bone/50">{row.team}</span>
                  </td>
                  <td className="px-4 py-3 text-bone/70">{row.propType}</td>
                  <td className="px-4 py-3 text-right font-mono text-text-primary">{row.line.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right font-mono text-aqua font-semibold">{formatScore(row.mean)}</td>
                  <td className="px-4 py-3 text-right font-mono text-text-primary">{formatPercent(row.overPct)}</td>
                  <td className="px-4 py-3 text-right font-mono text-text-primary">{formatOdds(row.fairOdds)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`rounded-full border px-2 py-0.5 font-mono font-semibold ${edgeTone(row.edgePct)}`}>
                      {row.edgePct != null ? `${row.edgePct > 0 ? "+" : ""}${row.edgePct.toFixed(1)}%` : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-text-primary">{formatPercent(row.confidence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-lg border border-bone/[0.08] bg-ink/30 p-4">
          <p className="text-[12px] font-semibold text-bone/70 mb-2">About these simulations</p>
          <p className="text-[12px] text-bone/60 leading-relaxed">
            This page runs the player simulation engine on a sample of upcoming props. Each projection runs 5,000 Monte Carlo iterations
            with normal distribution sampling. The engine calculates baseline means by prop type, derives fair odds from simulation probability,
            and computes edge vs the book's implied probability. Edge % &gt; 8 indicates strong opportunity.
          </p>
        </div>
      </div>
    </div>
  );
}
