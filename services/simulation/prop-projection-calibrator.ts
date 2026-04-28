import { calibratePropProjectionToMarket } from "./prop-market-calibration";

type PlayerProjectionLike = {
  meanValue: number;
  medianValue: number;
  stdDev: number;
  hitProbOver?: Record<string, number> | null;
  hitProbUnder?: Record<string, number> | null;
  metadata?: Record<string, unknown> | null;
};

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function lineKey(line: number) {
  return String(line);
}

export function applyMarketCalibrationToPlayerProjection<T extends PlayerProjectionLike>(projection: T): T {
  const metadata = asRecord(projection.metadata);
  const marketLine = readNumber(metadata.marketLine);
  const marketOddsOver = readNumber(metadata.marketOddsOver);
  const marketOddsUnder = readNumber(metadata.marketOddsUnder);

  if (marketLine === null || marketOddsOver === null || marketOddsUnder === null) {
    return projection;
  }

  const calibration = calibratePropProjectionToMarket({
    modelMean: projection.meanValue,
    modelStdDev: projection.stdDev,
    marketLine,
    overOddsAmerican: marketOddsOver,
    underOddsAmerican: marketOddsUnder,
    roleConfidence: readNumber(metadata.roleConfidence),
    sampleSize: readNumber(metadata.sampleSize),
    minutesSampleSize: readNumber(metadata.minutesSampleSize)
  });

  const key = lineKey(marketLine);
  const hitProbOver = {
    ...(projection.hitProbOver ?? {})
  };
  const hitProbUnder = {
    ...(projection.hitProbUnder ?? {})
  };

  if (calibration.calibratedOverProbability !== null) {
    hitProbOver[key] = Number(calibration.calibratedOverProbability.toFixed(4));
  }
  if (calibration.calibratedUnderProbability !== null) {
    hitProbUnder[key] = Number(calibration.calibratedUnderProbability.toFixed(4));
  }

  const previousDrivers = Array.isArray(metadata.drivers)
    ? metadata.drivers.filter((value): value is string => typeof value === "string")
    : [];

  return {
    ...projection,
    meanValue: Number(calibration.adjustedMean.toFixed(3)),
    medianValue: Number(calibration.adjustedMean.toFixed(3)),
    stdDev: Number(calibration.adjustedStdDev.toFixed(3)),
    hitProbOver,
    hitProbUnder,
    metadata: {
      ...metadata,
      uncalibratedMeanValue: projection.meanValue,
      uncalibratedMedianValue: projection.medianValue,
      uncalibratedStdDev: projection.stdDev,
      marketCalibrated: calibration.marketNoVigOverProbability !== null,
      marketCalibration: {
        marketLine,
        marketOddsOver,
        marketOddsUnder,
        modelOverProbability: calibration.modelOverProbability,
        marketNoVigOverProbability: calibration.marketNoVigOverProbability,
        marketImpliedMean: calibration.marketImpliedMean,
        modelEdgeProbability: calibration.modelEdgeProbability,
        marketBlendWeight: calibration.marketBlendWeight,
        confidence: calibration.confidence,
        notes: calibration.notes
      },
      drivers: Array.from(new Set([...previousDrivers, ...calibration.notes]))
    }
  };
}
