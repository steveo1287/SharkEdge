import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { LivePlayEnginePlay } from "@/services/plays/live-play-engine";

type Props = {
  play: LivePlayEnginePlay;
  href: string;
  ctaLabel: string;
};

function getActionTone(action: LivePlayEnginePlay["actionState"]) {
  if (action === "BET_NOW") return "success" as const;
  if (action === "WAIT") return "brand" as const;
  if (action === "WATCH") return "premium" as const;
  return "muted" as const;
}

function getSourceTone(state: LivePlayEnginePlay["sourceHealthState"]) {
  if (state === "HEALTHY") return "success" as const;
  if (state === "DEGRADED") return "premium" as const;
  return "danger" as const;
}

function formatOdds(value: number | null) {
  if (typeof value !== "number") return null;
  return `${value > 0 ? "+" : ""}${value}`;
}

function formatPercent(value: number | null) {
  if (typeof value !== "number") return null;
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatLine(value: string | number | null) {
  if (typeof value === "number") return `${value}`;
  if (typeof value === "string" && value.trim().length) return value;
  return null;
}

function formatStake(value: number, bankrollPct: number) {
  const stake = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2
  }).format(Math.max(0, value));

  return `${stake} · ${bankrollPct.toFixed(2)}% BR`;
}

function formatTrapNote(play: LivePlayEnginePlay) {
  if (play.trapFlags.length) {
    return play.trapFlags.slice(0, 2).join(" · ").toLowerCase().replace(/_/g, " ");
  }

  return play.killSummary || "no active trap flags";
}

export function LivePlaySpotlightCard({ play, href, ctaLabel }: Props) {
  const oddsLabel = formatOdds(play.displayOddsAmerican);
  const evLabel = formatPercent(play.expectedValuePct);
  const lineLabel = formatLine(play.displayLine);
  const stakeLabel = formatStake(play.recommendedStake, play.bankrollPct);

  return (
    <div className="panel overflow-hidden rounded-[24px] border border-bone/[0.08] bg-surface p-4 shadow-[0_18px_42px_rgba(0,0,0,0.22)] transition hover:border-cyan-300/20 hover:shadow-[0_18px_42px_rgba(0,0,0,0.26),0_0_24px_rgba(34,211,238,0.06)] sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge tone={getActionTone(play.actionState)}>{play.actionState.toLowerCase().replace(/_/g, " ")}</Badge>
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] tabular-nums text-bone/55">
            Score <span className="text-text-primary">{Math.round(play.opportunityScore)}</span>
          </div>
        </div>

        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">{play.eventLabel}</div>
          <div className="mt-2 font-display text-[18px] font-semibold tracking-[-0.01em] text-text-primary sm:text-[20px]">{play.selectionLabel}</div>
          <div className="mt-2 text-[13px] leading-[1.55] text-bone/65">{play.reasonSummary}</div>
          {play.triggerSummary ? (
            <div className="mt-3 rounded-md border border-mint/25 bg-mint/[0.06] px-3 py-2 text-[12px] leading-[1.5] text-mint">
              <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-mint/75">Trigger</span>
              <span className="text-bone/85">{play.triggerSummary}</span>
            </div>
          ) : null}
          {play.killSummary ? (
            <div className="mt-2 rounded-md border border-crimson/25 bg-crimson/[0.06] px-3 py-2 text-[12px] leading-[1.5] text-crimson">
              <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-crimson/75">Kill</span>
              <span className="text-bone/85">{play.killSummary}</span>
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[22px] border border-bone/[0.08] bg-black/28 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bone/50">Timing</div>
            <div className="mt-2 font-mono text-[20px] font-semibold text-text-primary">{play.timingState.toLowerCase().replace(/_/g, " ")}</div>
            <div className="mt-2 text-[11px] leading-5 text-bone/55">Decision window state</div>
          </div>
          <div className="rounded-[22px] border border-bone/[0.08] bg-black/28 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bone/50">Source</div>
            <div className={`mt-2 font-mono text-[20px] font-semibold ${play.staleFlag ? "text-crimson" : "text-aqua"}`}>{play.sourceHealthState.toLowerCase()}</div>
            <div className="mt-2 text-[11px] leading-5 text-bone/55">{typeof play.freshnessMinutes === "number" ? `${play.freshnessMinutes}m freshness` : "freshness unavailable"}</div>
          </div>
          <div className="rounded-[22px] border border-bone/[0.08] bg-black/28 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bone/50">Market path</div>
            <div className="mt-2 font-mono text-[20px] font-semibold text-text-primary">{play.marketMicrostructure.regime.toLowerCase().replace(/_/g, " ")}</div>
            <div className="mt-2 text-[11px] leading-5 text-bone/55">{play.marketMicrostructure.pathTrusted ? "path trusted" : "path caution"}</div>
          </div>
          <div className="rounded-[22px] border border-bone/[0.08] bg-black/28 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bone/50">Trap flags</div>
            <div className={`mt-2 font-mono text-[20px] font-semibold ${play.trapFlags.length ? "text-crimson" : "text-text-primary"}`}>{play.trapFlags.length}</div>
            <div className="mt-2 text-[11px] leading-5 text-bone/55">{formatTrapNote(play)}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge tone="muted">{play.marketType.replace(/_/g, " ")}</Badge>
          <Badge tone={getSourceTone(play.sourceHealthState)}>Source {play.sourceHealthState.toLowerCase()}</Badge>
          {play.sportsbookName ? <Badge tone="brand">{play.sportsbookName}</Badge> : null}
          {oddsLabel ? <Badge tone="premium">{oddsLabel}</Badge> : null}
          {evLabel ? <Badge tone="success">EV {evLabel}</Badge> : null}
          {lineLabel ? <Badge tone="muted">Line {lineLabel}</Badge> : null}
          <Badge tone="muted">Stake {stakeLabel}</Badge>
          {play.recommendationTier ? <Badge tone="premium">{play.recommendationTier.toLowerCase()}</Badge> : null}
          <Badge tone={play.truthCalibrationStatus === "APPLIED" ? "brand" : "muted"}>Cal {play.truthCalibrationStatus.toLowerCase()}</Badge>
        </div>

        <Link
          href={href}
          className="mt-2 inline-flex w-full items-center justify-center rounded-sm border border-aqua/40 bg-aqua/[0.08] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-aqua transition-colors hover:border-aqua/60 hover:bg-aqua/[0.12]"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
