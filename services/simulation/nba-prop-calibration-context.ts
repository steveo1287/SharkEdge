import { AsyncLocalStorage } from "node:async_hooks";

import type { NbaPropCalibrationBucket } from "./nba-prop-calibration";

type NbaPropCalibrationRuntimeContext = {
  buckets: NbaPropCalibrationBucket[];
  loadedAt: string | null;
  source: string;
};

const storage = new AsyncLocalStorage<NbaPropCalibrationRuntimeContext>();
let fallbackContext: NbaPropCalibrationRuntimeContext = {
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
  fallbackContext = {
    buckets,
    loadedAt: new Date().toISOString(),
    source
  };
}

export function clearActiveNbaPropCalibrationBuckets() {
  fallbackContext = {
    buckets: [],
    loadedAt: null,
    source: "unset"
  };
}

export function getActiveNbaPropCalibrationBuckets() {
  return storage.getStore()?.buckets ?? fallbackContext.buckets;
}

export function getActiveNbaPropCalibrationContextStatus() {
  return contextStatus(storage.getStore() ?? fallbackContext);
}

export function runWithNbaPropCalibrationBuckets<T>(
  buckets: NbaPropCalibrationBucket[],
  source: string,
  callback: () => T
): T {
  return storage.run({
    buckets,
    loadedAt: new Date().toISOString(),
    source
  }, callback);
}
