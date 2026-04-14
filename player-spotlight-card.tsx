import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatAmericanOdds } from "@/lib/formatters/odds";

type PlayerSpotlightCardProps = {
  playerId: string;
  playerName: string;
  position: string;
  leagueKey: string;
  teamLabel: string;
  bestEv: number | null;
  bestOdds: number;
  propCount: number;
  edgeLabel: string;
  marketLabel: string;
  note: string;
};

export function PlayerSpotlightCard({
  playerId,
  playerName,
  position,
  leagueKey,
  teamLabel,
  bestEv,
  bestOdds,
  propCount,
  edgeLabel,
  marketLabel,
  note
}: PlayerSpotlightCardProps) {
  const tone = edgeLabel === "Elite" ? "success" : edgeLabel === "Strong" ? "brand" : "premium";

  return (
    <Link
      href={`/props?league=${leagueKey}&player=${playerId}`}
      className="group rounded-[1.45rem] border border-white/8 bg-[#08111b]/92 p-5 transition hover:border-sky-400/25 hover:bg-white/[0.03]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">{leagueKey} · {teamLabel}</div>
          <div className="mt-2 text-xl font-semibold text-white">{playerName}</div>
          <div className="mt-1 text-sm text-slate-400">{position || "Player market"}</div>
        </div>
        <Badge tone={tone}>{edgeLabel}</Badge>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-[1rem] border border-white/8 bg-slate-950/65 p-3">
          <div className="text-slate-500">Best EV</div>
          <div className="mt-1 font-semibold text-emerald-300">
            {typeof bestEv === "number" ? `${bestEv > 0 ? "+" : ""}${bestEv.toFixed(1)}%` : "--"}
          </div>
        </div>
        <div className="rounded-[1rem] border border-white/8 bg-slate-950/65 p-3">
          <div className="text-slate-500">Best price</div>
          <div className="mt-1 font-semibold text-white">{formatAmericanOdds(bestOdds)}</div>
        </div>
        <div className="rounded-[1rem] border border-white/8 bg-slate-950/65 p-3">
          <div className="text-slate-500">Rows</div>
          <div className="mt-1 font-semibold text-white">{propCount}</div>
        </div>
      </div>

      <div className="mt-4 text-sm font-medium text-white">{marketLabel}</div>
      <div className="mt-2 text-sm leading-6 text-slate-400">{note}</div>
    </Link>
  );
}
