import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { LeagueKey, LeagueSnapshotView } from "@/lib/types/domain";
import { getTeamBranding } from "@/lib/utils/team-branding";

type ScoreStripProps = {
  snapshots: LeagueSnapshotView[];
};

type ScoreItem = {
  id: string;
  leagueKey: LeagueKey;
  label: string;
  status: string;
  stateDetail: string | null;
  scoreLabel: string;
  href: string;
  awayName: string;
  homeName: string;
  awayAbbr: string;
  homeAbbr: string;
};

function getStatusTone(status: string) {
  if (status === "LIVE") return "success" as const;
  if (status === "FINAL") return "neutral" as const;
  return "muted" as const;
}

function buildItems(snapshots: LeagueSnapshotView[]): ScoreItem[] {
  return snapshots.flatMap((snapshot) =>
    (snapshot.featuredGames ?? []).slice(0, 6).map((game) => ({
      id: game.id,
      leagueKey: snapshot.league.key,
      label: `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`,
      status: game.status,
      stateDetail: game.stateDetail,
      scoreLabel:
        typeof game.awayScore === "number" && typeof game.homeScore === "number"
          ? `${game.awayScore}-${game.homeScore}`
          : new Date(game.startTime).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit"
            }),
      href: game.href,
      awayName: game.awayTeam.name,
      homeName: game.homeTeam.name,
      awayAbbr: game.awayTeam.abbreviation,
      homeAbbr: game.homeTeam.abbreviation
    }))
  );
}

function TeamPill({ name, abbr, leagueKey }: { name: string; abbr: string; leagueKey: LeagueKey }) {
  const branding = getTeamBranding(
    {
      id: `${leagueKey}-${abbr}`,
      leagueId: leagueKey,
      name,
      abbreviation: abbr,
      externalIds: {}
    },
    leagueKey
  );

  return (
    <div className="inline-flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black uppercase text-white"
        style={{ background: branding.background, boxShadow: `0 0 0 1px ${branding.ring} inset` }}
      >
        {abbr.slice(0, 2)}
      </div>
      <span className="truncate text-xs font-semibold text-white">{abbr}</span>
    </div>
  );
}

export function ScoreStrip({ snapshots }: ScoreStripProps) {
  const items = buildItems(snapshots).slice(0, 18);

  if (!items.length) {
    return null;
  }

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="section-kicker">Live strip</div>
          <div className="text-xl font-semibold text-white">Scores, states, and instant entry points</div>
        </div>
        <Link href="/games" className="text-sm text-slate-400 transition hover:text-white">
          Open games
        </Link>
      </div>

      <div className="hide-scrollbar flex gap-3 overflow-x-auto pb-2">
        {items.map((item) => (
          <Link
            key={`${item.leagueKey}-${item.id}`}
            href={item.href}
            className="min-w-[260px] rounded-[1.35rem] border border-white/8 bg-[#08111b]/90 p-4 transition hover:border-sky-400/25 hover:bg-white/[0.03]"
          >
            <div className="flex items-center justify-between gap-3">
              <Badge tone={getStatusTone(item.status)}>{item.status}</Badge>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{item.leagueKey}</div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <TeamPill name={item.awayName} abbr={item.awayAbbr} leagueKey={item.leagueKey} />
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">at</div>
              <TeamPill name={item.homeName} abbr={item.homeAbbr} leagueKey={item.leagueKey} />
            </div>

            <div className="mt-4 text-2xl font-black tracking-tight text-white">{item.scoreLabel}</div>
            <div className="mt-1 text-sm leading-6 text-slate-400">
              {item.stateDetail ?? "Open the matchup desk for the full board, props, history, and context."}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
