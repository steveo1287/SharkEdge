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
    return await getProviderReadinessView();
  } catch {
    return null;
  }
}

export default async function BoardPage({ searchParams }: BoardPageProps) {
  const resolvedSearch = (await searchParams) ?? {};

  const [board, readiness] = await Promise.all([
    getBoardCommandData(resolvedSearch),
    getSafeProviderReadiness()
  ]);

  const railItems = board.verifiedGames.slice(0, 8).map((game, index) => ({
    id: game.id,
    label: `${game.awayTeam.abbreviation} ${game.homeTeam.abbreviation}`,
    note: new Date(game.startTime).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit"
    }),
    href: game.detailHref ?? `/game/${game.id}`,
    active: index === 0
  }));

  return (
    <div className="grid gap-4">
      <MobileTopBar title="LiveEdgeBoard" subtitle="SharkEdge" />

      <section className="mobile-surface !pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="rounded-full border border-white/8 bg-[#0c1320] px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-slate-300">
            SHARKEDGE
          </div>
          <div className="rounded-full border border-[#2dd36f]/20 bg-[#2dd36f]/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#2dd36f]">
            {board.boardData.source}
          </div>
        </div>

        <div className="mt-4">
          <SectionTabs
            items={[
              { label: "ALL", active: board.selectedLeague === "ALL" },
              { label: "NBA" },
              { label: "MLB" },
              { label: "NHL" }
            ]}
          />
        </div>

        <div className="mt-4 grid grid-cols-5 gap-2 text-center text-[11px] uppercase tracking-[0.14em] text-slate-500">
          {["All Tiers", "Tier A", "Tier B", "Tier C", "Tier D"].map((item) => (
            <div
              key={item}
              className="rounded-[14px] border border-white/8 bg-white/[0.03] px-2 py-3"
            >
              {item}
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">
          {["Shark", "+EV", "Time", "+EV only", "Kalshi"].map((item, index) => (
            <div
              key={item}
              className={
                index === 0
                  ? "rounded-full bg-white px-3 py-1 text-slate-950"
                  : "rounded-full border border-white/8 px-3 py-1"
              }
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      {readiness ? (
        <section className="mobile-surface">
          <div className="text-sm leading-6 text-slate-300">{readiness.summary}</div>
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

        {!board.verifiedGames.length ? (
          <div className="mobile-surface text-sm leading-6 text-slate-400">
            {board.boardData.liveMessage ??
              board.boardData.sourceNote ??
              "No verified board rows are available right now."}
          </div>
        ) : null}
      </section>
    </div>
  );
}