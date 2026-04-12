import Link from "next/link";

import { SharkScoreRing } from "@/components/branding/shark-score-ring";
import { TeamBadge } from "@/components/identity/team-badge";
import { SectionTabs, type SectionTabItem } from "@/components/mobile/section-tabs";
import { Badge } from "@/components/ui/badge";
import type { MatchupDetailView } from "@/lib/types/domain";
import type { GameHubMetric } from "@/services/matchups/game-ui-adapter";
import type { GameHubPresentation } from "@/services/matchups/game-hub-presenter";

function getParticipant(detail: MatchupDetailView, role: "AWAY" | "HOME") {
  return (
    detail.participants.find((participant) => participant.role === role) ??
    detail.participants[role === "AWAY" ? 0 : 1] ??
    null
  );
}

function getSupportTone(status: MatchupDetailView["supportStatus"]) {
  if (status === "LIVE") return "success" as const;
  if (status === "PARTIAL") return "premium" as const;
  return "muted" as const;
}

function formatStartTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function HeroMetric({ metric }: { metric: GameHubMetric }) {
  return (
    <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{metric.label}</div>
      <div className="mt-2 text-sm font-semibold text-white">{metric.value}</div>
      <div className="mt-1 text-[11px] leading-5 text-slate-400">{metric.note}</div>
    </div>
  );
}

type Props = {
  detail: MatchupDetailView;
  presentation: GameHubPresentation;
  tabs: SectionTabItem[];
  metrics: GameHubMetric[];
  returnHref?: string | null;
};

export function GameDetailCommandHero({ detail, presentation, tabs, metrics, returnHref = null }: Props) {
  const away = getParticipant(detail, "AWAY");
  const home = getParticipant(detail, "HOME");
  const headline = presentation.headline;

  return (
    <section className="mobile-hero">
      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {returnHref ? (
              <Link
                href={returnHref}
                className="inline-flex rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-white/18 hover:bg-white/[0.06]"
              >
                Back to board
              </Link>
            ) : null}
            <Badge tone={getSupportTone(detail.supportStatus)}>{detail.supportStatus}</Badge>
            <Badge tone="muted">{detail.league.key}</Badge>
            <Badge tone="muted">{detail.status === "LIVE" ? "Live" : "Pregame"}</Badge>
            {detail.currentOddsProvider ? <Badge tone="brand">{detail.currentOddsProvider}</Badge> : null}
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-[1.4rem] border border-white/8 bg-[#08101a]/85 px-4 py-5 sm:px-5 xl:px-6">
            <div className="min-w-0 text-center xl:text-left">
              <div className="flex justify-center xl:justify-start">
                <TeamBadge name={away?.name ?? "Away"} abbreviation={away?.abbreviation} size="lg" />
              </div>
              <div className="mt-3 text-[1.4rem] font-black tracking-tight text-white sm:text-[1.85rem]">
                {away?.abbreviation ?? away?.name ?? "Away"}
              </div>
              <div className="mt-1 text-sm text-slate-400">{away?.record ?? away?.subtitle ?? "Away side"}</div>
            </div>

            <div className="min-w-[118px] text-center">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                {detail.status === "LIVE" ? "Live now" : "First pitch / tip"}
              </div>
              <div className="mt-2 text-[1.4rem] font-semibold text-white sm:text-[1.7rem]">
                {formatStartTime(detail.startTime)}
              </div>
              <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                {detail.stateDetail ?? detail.status}
              </div>
              {detail.scoreboard ? (
                <div className="mt-3 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                  {detail.scoreboard}
                </div>
              ) : null}
            </div>

            <div className="min-w-0 text-center xl:text-right">
              <div className="flex justify-center xl:justify-end">
                <TeamBadge
                  name={home?.name ?? "Home"}
                  abbreviation={home?.abbreviation}
                  size="lg"
                  tone="home"
                />
              </div>
              <div className="mt-3 text-[1.4rem] font-black tracking-tight text-white sm:text-[1.85rem]">
                {home?.abbreviation ?? home?.name ?? "Home"}
              </div>
              <div className="mt-1 text-sm text-slate-400">{home?.record ?? home?.subtitle ?? "Home side"}</div>
            </div>
          </div>
        </div>

        <div className="rounded-[1.35rem] border border-white/8 bg-[#08101a]/90 px-4 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.28)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Execution posture</div>
              <div className="mt-2 text-[1.1rem] font-semibold tracking-tight text-white">
                {presentation.postureLabel}
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-400">
                {headline?.reasonSummary ?? detail.supportNote}
              </div>
            </div>
            <SharkScoreRing
              score={Math.round(headline?.opportunityScore ?? 0)}
              size="sm"
              tone={
                (headline?.opportunityScore ?? 0) >= 70
                  ? "success"
                  : (headline?.opportunityScore ?? 0) >= 50
                    ? "warning"
                    : "brand"
              }
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="brand">{headline?.selectionLabel ?? "No qualified edge"}</Badge>
            <Badge tone="muted">{headline?.sportsbookName ?? detail.providerHealth.label}</Badge>
            <Badge tone="muted">{headline?.confidenceTier ?? "Unrated"}</Badge>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {metrics.slice(0, 4).map((metric) => (
              <HeroMetric key={metric.label} metric={metric} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-white/8 pt-2">
        <SectionTabs items={tabs} />
      </div>
    </section>
  );
}
