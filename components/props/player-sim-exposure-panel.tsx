import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { formatAmericanOdds, formatMarketType } from "@/lib/formatters/odds";
import type { PropCardView } from "@/lib/types/domain";
import { getOrBuildCachedSim } from "@/services/simulation/get-or-build-cached-sim";
import { getSimTuning } from "@/services/simulation/get-sim-tuning";
import type { SimTuningParams } from "@/services/simulation/sim-tuning";

type BuiltPropSim = {
  prop: PropCardView;
  adjustedMean: number;
  rawMean: number;
  lineDelta: number;
  lean: "OVER" | "UNDER" | "PUSH";
  leanProbability: number;
  overProbability: number;
  underProbability: number;
  fairOdds: number;
  edgePct: number;
  confidence: number;
  decision: "ATTACK" | "WATCH" | "PASS";
  reasons: string[];
  riskFlags: string[];
  simCount: number;
};

function signed(value: number, digits = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function pct(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function edgePct(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function decisionTone(decision: BuiltPropSim["decision"]) {
  if (decision === "ATTACK") return "success" as const;
  if (decision === "WATCH") return "premium" as const;
  return "muted" as const;
}

function confidenceTone(confidence: number) {
  if (confidence >= 0.72) return "success" as const;
  if (confidence >= 0.62) return "brand" as const;
  return "muted" as const;
}

function rankBuiltSim(item: BuiltPropSim) {
  const decisionBoost = item.decision === "ATTACK" ? 45 : item.decision === "WATCH" ? 20 : 0;
  return decisionBoost + Math.abs(item.edgePct) * 3 + Math.abs(item.lineDelta) * 7 + item.confidence * 25;
}

async function buildPropSim(prop: PropCardView, tuning: SimTuningParams): Promise<BuiltPropSim | null> {
  const bookOdds = prop.bestAvailableOddsAmerican ?? prop.oddsAmerican;

  try {
    const sim = await getOrBuildCachedSim({
      propId: prop.id,
      playerId: prop.player.id,
      playerName: prop.player.name,
      propType: String(prop.marketType),
      line: prop.line,
      odds: bookOdds,
      teamTotal: 110,
      minutes: 34,
      usageRate: 0.24,
      matchupRank: typeof prop.matchupRank === "number" ? prop.matchupRank : undefined,
      tuning,
      prop
    });

    const lineDelta = sim.adjustedMean - prop.line;
    const lean = Math.abs(lineDelta) < 0.05 ? "PUSH" : lineDelta > 0 ? "OVER" : "UNDER";
    const overProbability = sim.calibratedProbability;
    const underProbability = 1 - sim.calibratedProbability;
    const leanProbability = lean === "UNDER" ? underProbability : lean === "OVER" ? overProbability : 0.5;

    return {
      prop,
      adjustedMean: sim.adjustedMean,
      rawMean: sim.rawMean,
      lineDelta,
      lean,
      leanProbability,
      overProbability,
      underProbability,
      fairOdds: sim.fairOdds,
      edgePct: sim.edgePct,
      confidence: sim.confidence,
      decision: sim.decision,
      reasons: sim.reasons ?? [],
      riskFlags: sim.riskFlags ?? [],
      simCount: sim.simCount
    };
  } catch {
    return null;
  }
}

function SimExpectationCard({ item, rank }: { item: BuiltPropSim; rank: number }) {
  const { prop } = item;
  const primaryReason = item.reasons[0] ?? "Player sim generated from the cached adaptive projection engine.";

  return (
    <Card className="surface-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-bone/45">
            Sim #{rank} · {prop.leagueKey}
          </div>
          <div className="mt-2 font-semibold text-white">{prop.player.name}</div>
          <div className="mt-1 text-xs text-bone/50">
            {formatMarketType(prop.marketType)} {prop.side} {prop.line} · {prop.team.abbreviation} vs {prop.opponent.abbreviation}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Badge tone={decisionTone(item.decision)}>{item.decision}</Badge>
          <Badge tone={item.lean === "PUSH" ? "muted" : "brand"}>{item.lean}</Badge>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md border border-bone/[0.08] bg-panel p-2">
          <div className="text-bone/45">Expected</div>
          <div className="mt-1 font-mono text-white">{item.adjustedMean.toFixed(1)}</div>
          <div className="mt-1 text-[10px] text-bone/40">Raw {item.rawMean.toFixed(1)}</div>
        </div>
        <div className="rounded-md border border-bone/[0.08] bg-panel p-2">
          <div className="text-bone/45">Vs line</div>
          <div className="mt-1 font-mono text-white">{signed(item.lineDelta)}</div>
          <div className="mt-1 text-[10px] text-bone/40">Line {prop.line}</div>
        </div>
        <div className="rounded-md border border-bone/[0.08] bg-panel p-2">
          <div className="text-bone/45">Lean prob</div>
          <div className="mt-1 font-mono text-white">{pct(item.leanProbability)}</div>
          <div className="mt-1 text-[10px] text-bone/40">{item.simCount.toLocaleString()} sims</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md bg-ink/35 p-2">
          <div className="text-bone/45">Fair odds</div>
          <div className="mt-1 font-mono text-white">{formatAmericanOdds(item.fairOdds)}</div>
        </div>
        <div className="rounded-md bg-ink/35 p-2">
          <div className="text-bone/45">Sim edge</div>
          <div className="mt-1 font-mono text-white">{edgePct(item.edgePct)}</div>
        </div>
        <div className="rounded-md bg-ink/35 p-2">
          <div className="text-bone/45">Confidence</div>
          <div className="mt-1"><Badge tone={confidenceTone(item.confidence)}>{pct(item.confidence, 0)}</Badge></div>
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-bone/60">{primaryReason}</p>

      {item.riskFlags.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.riskFlags.slice(0, 3).map((flag) => (
            <Badge key={`${prop.id}:${flag}`} tone="danger">{flag}</Badge>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

export async function PlayerSimExposurePanel({ props }: { props: PropCardView[] }) {
  if (!props.length) {
    return null;
  }

  const tuning = await getSimTuning();
  const built = (
    await Promise.all(props.slice(0, 12).map((prop) => buildPropSim(prop, tuning)))
  )
    .filter((item): item is BuiltPropSim => item !== null)
    .sort((a, b) => rankBuiltSim(b) - rankBuiltSim(a));

  const top = built.slice(0, 6);
  const attack = built.filter((item) => item.decision === "ATTACK").length;
  const watch = built.filter((item) => item.decision === "WATCH").length;
  const overs = built.filter((item) => item.lean === "OVER").length;
  const unders = built.filter((item) => item.lean === "UNDER").length;

  return (
    <section id="player-sims" className="grid gap-4">
      <SectionTitle
        eyebrow="Player sims"
        title="What we expect from the prop slate"
        description="Adjusted mean, over/under lean, calibrated hit probability, fair odds, sim edge, confidence, and risk flags pulled out before the table."
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="surface-panel p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bone/45">Sim cards</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-white">{built.length}</div>
          <div className="mt-1 text-xs leading-5 text-bone/55">Cached player projections inspected</div>
        </Card>
        <Card className="surface-panel p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bone/45">Attack / watch</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-white">{attack} / {watch}</div>
          <div className="mt-1 text-xs leading-5 text-bone/55">Decision gate from sim edge</div>
        </Card>
        <Card className="surface-panel p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bone/45">Over leans</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-white">{overs}</div>
          <div className="mt-1 text-xs leading-5 text-bone/55">Adjusted mean above market line</div>
        </Card>
        <Card className="surface-panel p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bone/45">Under leans</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-white">{unders}</div>
          <div className="mt-1 text-xs leading-5 text-bone/55">Adjusted mean below market line</div>
        </Card>
      </div>

      {top.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {top.map((item, index) => (
            <SimExpectationCard key={`sim-exposure:${item.prop.id}`} item={item} rank={index + 1} />
          ))}
        </div>
      ) : (
        <Card className="surface-panel p-6 text-sm leading-7 text-bone/60">
          Player sim outputs are not ready for this filter set yet. The board still renders price and EV, but the expectation panel needs a cached sim result for at least one visible prop.
        </Card>
      )}
    </section>
  );
}
