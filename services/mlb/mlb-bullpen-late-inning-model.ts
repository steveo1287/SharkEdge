export type MlbBullpenLateInput = {
  team?: string | null;
  opponent?: string | null;
  marketType: string;
  baseMean: number;
  projectedPA?: number | null;
  bullpenFatigueIndex?: number | null;
  bullpenKRate?: number | null;
  bullpenWobaAllowed?: number | null;
  lateInningShare?: number | null;
  gameTotal?: number | null;
  spreadAbs?: number | null;
};

export type MlbBullpenLateOutput = {
  adjustedMean: number;
  probabilityShift: number;
  confidenceShift: number;
  varianceShift: number;
  bullpenQualityFactor: number;
  lateInningShare: number;
  reasons: string[];
  riskFlags: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function safe(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function buildMlbBullpenLateInningModel(input: MlbBullpenLateInput): MlbBullpenLateOutput {
  const reasons: string[] = [];
  const riskFlags: string[] = [];
  const market = input.marketType.toLowerCase();
  const isBatterProp = !market.includes("strikeout") && !market.includes("out");
  const isRunEnvironmentProp = market.includes("hit") || market.includes("base") || market.includes("rbi") || market.includes("run");

  const fatigue = clamp(safe(input.bullpenFatigueIndex, 0.35), 0, 1);
  const bullpenK = clamp(safe(input.bullpenKRate, 0.225), 0.12, 0.34);
  const bullpenWoba = clamp(safe(input.bullpenWobaAllowed, 0.315), 0.24, 0.42);
  const lateInningShare = clamp(safe(input.lateInningShare, isBatterProp ? 0.38 : 0.16), 0, 0.65);

  let bullpenQualityFactor = 1;
  let confidenceShift = 0;
  let varianceShift = 0;
  let probabilityShift = 0;

  if (isBatterProp && isRunEnvironmentProp) {
    const wobaPressure = (bullpenWoba - 0.315) * 0.9;
    const fatiguePressure = fatigue * 0.075;
    bullpenQualityFactor += lateInningShare * (wobaPressure + fatiguePressure);

    if (bullpenWoba >= 0.34) reasons.push("Weak bullpen run-prevention boosts late plate appearances");
    if (fatigue >= 0.55) reasons.push("Bullpen fatigue boosts late-inning offensive context");
    if (bullpenWoba <= 0.285) riskFlags.push("Strong bullpen suppresses late-inning hitter edge");
  }

  if (market.includes("strikeout")) {
    const kPressure = (bullpenK - 0.225) * 0.35;
    probabilityShift += lateInningShare * kPressure;
    if (bullpenK >= 0.255) reasons.push("High-K bullpen raises late strikeout environment");
  }

  if (market.includes("out")) {
    const fatigueDrag = fatigue * 0.02;
    probabilityShift -= fatigueDrag;
    varianceShift += fatigue * 0.04;
    if (fatigue >= 0.55) riskFlags.push("Fatigued bullpen may change starter leash assumptions");
  }

  if (typeof input.gameTotal === "number") {
    if (input.gameTotal >= 9) {
      bullpenQualityFactor *= 1.015;
      reasons.push("High game total supports late scoring environment");
    } else if (input.gameTotal <= 7) {
      bullpenQualityFactor *= 0.985;
      riskFlags.push("Low game total suppresses late-inning environment");
    }
  }

  if (typeof input.spreadAbs === "number" && input.spreadAbs >= 1.5) {
    varianceShift += 0.025;
    riskFlags.push("Runline spread increases late-game bullpen variance");
  }

  const adjustedMean = input.baseMean * clamp(bullpenQualityFactor, 0.88, 1.16);
  probabilityShift = clamp(probabilityShift, -0.035, 0.035);
  confidenceShift = clamp(confidenceShift + (reasons.length ? 0.012 : 0) - riskFlags.length * 0.006, -0.04, 0.04);
  varianceShift = clamp(varianceShift + fatigue * 0.03, 0, 0.12);

  if (!reasons.length) reasons.push("Bullpen/late-inning layer neutral");

  return {
    adjustedMean: Number(adjustedMean.toFixed(4)),
    probabilityShift: Number(probabilityShift.toFixed(5)),
    confidenceShift: Number(confidenceShift.toFixed(4)),
    varianceShift: Number(varianceShift.toFixed(4)),
    bullpenQualityFactor: Number(bullpenQualityFactor.toFixed(4)),
    lateInningShare: Number(lateInningShare.toFixed(4)),
    reasons,
    riskFlags
  };
}
