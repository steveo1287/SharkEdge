import Link from "next/link";

import { LiveEdgeBoardCard } from "@/components/board/live-edge-board-card";
import { HorizontalEventRail } from "@/components/mobile/horizontal-event-rail";
import { MobileTopBar } from "@/components/mobile/mobile-top-bar";
import { SectionTabs } from "@/components/mobile/section-tabs";
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

export default async function BoardPage({ searchParams }: BoardPageProps) {
  const resolvedSearch = (await searchParams) ?? {};

  const [board, readiness] = await Promise.all([
    getBoardCommandData(resolvedSearch),
    getSafeProviderReadiness()
  ]);

  const railItems = board.verifiedGames.length
    ? board.verifiedGames.slice(0, 8).map((game, index) => ({
        id: game.id,
        label: `${game.awayTeam.abbreviation} ${game.homeTeam.abbreviation}`,
        note: new Date(game.startTime).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit"
        }),
        href: game.detailHref ?? `/game/${game.id}`,
        active: index === 0
      }))
    : board.scoreboardItems.slice(0, 8).map(({ item }, index) => ({
        id: item.id,
        label: item.label,
        note:
          item.scoreboard ??
          item.stateDetail ??
          new Date(item.startTime).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit"
          }),
        href: item.detailHref ?? null,
        active: index === 0
      }));

  const activeBoardSource = readiness?.liveBoardProvider ?? board.boardData.source;
  const boardStatusCopy = board.verifiedGames.length
    ? `${board.verifiedGames.length} verified ML/spread/total rows are live on the board.`
    : board.boardData.liveMessage ??
      board.boardData.sourceNote ??
      "No verified ML/spread/total rows are available right now.";

  return (
    <div className="grid gap-4">
      <MobileTopBar title="LiveEdgeBoard" subtitle="SharkEdge" />

      <section className="mobile-surface !pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="rounded-full border border-white/8 bg-[#0c1320] px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-slate-300">
            SHARKEDGE
          </div>
          <div className="rounded-full border border-[#2dd36f]/20 bg-[#2dd36f]/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#2dd36f]">
            {activeBoardSource}
          </div>
        </div>

        <div className="mt-4">
          <SectionTabs
            items={[
              { label: "ALL", href: buildLeagueHref("ALL"), active: board.selectedLeague === "ALL" },
              { label: "NBA", href: buildLeagueHref("NBA"), active: board.selectedLeague === "NBA" },
              { label: "MLB", href: buildLeagueHref("MLB"), active: board.selectedLeague === "MLB" }
            ]}
          />
        </div>

        <div className="mt-4 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Board status</div>
          <div className="mt-2 text-sm leading-6 text-slate-300">{boardStatusCopy}</div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">
            {[
              `${board.selectedLeague === "ALL" ? "ALL" : board.selectedLeague} scope`,
              "Pregame only",
              "Moneyline / Spread / Total",
              "No props in this pass"
            ].map((item) => (
              <div key={item} className="rounded-full border border-white/8 px-3 py-1">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {readiness ? (
        <section className="mobile-surface">
          <div className="text-sm leading-6 text-slate-300">{readiness.summary}</div>
          <div className="mt-2 text-sm leading-6 text-slate-400">{readiness.safePathSummary}</div>
          <div className="mt-3 text-[11px] uppercase tracking-[0.16em] text-slate-500">
            {readiness.generatedAt
              ? `Updated ${new Date(readiness.generatedAt).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit"
                })}`
              : "Provider status pending"}
          </div>
        </section>
      ) : null}

      {railItems.length ? <HorizontalEventRail items={railItems} /> : null}

      <section className="grid gap-3">
        {board.verifiedGames.slice(0, 8).map((game) => (
          <LiveEdgeBoardCard key={game.id} game={game} />
        ))}

        {!board.verifiedGames.length && board.scoreboardItems.length ? (
          <div className="mobile-surface">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-[1.05rem] font-semibold text-white">Live scores</div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Odds fallback</div>
            </div>
            <div className="grid gap-3">
              {board.scoreboardItems.slice(0, 8).map(({ section, item }) => (
                <Link
                  key={`${section.leagueKey}-${item.id}`}
                  href={item.detailHref ?? "/games"}
                  className="rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                        {section.leagueKey} - {item.status}
                      </div>
                      <div className="mt-1 text-[0.98rem] font-semibold text-white">{item.label}</div>
                      <div className="mt-2 text-sm text-slate-400">
                        {item.scoreboard ?? item.stateDetail ?? "Score feed connected, odds temporarily unavailable."}
                      </div>
                    </div>
                    <div className="text-right text-[11px] text-slate-500">
                      {new Date(item.startTime).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit"
                      })}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {!board.verifiedGames.length ? (
          <div className="mobile-surface text-sm leading-6 text-slate-400">{boardStatusCopy}</div>
        ) : null}
      </section>
    </div>
  );
}
