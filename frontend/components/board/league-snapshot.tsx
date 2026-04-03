import Link from "next/link";

import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { formatLongDate } from "@/lib/formatters/date";
import type { LeagueSnapshotView } from "@/lib/types/domain";
import { buildInternalStoryHref } from "@/lib/utils/stories";

type LeagueSnapshotProps = {
  snapshot: LeagueSnapshotView;
};

function FeaturedGamesGrid({ snapshot }: LeagueSnapshotProps) {
  if (!snapshot.featuredGames?.length) {
    return null;
  }

  return (
    <div className="grid gap-3 2xl:grid-cols-2">
      {snapshot.featuredGames.map((game) => {
        const awayStanding = snapshot.standings.find((row) => row.team.id === game.awayTeam.id);
        const homeStanding = snapshot.standings.find((row) => row.team.id === game.homeTeam.id);

        return (
          <Link
            key={game.id}
            href={game.href}
            className="rounded-2xl border border-line bg-slate-950/65 px-4 py-4 transition hover:border-sky-400/30 hover:bg-slate-900/80"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {formatLongDate(game.startTime)}
                </div>
                <div className="mt-2 font-display text-xl text-white">
                  {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
                </div>
              </div>
              <div className="text-right text-xs uppercase tracking-[0.18em] text-sky-300">
                {game.status}
              </div>
            </div>
            <div className="mt-3 text-sm text-slate-300">
              {typeof game.awayScore === "number" || typeof game.homeScore === "number"
                ? `${game.awayTeam.abbreviation} ${game.awayScore ?? "-"} | ${game.homeTeam.abbreviation} ${game.homeScore ?? "-"}`
                : game.stateDetail ?? "Open matchup for live stats"}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {[
                { team: game.awayTeam, standing: awayStanding },
                { team: game.homeTeam, standing: homeStanding }
              ].map(({ team, standing }) => (
                <div
                  key={team.id}
                  className="rounded-2xl border border-line/70 bg-slate-900/70 px-3 py-3"
                >
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {team.abbreviation}
                  </div>
                  <div className="mt-2 text-sm text-white">
                    {standing?.record ?? "Open matchup"}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {standing
                      ? `${standing.streak} | ${standing.netRating > 0 ? "+" : ""}${standing.netRating.toFixed(1)}`
                      : "Team and player detail live on matchup page"}
                  </div>
                </div>
              ))}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function LeagueNewsRail({ snapshot }: LeagueSnapshotProps) {
  if (snapshot.seasonState === "OFFSEASON") {
    const items = snapshot.offseasonItems ?? [];
    return (
      <div className="grid gap-3">
        {items.length ? (
          items.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-line bg-slate-950/65 px-4 py-4"
            >
              <div className="text-xs uppercase tracking-[0.18em] text-sky-300">{item.title}</div>
              <div className="mt-3 text-sm leading-6 text-slate-300">{item.body}</div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-line bg-slate-950/65 px-4 py-4 text-sm leading-6 text-slate-400">
            Offseason context is active here, but no free league-specific headline feed is wired
            yet. SharkEdge keeps this clean instead of replaying stale scores.
          </div>
        )}
      </div>
    );
  }

  if (!snapshot.newsItems?.length) {
    return (
      <div className="rounded-2xl border border-line bg-slate-950/65 px-4 py-4 text-sm leading-6 text-slate-400">
        No current free headline feed returned for {snapshot.league.key} right now. Featured
        matchups and standings stay visible without padding this rail with filler.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {snapshot.newsItems.map((item) => (
        <Link
          key={item.id}
          href={buildInternalStoryHref({
            leagueKey: snapshot.league.key,
            id: item.id,
            title: item.title,
            summary: item.summary,
            category: item.category,
            imageUrl: item.imageUrl,
            publishedAt: item.publishedAt,
            sourceUrl: item.href,
            eventId: item.eventId,
            eventHref: item.eventHref,
            eventLabel: item.eventLabel,
            awayTeam: item.boxscore?.awayTeam,
            homeTeam: item.boxscore?.homeTeam,
            awayScore: item.boxscore?.awayScore ?? null,
            homeScore: item.boxscore?.homeScore ?? null
          })}
          className="overflow-hidden rounded-2xl border border-line bg-slate-950/65 transition hover:border-sky-400/30 hover:bg-slate-900/80"
        >
          {item.imageUrl ? (
            <div className="aspect-[16/8] w-full overflow-hidden border-b border-line/70 bg-slate-900/80">
              <img
                src={item.imageUrl}
                alt={item.title}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          ) : null}
          <div className="px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.18em] text-sky-300">
                {item.category ?? `${snapshot.league.key} update`}
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                {item.publishedAt ? formatLongDate(item.publishedAt) : "Current"}
              </div>
            </div>
            <div className="mt-3 text-sm font-medium leading-6 text-white">{item.title}</div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              {item.summary ?? "Open for the full update."}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function LeagueSnapshot({ snapshot }: LeagueSnapshotProps) {
  const liveCount =
    snapshot.featuredGames?.filter((game) => game.status === "LIVE").length ?? 0;
  const featuredCount = snapshot.featuredGames?.length ?? 0;
  const previousCount = snapshot.previousGames.length;

  return (
    <Card className="surface-panel p-5">
      <SectionTitle
        title={`${snapshot.league.key} snapshot`}
        description={
          snapshot.note ??
          "Standings, current matchups, and league context pulled from the live stats provider when available."
        }
      />

      {snapshot.sourceLabel ? (
        <div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
          {snapshot.sourceLabel}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-[1.4rem] border border-white/8 bg-slate-950/65 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Featured</div>
          <div className="mt-2 text-xl font-semibold text-white">{featuredCount}</div>
          <div className="mt-1 text-xs text-slate-400">Real matchup cards in the current pulse window.</div>
        </div>
          <div className="rounded-[1.4rem] border border-white/8 bg-slate-950/65 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Live Now</div>
          <div className="mt-2 text-xl font-semibold text-white">{liveCount}</div>
          <div className="mt-1 text-xs text-slate-400">Only current provider-returned live states.</div>
        </div>
          <div className="rounded-[1.4rem] border border-white/8 bg-slate-950/65 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Completed</div>
          <div className="mt-2 text-xl font-semibold text-white">{previousCount}</div>
          <div className="mt-1 text-xs text-slate-400">
            Recent real results, capped to keep the pulse card compact.
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="grid gap-4">
          {snapshot.seasonState !== "OFFSEASON" ? (
            <FeaturedGamesGrid snapshot={snapshot} />
          ) : null}

          {snapshot.standings.length ? (
            <div className="grid gap-3">
              {snapshot.standings.slice(0, 4).map((row) => (
                <div
                  key={row.team.id}
                  className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-[1.2rem] border border-white/8 bg-slate-950/65 px-4 py-3"
                >
                  <div className="font-display text-xl text-slate-300">{row.rank}</div>
                  <div>
                    <div className="font-medium text-white">{row.team.name}</div>
                    <div className="text-sm text-slate-400">{row.record}</div>
                  </div>
                  <div className="text-sm text-slate-400">{row.streak}</div>
                  <div className="text-sm font-medium text-emerald-300">
                    {row.netRating > 0 ? "+" : ""}
                    {row.netRating.toFixed(1)}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {snapshot.seasonState !== "OFFSEASON" && snapshot.previousGames.length ? (
            <div className="rounded-[1.2rem] border border-white/8 bg-slate-950/65 px-4 py-4 text-sm leading-7 text-slate-400">
              {snapshot.previousGames.length} recent results are tracked, but this desk stays focused on standings, games, and current league context.
            </div>
          ) : null}
        </div>

        <LeagueNewsRail snapshot={snapshot} />
      </div>
    </Card>
  );
}
