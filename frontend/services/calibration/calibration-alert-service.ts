import { prisma } from "@/lib/db/prisma";
import { shouldSuppressCalibrationAlert } from "@/services/calibration/calibration-actionability-service";

type AlertRecord = {
  channel: "ops";
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  metadata: Record<string, unknown>;
};

export async function writeCalibrationAlerts(alerts: AlertRecord[]) {
  if (!alerts.length) {
    return { inserted: 0, suppressed: 0 };
  }

  const accepted: AlertRecord[] = [];
  let suppressed = 0;

  for (const alert of alerts) {
    const shouldSuppress = await shouldSuppressCalibrationAlert(alert);
    if (shouldSuppress) {
      suppressed += 1;
      continue;
    }
    accepted.push(alert);
  }

  if (!accepted.length) {
    return { inserted: 0, suppressed };
  }

  await prisma.importBatch.create({
    data: {
      source: "calibration_alerts",
      status: "COMPLETED",
      startedAt: new Date(),
      finishedAt: new Date(),
      metadataJson: {
        alerts: accepted
      }
    }
  });

  return { inserted: accepted.length, suppressed };
}
