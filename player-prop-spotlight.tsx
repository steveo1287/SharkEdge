import Link from "next/link";

import type { PropCardView } from "@/lib/types/domain";
import { formatOdds, formatPercent } from "@/lib/utils/team-branding";

type PlayerPropSpotlightProps = {
  props: PropCardView[];
};

function scoreProp(prop: PropCardView) {
  return (prop.expectedValuePct ?? 0) * 2 + prop.edgeScore.score + Math.abs(prop.lineMovement ?? 0) * 5;
}

export function PlayerPropSpotlight({ props }: PlayerPropSpotlightProps) {
  if (!props.length) return null;

  const ranked = [...props].sort((a, b) => scoreProp(b) - scoreProp(a)).slice(0, 10);

  return (
    <section className="surface-panel p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Prop spotlight</div>
          <h3 className="mt-1 text-xl font-semibold text-white">Player edges with live market context</h3>
        </div>
        <Link href="/props" className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-sky-400/20">
          Open props
        </Link>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ranked.map((prop) => (
          <article key={prop.id} className="rounded-[1.35rem] border border-white/8 bg-slate-950/45 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">{prop.leagueKey} · {prop.marketType.replace(/_/g, " ")}</div>
                <div className="mt-1 text-lg font-semibold text-white">{prop.player.name}</div>
                <div className="mt-1 text-sm text-slate-400">{prop.team.abbreviation} vs {prop.opponent.abbreviation}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-right">
                <div className="text-lg font-semibold text-white">{prop.edgeScore.score}</div>
                <div className="text-[0.62rem] uppercase tracking-[0.18em] text-slate-400">edge</div>
              </div>
            </div>

            <div className="mt-4 grid gap-2 text-sm text-slate-300">
              <div className="flex items-center justify-between gap-3"><span>Line</span><span className="font-semibold text-white">{prop.side} {prop.line}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Price</span><span className="font-semibold text-white">{formatOdds(prop.oddsAmerican)}</span></div>
              <div className="flex items-center justify-between gap-3"><span>EV</span><span className="font-semibold text-emerald-300">{formatPercent(prop.expectedValuePct, 1)}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Move</span><span className="font-semibold text-sky-200">{prop.lineMovement ? `${prop.lineMovement > 0 ? "+" : ""}${prop.lineMovement.toFixed(1)}` : "Flat"}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Book</span><span className="font-semibold text-white">{prop.sportsbook.name}</span></div>
            </div>

            {prop.analyticsSummary?.reason ? (
              <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm leading-6 text-slate-300">
                {prop.analyticsSummary.reason}
              </div>
            ) : null}

            {prop.gameHref ? (
              <div className="mt-4">
                <Link href={prop.gameHref} className="text-sm font-semibold text-sky-300 transition hover:text-sky-200">
                  Open matchup →
                </Link>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
