import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { getTeamBranding, getTeamLogoUrl } from "@/lib/utils/team-branding";
import type { LeagueKey, TeamRecord } from "@/lib/types/domain";

type TeamSpotlightCardProps = {
  team: TeamRecord;
  leagueKey: LeagueKey;
  propCount: number;
  verifiedGames: number;
  bestEv: number | null;
  record: string | null;
  streak: string | null;
  rank: number | null;
  recentSummary: string[];
};

export function TeamSpotlightCard({
  team,
  leagueKey,
  propCount,
  verifiedGames,
  bestEv,
  record,
  streak,
  rank,
  recentSummary
}: TeamSpotlightCardProps) {
  const branding = getTeamBranding(team, leagueKey);
  const logoUrl = getTeamLogoUrl(team, leagueKey);

  return (
    <Link
      href={`/leagues/${leagueKey}`}
      className="group rounded-[1.45rem] border border-white/8 bg-[#08111b]/92 p-5 transition hover:border-sky-400/25 hover:bg-white/[0.03]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-sm font-black uppercase text-white"
            style={{ background: branding.background, boxShadow: `0 0 0 1px ${branding.ring} inset` }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={team.name} className="h-10 w-10 object-contain" />
            ) : (
              <span>{branding.monogram}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">{leagueKey}</div>
            <div className="truncate text-xl font-semibold text-white">{team.name}</div>
            <div className="mt-1 text-sm text-slate-400">{team.abbreviation}</div>
          </div>
        </div>
        {rank ? <Badge tone="brand">#{rank}</Badge> : <Badge tone="muted">Radar</Badge>}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-[1rem] border border-white/8 bg-slate-950/65 p-3">
          <div className="text-slate-500">Record</div>
          <div className="mt-1 font-semibold text-white">{record ?? "--"}</div>
        </div>
        <div className="rounded-[1rem] border border-white/8 bg-slate-950/65 p-3">
          <div className="text-slate-500">Best EV</div>
          <div className="mt-1 font-semibold text-emerald-300">
            {typeof bestEv === "number" ? `${bestEv > 0 ? "+" : ""}${bestEv.toFixed(1)}%` : "--"}
          </div>
        </div>
        <div className="rounded-[1rem] border border-white/8 bg-slate-950/65 p-3">
          <div className="text-slate-500">Verified</div>
          <div className="mt-1 font-semibold text-white">{verifiedGames}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge tone="premium">{propCount} prop rows</Badge>
        {streak ? <Badge tone="muted">{streak}</Badge> : null}
      </div>

      {recentSummary.length ? (
        <div className="mt-4 space-y-2 text-sm leading-6 text-slate-400">
          {recentSummary.slice(0, 2).map((line) => (
            <div key={line}>• {line}</div>
          ))}
        </div>
      ) : (
        <div className="mt-4 text-sm leading-6 text-slate-400">
          Open the league desk to follow this team through standings, schedule context, board pricing, and matchup history.
        </div>
      )}
    </Link>
  );
}
