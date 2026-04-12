import Link from "next/link";

import { LiveEdgeBoardCard } from "@/components/board/live-edge-board-card";
import { MobileTopBar } from "@/components/mobile/mobile-top-bar";
import { SectionTabs } from "@/components/mobile/section-tabs";
import type { GameCardView } from "@/lib/types/domain";
import { getBoardCommandData } from "@/services/board/board-command-service";
import { getProviderReadinessView } from "@/services/current-odds/provider-readiness-service";

export const dynamic = "force-dynamic";

type BoardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SafeProviderReadiness = Awaited<ReturnType<typeof getProviderReadinessView>> | null;

async function getSafeProviderReadiness(): Promise<SafeProviderReadiness> {
  try {
    return await getProviderReadinessView({ leagues: ["NBA", "MLB"] });
  } catch {
    return null;
  }
}

function buildLeagueHref(league: "ALL" | "NBA" | "MLB") {
  return league === "ALL" ? "/board" : `/board?league=${league}`;
}

function formatTimeLabel(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatUpdatedLabel(value: string | null | undefined) {
  if (!value) {
    return "Update pending";
  }

  return `Updated ${new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  })}`;
}

function formatMovementValue(movement: number) {
  const absolute = Math.abs(movement);

  if (!absolute) {
    return "Flat";
  }

  return `${movement > 0 ? "↑" : "↓"} ${absolute >= 10 ? absolute.toFixed(0) : absolute.toFixed(1)}`;
}

function getLeadMover(game: GameCardView) {
  const candidates = [
    { label: "ML", movement: game.moneyline.movement },
    { label: "SPR", movement: game.spread.movement },
    { label: "TOT", movement: game.total.movement }
  ];

  return [...candidates].sort((left, right) => Math.abs(right.movement) - Math.abs(left.movement))[0];
}

function getLeagueVerifiedCount(games: GameCardView[], league: "NBA" | "MLB") {
  return games.filter((game) => game.leagueKey === league).length;
}

export default async function BoardPage({ searchParams }: BoardPageProps) {
  const resolvedSearch = (await searchParams) ?? {};

  const [board, readiness] = await Promise.all([
    getBoardCommandData(resolvedSearch),
    getSafeProviderReadiness()
  ]);

  const activeBoardSource = readiness?.liveBoardProvider ?? board.boardData.source;
  const uniqueBooks = Array.from(
    new Set(
      board.verifiedGames
        .flatMap((game) => [
          game.selectedBook?.name,
          game.moneyline.bestBook,
          game.spread.bestBook,
          game.total.bestBook
        ])
        .filter((value): value is string => Boolean(value && value !== "No book"))
    )
  );
  const movers = board.movers.slice(0, 3);
  const boardStatusCopy = board.verifiedGames.length
    ? `${board.verifiedGames.length} verified pregame rows are live across moneyline, spread, and total.`
    : board.boardData.liveMessage ??
      board.boardData.sourceNote ??
      "No verified pregame rows are available right now.";

  return (
    <div className="grid gap-4">
      <section className="mobile-hero">
        <MobileTopBar
          title="Board"
          subtitle="SharkEdge Live"
          compact
          rightSlot={
            <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              {activeBoardSource}
            </div>
          }
        />

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.45fr,1fr]">
          <div>
            <div className="text-[1.45rem] font-display font-semibold tracking-tight text-white">
              Verified market board
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Real pregame moneyline, spread, and total pricing for NBA and MLB. No props, no decorative filler, and no half-live cards pretending to be ready.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
              {[
                `${board.selectedLeague === "ALL" ? "All leagues" : board.selectedLeague} scope`,
                "Pregame only",
                "ML / Spread / Total",
                readiness?.safePathSummary ?? "Verified board path"
              ].map((item) => (
                <div key={item} className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[18px] border border-white/8 bg-[#0b1320] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Verified</div>
              <div className="mt-2 text-[1.35rem] font-semibold text-white">{board.verifiedGames.length}</div>
              <div className="mt-1 text-xs text-slate-400">rows live</div>
            </div>
            <div className="rounded-[18px] border border-white/8 bg-[#0b1320] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Books</div>
              <div className="mt-2 text-[1.35rem] font-semibold text-white">{uniqueBooks.length}</div>
              <div className="mt-1 text-xs text-slate-400">active books</div>
            </div>
            <div className="rounded-[18px] border border-white/8 bg-[#0b1320] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Fallback</div>
              <div className="mt-2 text-[1.35rem] font-semibold text-white">{board.scoreboardItems.length}</div>
              <div className="mt-1 text-xs text-slate-400">score rows</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mobile-surface !py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <SectionTabs
            items={[
              {
                label: "ALL",
                href: buildLeagueHref("ALL"),
                active: board.selectedLeague === "ALL",
                count: board.verifiedGames.length || null
              },
              {
                label: "NBA",
                href: buildLeagueHref("NBA"),
                active: board.selectedLeague === "NBA",
                count: getLeagueVerifiedCount(board.verifiedGames, "NBA") || null
              },
              {
                label: "MLB",
                href: buildLeagueHref("MLB"),
                active: board.selectedLeague === "MLB",
                count: getLeagueVerifiedCount(board.verifiedGames, "MLB") || null
              }
            ]}
          />

          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
            <div className="rounded-full border border-white/8 px-3 py-1.5">{formatUpdatedLabel(readiness?.generatedAt)}</div>
            <div className="rounded-full border border-white/8 px-3 py-1.5">{boardStatusCopy}</div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.4fr,1fr]">
        <div className="mobile-surface !py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Feed health</div>
              <div className="mt-1 text-sm text-slate-200">{readiness?.summary ?? "Provider status is temporarily unavailable."}</div>
            </div>
            <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-slate-300">
              {activeBoardSource}
            </div>
          </div>
        </div>

        {movers.length ? (
          <div className="mobile-surface !py-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Top movers</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {movers.map((game) => {
                const mover = getLeadMover(game);
                return (
                  <Link
                    key={game.id}
                    href={game.detailHref ?? `/game/${game.id}`}
                    className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-500/10"
                  >
                    <span className="font-semibold text-white">
                      {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
                    </span>
                    <span className="ml-2 text-slate-400">{mover.label}</span>
                    <span className="ml-2 font-semibold text-sky-300">{formatMovementValue(mover.movement)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Verified board</div>
            <div className="mt-1 text-[1rem] font-semibold text-white">Live market rows</div>
          </div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
            {board.verifiedGames.length ? `${board.verifiedGames.length} games` : "Awaiting verified rows"}
          </div>
        </div>

        {board.verifiedGames.slice(0, 10).map((game) => (
          <LiveEdgeBoardCard key={game.id} game={game} />
        ))}

        {!board.verifiedGames.length ? (
          <div className="mobile-surface">
            <div className="text-[1rem] font-semibold text-white">Verified board is empty</div>
            <div className="mt-2 text-sm leading-6 text-slate-400">{boardStatusCopy}</div>
          </div>
        ) : null}
      </section>

      {board.scoreboardItems.length ? (
        <section className="mobile-surface">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Scores only</div>
              <div className="mt-1 text-[1rem] font-semibold text-white">Fallback scoreboard</div>
            </div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">No verified odds</div>
          </div>

          <div className="mt-4 grid gap-3">
            {board.scoreboardItems.slice(0, 6).map(({ section, item }) => (
              <Link
                key={`${section.leagueKey}-${item.id}`}
                href={item.detailHref ?? "/games"}
                className="rounded-[18px] border border-white/[0.08] bg-[#0b1320] px-4 py-3 transition hover:border-white/[0.12] hover:bg-white/[0.04]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      {section.leagueKey} · {item.status}
                    </div>
                    <div className="mt-1 text-[0.98rem] font-semibold text-white">{item.label}</div>
                    <div className="mt-2 text-sm text-slate-400">
                      {item.scoreboard ?? item.stateDetail ?? "Score feed connected. Odds are temporarily unavailable."}
                    </div>
                  </div>
                  <div className="text-right text-[11px] uppercase tracking-[0.16em] text-slate-500">
                    {formatTimeLabel(item.startTime)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
