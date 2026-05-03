import type { NbaPropCalibrationBucket } from "./nba-prop-calibration";

type NbaPropCalibrationRuntimeContext = {
  buckets: NbaPropCalibrationBucket[];
  loadedAt: string | null;
  source: string;
};

let activeContext: NbaPropCalibrationRuntimeContext = {
  buckets: [],
  loadedAt: null,
  source: "unset"
};

function contextStatus(context: NbaPropCalibrationRuntimeContext) {
  return {
    bucketCount: context.buckets.length,
    healthyBucketCount: context.buckets.filter((bucket) => bucket.status === "HEALTHY").length,
    loadedAt: context.loadedAt,
    source: context.source
  };
}

export function setActiveNbaPropCalibrationBuckets(buckets: NbaPropCalibrationBucket[], source = "manual") {
  activeContext = {
    buckets,
    loadedAt: new Date().toISOString(),
    source
  };
}

export function clearActiveNbaPropCalibrationBuckets() {
  activeContext = {
    buckets: [],
    loadedAt: null,
    source: "unset"
  };
}

export function getActiveNbaPropCalibrationBuckets() {
  return activeContext.buckets;
}

export function getActiveNbaPropCalibrationContextStatus() {
  return contextStatus(activeContext);
}

export async function runWithNbaPropCalibrationBuckets<T>(
  buckets: NbaPropCalibrationBucket[],
  source: string,
  callback: () => T | Promise<T>
): Promise<T> {
  const previousContext = activeContext;
  setActiveNbaPropCalibrationBuckets(buckets, source);
  try {
    return await callback();
  } finally {
    activeContext = previousContext;
  }
}
