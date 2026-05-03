import type { NbaPropCalibrationBucket } from "./nba-prop-calibration";

let activeBuckets: NbaPropCalibrationBucket[] = [];
let activeLoadedAt: string | null = null;
let activeSource = "unset";

export function setActiveNbaPropCalibrationBuckets(buckets: NbaPropCalibrationBucket[], source = "manual") {
  activeBuckets = buckets;
  activeLoadedAt = new Date().toISOString();
  activeSource = source;
}

export function clearActiveNbaPropCalibrationBuckets() {
  activeBuckets = [];
  activeLoadedAt = null;
  activeSource = "unset";
}

export function getActiveNbaPropCalibrationBuckets() {
  return activeBuckets;
}

export function getActiveNbaPropCalibrationContextStatus() {
  return {
    bucketCount: activeBuckets.length,
    healthyBucketCount: activeBuckets.filter((bucket) => bucket.status === "HEALTHY").length,
    loadedAt: activeLoadedAt,
    source: activeSource
  };
}
