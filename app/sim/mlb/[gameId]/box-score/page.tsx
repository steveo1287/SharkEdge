import { notFound } from "next/navigation";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MlbFranchiseTabs } from "@/components/sim/mlb-franchise-tabs";
import { getMlbFranchiseGameStats, statText, type FranchisePlayerRow } from "@/services/simulation/mlb-franchise-game-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ gameId: string }> };

function one(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function HeaderCell({ children }: { children: string }) {
  return <div className="text-[0.58rem] uppercase tracking-[0.16em] text-slate-500">{children}</div>;
}

function Cell({ children }: { children: string }) {
  return <div className="tabular-nums text-sm text-slate-300">{children}</div>;
}

function HitterTable({ title, hitters }: { title: string; hitters: NonNullable<NonNullable<Awaited<ReturnType<typeof getMlbFranchiseGameStats>>>["playerStats"]>["awayHitters"] }) {
  return (
    <Card className="surface-panel overflow-hidden p-5">
      <div className="mb-4 font-display text-2xl font-semibold text-white">{title}</div>
      <div className="grid grid-cols-[2fr_repeat(8,0.55fr)] gap-3 border-b border-white/8 pb-2">
        <HeaderCell>Player</HeaderCell><HeaderCell>PA</HeaderCell><HeaderCell>H</HeaderCell><HeaderCell>TB</HeaderCell><HeaderCell>HR</HeaderCell><HeaderCell>R</HeaderCell><HeaderCell>RBI</HeaderCell><HeaderCell>K</HeaderCell><HeaderCell>SB</HeaderCell>
      </div>
      <div className="divide-y divide-white/8">
        {hitters.map((hitter) => (
          <div key={hitter.playerId} className="grid grid-cols-[2fr_repeat(8,0.55fr)] gap-3 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{hitter.playerName}</div>
              <div className="text-[11px] text-slate-500">#{hitter.battingOrder} · {hitter.team}</div>
            </div>
            <Cell>{one(hitter.expectedPlateAppearances)}</Cell>
            <Cell>{one(hitter.expectedHits)}</Cell>
            <Cell>{one(hitter.expectedTotalBases)}</Cell>
            <Cell>{one(hitter.expectedHomeRuns)}</Cell>
            <Cell>{one(hitter.expectedRuns)}</Cell>
            <Cell>{one(hitter.expectedRbi)}</Cell>
            <Cell>{one(hitter.expectedStrikeouts)}</Cell>
            <Cell>{pct(hitter.stolenBaseProbability)}</Cell>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StarterTable({ title, starters }: { title: string; starters: NonNullable<NonNullable<Awaited<ReturnType<typeof getMlbFranchiseGameStats>>>["playerStats"]>["awayStarter"][] }) {
  const clean = starters.filter(Boolean);
  if (!clean.length) return null;
  return (
    <Card className="surface-panel overflow-hidden p-5">
      <div className="mb-4 font-display text-2xl font-semibold text-white">{title}</div>
      <div className="grid grid-cols-[2fr_repeat(7,0.65fr)] gap-3 border-b border-white/8 pb-2">
        <HeaderCell>Pitcher</HeaderCell><HeaderCell>IP</HeaderCell><HeaderCell>Outs</HeaderCell><HeaderCell>K</HeaderCell><HeaderCell>ER</HeaderCell><HeaderCell>H</HeaderCell><HeaderCell>BB</HeaderCell><HeaderCell>HR</HeaderCell>
      </div>
      <div className="divide-y divide-white/8">
        {clean.map((pitcher) => (
          <div key={pitcher!.pitcherId} className="grid grid-cols-[2fr_repeat(7,0.65fr)] gap-3 py-3">
            <div>
              <div className="truncate text-sm font-semibold text-white">{pitcher!.pitcherName}</div>
              <div className="text-[11px] text-slate-500">{pitcher!.team}</div>
            </div>
            <Cell>{one(pitcher!.expectedInningsPitched)}</Cell>
            <Cell>{one(pitcher!.expectedOuts)}</Cell>
            <Cell>{one(pitcher!.expectedStrikeouts)}</Cell>
            <Cell>{one(pitcher!.expectedEarnedRuns)}</Cell>
            <Cell>{one(pitcher!.expectedHitsAllowed)}</Cell>
            <Cell>{one(pitcher!.expectedWalksAllowed)}</Cell>
            <Cell>{one(pitcher!.expectedHomeRunsAllowed)}</Cell>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ActualBoxScore({ players }: { players: FranchisePlayerRow[] }) {
  if (!players.length) return null;
  return (
    <Card className="surface-panel overflow-hidden p-5">
      <div className="mb-4 font-display text-2xl font-semibold text-white">Tracked actuals</div>
      <div className="grid grid-cols-[2fr_repeat(9,0.55fr)] gap-3 border-b border-white/8 pb-2">
        <HeaderCell>Player</HeaderCell><HeaderCell>H</HeaderCell><HeaderCell>TB</HeaderCell><HeaderCell>R</HeaderCell><HeaderCell>RBI</HeaderCell><HeaderCell>SB</HeaderCell><HeaderCell>IP</HeaderCell><HeaderCell>Outs</HeaderCell><HeaderCell>K</HeaderCell><HeaderCell>ER</HeaderCell>
      </div>
      <div className="divide-y divide-white/8">
        {players.map((player) => (
          <div key={player.playerId} className="grid grid-cols-[2fr_repeat(9,0.55fr)] gap-3 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{player.playerName}</div>
              <div className="text-[11px] text-slate-500">{player.starter ? "starter" : player.status ?? "player"}</div>
            </div>
            <Cell>{statText(player.stats, ["hits", "H"])}</Cell>
            <Cell>{statText(player.stats, ["totalBases", "TB"])}</Cell>
            <Cell>{statText(player.stats, ["runs", "R"])}</Cell>
            <Cell>{statText(player.stats, ["rbi", "RBI", "runsBattedIn"])}</Cell>
            <Cell>{statText(player.stats, ["stolenBases", "SB"])}</Cell>
            <Cell>{statText(player.stats, ["inningsPitched", "IP"])}</Cell>
            <Cell>{statText(player.stats, ["outs", "pitcherOuts"])}</Cell>
            <Cell>{statText(player.stats, ["strikeouts", "SO", "K"])}</Cell>
            <Cell>{statText(player.stats, ["earnedRuns", "ER"])}</Cell>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default async function MlbBoxScorePage({ params }: PageProps) {
  const { gameId } = await params;
  const decodedId = decodeURIComponent(gameId);
  const data = await getMlbFranchiseGameStats(decodedId);
  if (!data) notFound();

  const playerStats = data.playerStats;

  return (
    <div className="grid gap-6">
      <MlbFranchiseTabs gameId={decodedId} active="box-score" />

      <section className="surface-panel-strong p-6">
        <div className="section-kicker">Box score</div>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white">
          {data.projection.matchup.away} @ {data.projection.matchup.home}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Franchise-style player table. Projections first; actual box score appears when tracked.
        </p>
      </section>

      {playerStats ? (
        <>
          <StarterTable title="Starting pitchers" starters={[playerStats.awayStarter, playerStats.homeStarter]} />
          <HitterTable title={`${data.projection.matchup.away} hitters`} hitters={playerStats.awayHitters} />
          <HitterTable title={`${data.projection.matchup.home} hitters`} hitters={playerStats.homeHitters} />
        </>
      ) : (
        <EmptyState title="No projected box score available" description="The game loaded, but player stat projections are not available yet." />
      )}

      <ActualBoxScore players={data.actualPlayers} />
    </div>
  );
}
