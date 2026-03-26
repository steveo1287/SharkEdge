import { BoardFilterBar } from "@/components/board/filter-bar";
import { LeagueSnapshot } from "@/components/board/league-snapshot";
import { SportSection } from "@/components/board/sport-section";
import { SportSupportGrid } from "@/components/board/sport-support-grid";
import { TopPlaysPanel } from "@/components/board/top-plays-panel";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { StatCard } from "@/components/ui/stat-card";
import {
  getBoardPageData,
  getTopPlayCards,
  parseBoardFilters
} from "@/services/odds/odds-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = parseBoardFilters(resolved);
  const [data, topPlays] = await Promise.all([
    getBoardPageData(filters),
    getTopPlayCards(8)
  ]);
  const liveCount = data.sportSections.filter((section) => section.status === "LIVE").length;
  const partialCount = data.sportSections.filter((section) => section.status === "PARTIAL").length;
  const comingSoonCount = data.sportSections.filter((section) => section.status === "COMING_SOON").length;
  const livePropSportCount = data.sportSections.filter(
    (section) => section.propsStatus === "LIVE"
  ).length;
  const staleCount = data.sportSections.filter((section) => section.stale).length;
  const coverageLabel = data.source === "live" ? "Live board" : "Coverage map";

  return (
    <div className="grid gap-6">
      <SectionTitle
        title="Pregame market board"
        description={
          data.source === "live"
            ? "Every target sport stays visible, but only sports with real board support render live rows. Partial and pending leagues stay in view with explicit provider states."
            : "The support map stays visible even when the current odds feed is unavailable, so SharkEdge never hides unsupported sports behind fake empty board states."
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label={data.source === "live" ? "Board Rows" : "Tracked Events"}
          value={`${data.summary.totalGames}`}
          note={
            data.source === "live"
              ? "Current rows rendered from the active board feed"
              : "Score/state visibility only while current odds are limited"
          }
        />
        <StatCard
          label="Board Source"
          value={coverageLabel}
          note={data.source === "live" ? "Current odds and score state connected" : "Support map and fallback score state only"}
        />
        <StatCard
          label="LIVE Sports"
          value={`${liveCount}`}
          note="Real score/state adapters and matchup coverage"
        />
        <StatCard
          label="Partial / Soon"
          value={`${partialCount} / ${comingSoonCount}`}
          note="Visible in-product without fake live board depth"
        />
        <StatCard
          label="Props Live"
          value={`${livePropSportCount}`}
          note={staleCount ? `${staleCount} section${staleCount === 1 ? "" : "s"} flagged stale` : "Fresh provider state in the current window"}
        />
      </div>

      <BoardFilterBar
        leagues={data.leagues}
        sportsbooks={data.sportsbooks}
        dates={data.availableDates}
        defaults={filters}
      />

      <Card className="grid gap-3 p-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-sky-300">
            {data.source === "live" ? "Board Live" : "Coverage View"}
          </div>
          <div className="mt-3 font-display text-2xl font-semibold text-white">
            Multi-sport market scanning with honest board depth by league.
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            Basketball remains the deepest live prop coverage right now, while the broader board, matchup context, and historical foundation keep every target sport visible without pretending they all have the same adapter depth.
          </p>
        </div>
        <div className="grid gap-2 rounded-2xl border border-line bg-slate-950/60 p-4 text-sm text-slate-300">
          <div>Live now: NBA, NCAAB, MLB, NHL, NFL, NCAAF</div>
          <div>Partial: UFC</div>
          <div>Coming soon: Boxing</div>
          <div>{data.source === "live" ? "Current board feed connected" : "Current board feed limited"}</div>
          <div>{data.sourceNote}</div>
        </div>
      </Card>

      <SportSupportGrid sections={data.sportSections} />

      <section className="grid gap-4">
        <SectionTitle
          title="Top Plays"
          description="Only real live prop signals show up here. If the current feed does not surface a real edge, SharkEdge leaves this section blank instead of manufacturing a play."
        />
        {topPlays.length ? (
          <TopPlaysPanel plays={topPlays} />
        ) : (
          <Card className="p-5 text-sm leading-7 text-slate-400">
            Top Plays is live only when the current prop mesh returns real positive market-EV spots. If there is no real edge in the feed, SharkEdge leaves this blank instead of inventing a play.
          </Card>
        )}
      </section>

      {data.snapshots.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.snapshots.map((snapshot) => (
            <LeagueSnapshot key={snapshot.league.id} snapshot={snapshot} />
          ))}
        </div>
      ) : null}

      {data.liveMessage ? (
        <EmptyState title="Limited live window" description={data.liveMessage} />
      ) : null}

      {data.sportSections.length ? (
        <div className="grid gap-6">
          {data.sportSections.map((section) => (
            <SportSection key={section.leagueKey} section={section} focusMarket={filters.market} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No sports match this filter"
          description="Widen the league or date filter to bring the full support map back into view."
        />
      )}
    </div>
  );
}
