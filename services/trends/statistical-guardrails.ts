function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function computeWilsonInterval(input: {
  wins: number;
  losses: number;
  z?: number;
}) {
  const wins = Math.max(0, Math.floor(input.wins));
  const losses = Math.max(0, Math.floor(input.losses));
  const n = wins + losses;

  if (n <= 0) {
    return {
      sampleSize: 0,
      hitRate: null,
      lower: null,
      upper: null,
      width: null
    };
  }

  const z = typeof input.z === "number" && Number.isFinite(input.z) ? Math.max(0.5, input.z) : 1.64;
  const p = wins / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const lower = clamp((center - margin) / denom, 0, 1);
  const upper = clamp((center + margin) / denom, 0, 1);

  return {
    sampleSize: n,
    hitRate: p,
    lower,
    upper,
    width: upper - lower
  };
}

export function computeEmpiricalBayesHitRate(input: {
  wins: number;
  losses: number;
  priorMean?: number;
  priorStrength?: number;
}) {
  const wins = Math.max(0, Math.floor(input.wins));
  const losses = Math.max(0, Math.floor(input.losses));
  const priorMean = clamp(
    typeof input.priorMean === "number" && Number.isFinite(input.priorMean) ? input.priorMean : 0.5,
    0.01,
    0.99
  );
  const priorStrength = Math.max(
    2,
    Math.floor(
      typeof input.priorStrength === "number" && Number.isFinite(input.priorStrength)
        ? input.priorStrength
        : 24
    )
  );

  const alpha = priorMean * priorStrength;
  const beta = (1 - priorMean) * priorStrength;
  const posteriorMean = (wins + alpha) / (wins + losses + alpha + beta);

  return clamp(posteriorMean, 0.0001, 0.9999);
}

export function computeGeneralizationGap(input: {
  trainRoi: number | null;
  validationRoi: number | null;
  trainHitRate: number | null;
  validationHitRate: number | null;
}) {
  const roiGap =
    typeof input.trainRoi === "number" && typeof input.validationRoi === "number"
      ? Math.abs(input.trainRoi - input.validationRoi)
      : null;
  const hitRateGap =
    typeof input.trainHitRate === "number" && typeof input.validationHitRate === "number"
      ? Math.abs(input.trainHitRate - input.validationHitRate)
      : null;

  const penalty = clamp(
    (typeof roiGap === "number" ? roiGap * 140 : 12) +
      (typeof hitRateGap === "number" ? hitRateGap * 110 : 10),
    0,
    100
  );

  return {
    roiGap,
    hitRateGap,
    penalty
  };
}

export function computeEdgeEvidenceScore(input: {
  wins: number;
  losses: number;
  roi: number | null;
  avgClv: number | null;
  beatCloseRate: number | null;
  recentSampleSize?: number;
  priorMean?: number;
  priorStrength?: number;
}) {
  const interval = computeWilsonInterval({ wins: input.wins, losses: input.losses });
  const posterior = computeEmpiricalBayesHitRate({
    wins: input.wins,
    losses: input.losses,
    priorMean: input.priorMean,
    priorStrength: input.priorStrength
  });

  const lowerEdge = typeof interval.lower === "number" ? Math.max(interval.lower - 0.5, 0) : 0;
  const posteriorEdge = Math.max(posterior - 0.5, 0);
  const sampleSize = interval.sampleSize;
  const sampleEvidence = clamp(Math.sqrt(sampleSize) * 1.8, 0, 36);
  const roiScore = typeof input.roi === "number" ? clamp(input.roi * 100 * 0.55, -18, 28) : 0;
  const clvScore = typeof input.avgClv === "number" ? clamp(input.avgClv / 5, -8, 12) : 0;
  const beatCloseScore =
    typeof input.beatCloseRate === "number"
      ? clamp((input.beatCloseRate - 0.5) * 34, -8, 10)
      : 0;
  const recentScore = clamp((input.recentSampleSize ?? 0) * 0.6, 0, 12);
  const uncertaintyPenalty = typeof interval.width === "number" ? clamp(interval.width * 45, 0, 22) : 14;
  const thinSamplePenalty = sampleSize >= 60 ? 0 : sampleSize >= 30 ? 4 : sampleSize >= 16 ? 9 : 18;

  const total =
    lowerEdge * 220 +
    posteriorEdge * 95 +
    sampleEvidence +
    roiScore +
    clvScore +
    beatCloseScore +
    recentScore -
    uncertaintyPenalty -
    thinSamplePenalty;

  return {
    total: Math.round(total * 100) / 100,
    interval,
    posterior,
    components: {
      lowerEdge,
      posteriorEdge,
      sampleEvidence,
      roiScore,
      clvScore,
      beatCloseScore,
      recentScore,
      uncertaintyPenalty,
      thinSamplePenalty
    }
  };
}
