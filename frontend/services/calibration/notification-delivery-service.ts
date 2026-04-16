import { prisma } from "@/lib/db/prisma";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

type NotificationRule = {
  minimumSeverity: "warning" | "critical";
  maxPerRun: number;
};

const rule: NotificationRule = {
  minimumSeverity: "critical",
  maxPerRun: 5
};

function passesRule(severity: string) {
  if (rule.minimumSeverity === "warning") {
    return severity === "warning" || severity === "critical";
  }
  return severity === "critical";
}

export async function deliverCriticalCalibrationNotifications() {
  const latest = await prisma.importBatch.findFirst({
    where: {
      source: "calibration_alerts",
      status: "COMPLETED"
    },
    orderBy: [{ createdAt: "desc" }]
  });

  const metadata = asObject(latest?.metadataJson);
  const alerts = Array.isArray(metadata?.alerts) ? metadata.alerts : [];
  const deliverable = alerts
    .map((item) => asObject(item))
    .filter(Boolean)
    .filter((item) => passesRule(String(item?.severity ?? "")))
    .slice(0, rule.maxPerRun);

  if (!deliverable.length) {
    return { delivered: 0 };
  }

  await prisma.importBatch.create({
    data: {
      source: "calibration_notification_delivery",
      status: "COMPLETED",
      startedAt: new Date(),
      finishedAt: new Date(),
      metadataJson: {
        channel: "in_app",
        rule,
        deliveredAlerts: deliverable
      }
    }
  });

  return { delivered: deliverable.length };
}
