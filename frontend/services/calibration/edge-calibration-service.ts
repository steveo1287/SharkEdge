import { buildSegmentedCalibrationReport } from "@/services/calibration/edge-calibration-report";

type SnapshotResult = {
  ok: boolean;
  scanned: number;
  created: number;
  skipped: number;
  note: string;
};

/**
 * Compatibility snapshot hook.
 * This branch references a snapshot pass from multiple routes/jobs,
 * but the concrete snapshot writer is not present. Keep the hook
 * callable so deploys and cron routes remain operational.
 */
export async function snapshotActiveEdgeExplanations(): Promise<SnapshotResult> {
  return {
    ok: true,
    scanned: 0,
    created: 0,
    skipped: 0,
    note: "Edge explanation snapshot writer is unavailable in this build; returning no-op snapshot."
  };
}

export async function computeEdgeCalibrationReport() {
  return buildSegmentedCalibrationReport();
}

