import { NextResponse } from "next/server";

import type { AlertRuleConfig } from "@/lib/types/product";
import { alertRuleCreateSchema } from "@/lib/validation/product";
import { createAlertRule, getAlertsPageData } from "@/services/alerts/alerts-service";

function requireNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} is required.`);
  return value;
}

function normalizeAlertRuleConfig(config: unknown): AlertRuleConfig {
  if (!config || typeof config !== "object") throw new Error("Alert rule config is required.");
  const record = config as Record<string, unknown>;
  const type = record.type;
  switch (type) {
    case "LINE_MOVEMENT_THRESHOLD":
    case "PROP_LINE_CHANGED":
      return { type, threshold: requireNumber(record.threshold, "threshold") };
    case "EV_THRESHOLD_REACHED":
      return { type, thresholdPct: requireNumber(record.thresholdPct, "thresholdPct") };
    case "BEST_BOOK_CHANGED":
      return { type };
    case "STARTING_SOON":
      return { type, minutesBefore: requireNumber(record.minutesBefore, "minutesBefore") };
    case "AVAILABILITY_RETURNED":
      return { type };
    case "TARGET_NUMBER_CROSSED":
      return { type, targetLine: requireNumber(record.targetLine, "targetLine") };
    case "CLV_TREND":
      return { type, thresholdPct: requireNumber(record.thresholdPct, "thresholdPct") };
    default:
      throw new Error("Unsupported alert rule config type.");
  }
}

function getStatusCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/database|prisma|migration/i.test(message)) {
    return 503;
  }

  if (/premium|limit/i.test(message)) {
    return 403;
  }

  return 400;
}

export async function GET() {
  try {
    const data = await getAlertsPageData();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load alert rules."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = alertRuleCreateSchema.parse(body);
    if (!payload.watchlistItemId || !payload.type) throw new Error("watchlistItemId and type are required.");
    const rule = await createAlertRule({
      watchlistItemId: payload.watchlistItemId,
      type: payload.type,
      name: payload.name,
      config: normalizeAlertRuleConfig(payload.config)
    });

    return NextResponse.json({
      rule
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create alert rule."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}
