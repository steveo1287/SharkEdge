import { AdvancedStatDriverList } from "@/components/intelligence/advanced-stat-driver-list";
import { MlbEliteExplainer } from "@/components/intelligence/mlb-elite-explainer";
import { ModelHealthPanel } from "@/components/intelligence/model-health-panel";
import { MlbIntelligenceEnvelopePanel } from "@/components/intelligence/mlb-intelligence-envelope-panel";
import { MlbDecisionGatePanel } from "@/components/intelligence/mlb-decision-gate-panel";
import { MlbOutcomeMathPanel } from "@/components/intelligence/mlb-outcome-math-panel";
import { MlbPrimaryDecisionPanel } from "@/components/intelligence/mlb-primary-decision-panel";
import { MlbPromotionDecisionPanel } from "@/components/intelligence/mlb-promotion-decision-panel";

type AlertItem = {
  title: string;
  detail: string;
  severity?: string;
  signature?: string;
  createdAt?: string;
};

type MlbCompleteIntelligenceViewProps = {
  game: {
    eventLabel?: string;
    side?: string;
    adjustedEdgeScore?: number | null;
    qualification?: { isWinnerMarketQualified?: boolean; targetWinnerAccuracy?: number };
    topAdvancedStatDrivers?: any[];
    mlbEliteSnapshot?: any;
  } | null;
  modelHealth?: {
    overall?: any;
    alerts?: AlertItem[];
  } | null;
  envelope?: any;
  gate?: any;
  outcomeMath?: any;
  primaryDecision?: any;
  promotionDecision?: any;
};

export function MlbCompleteIntelligenceView({
  game,
  modelHealth,
  envelope,
  gate,
  outcomeMath,
  primaryDecision,
  promotionDecision
}: MlbCompleteIntelligenceViewProps) {
  if (!game) {
    return null;
  }

  return (
    <section className="grid gap-4 rounded-[32px] border border-white/10 bg-[#050d18] p-5 shadow-[0_24px_80px_rgba(2,6,23,0.55)]">
      <div className="rounded-[24px] border border-cyan-400/15 bg-cyan-400/5 p-4">
        <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">MLB intelligence center</div>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">
          {game.eventLabel ?? "Elite MLB view"}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
            Side {game.side ?? "—"}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
            Edge {game.adjustedEdgeScore?.toFixed?.(2) ?? "—"}
          </span>
          <span
            className={`rounded-full border px-2.5 py-1 ${
              game.qualification?.isWinnerMarketQualified
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                : "border-white/10 bg-white/[0.04] text-slate-400"
            }`}
          >
            {game.qualification?.isWinnerMarketQualified ? "Qualified winner" : "Not qualified"}
          </span>
        </div>
      </div>

      <MlbEliteExplainer snapshot={game.mlbEliteSnapshot ?? null} />
      <AdvancedStatDriverList drivers={game.topAdvancedStatDrivers ?? []} />
      <MlbIntelligenceEnvelopePanel envelope={envelope ?? null} />
      <MlbDecisionGatePanel gate={gate ?? null} />
      <MlbOutcomeMathPanel outcome={outcomeMath ?? null} />
      <MlbPrimaryDecisionPanel decision={primaryDecision ?? null} />
      <MlbPromotionDecisionPanel decision={promotionDecision ?? null} />
      <ModelHealthPanel
        overall={modelHealth?.overall ?? null}
        alerts={modelHealth?.alerts ?? []}
        qualifiedWinnerTarget={game.qualification?.targetWinnerAccuracy ?? 0.7}
      />
    </section>
  );
}
