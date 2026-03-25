import { BoardFilterBar } from "@/components/board/filter-bar";
import { LeagueSnapshot } from "@/components/board/league-snapshot";
import { SportSection } from "@/components/board/sport-section";
import { SportSupportGrid } from "@/components/board/sport-support-grid";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { StatCard } from "@/components/ui/stat-card";
import { parseBoardFilters, getBoardPageData } from "@/services/odds/odds-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = parseBoardFilters(resolved);
  const data = await getBoardPageData(filters);
  const liveCount = data.sportSections.filter((section) => section.status === "LIVE").length;
  const partialCount = data.sportSections.filter((section) => section.status === "PARTIAL").length;
  const comingSoonCount = data.sportSections.filter((section) => section.status === "COMING SOON").length;

  return (
    <div className="grid gap-6">
      <SectionTitle
        title="Pregame market board"
        description={
          data.source === "live"
            ? "Every target sport is visible on the board now. Team sports with real score/state adapters render live support honestly, while combat sports stay in view with explicit readiness states."
            : "The support model is still visible even when the current odds feed is unavailable, so unsupported sports never disappear behind fake empty board states."
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Games" value={`${data.summary.totalGames}`} note="Current board rows" />
        <StatCard label="Props" value={`${data.summary.totalProps}`} note="Basic player prop coverage" />
        <StatCard label="Books" value={`${data.summary.totalSportsbooks}`} note="Major U.S. books" />
        <StatCard
          label="LIVE"
          value={`${liveCount}`}
          note="Real score/state adapters wired"
        />
        <StatCard
          label="Coverage"
          value={`${partialCount} / ${comingSoonCount}`}
          note="Partial / Coming soon"
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
          <div className="text-xs uppercase tracking-[0.2em] text-sky-300">Phase 1.5 Live State</div>
          <div className="mt-3 font-display text-2xl font-semibold text-white">
            The homepage now shows the full SharkEdge sport map without pretending every league is equally live.
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            Score/state support, current odds coverage, and historical ingestion are now split into separate provider lanes. That lets us show all eight target sports immediately while staying explicit about what is LIVE, what is PARTIAL, and what is still COMING SOON.
          </p>
        </div>
        <div className="grid gap-2 rounded-2xl border border-line bg-slate-950/60 p-4 text-sm text-slate-300">
          <div>Live now: NBA, NCAAB, MLB, NHL, NFL, NCAAF</div>
          <div>Partial: UFC</div>
          <div>Coming soon: Boxing</div>
          <div>{data.sourceNote}</div>
        </div>
      </Card>

      <SportSupportGrid sections={data.sportSections} />

      <div className="grid gap-4 xl:grid-cols-2">
        {data.snapshots.map((snapshot) => (
          <LeagueSnapshot key={snapshot.league.id} snapshot={snapshot} />
        ))}
      </div>

      {data.liveMessage ? (
        <EmptyState title="Live board coming next" description={data.liveMessage} />
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
