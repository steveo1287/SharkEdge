import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

import { buildGeneratedSystemAttachments } from "./generated-system-attachments";
import { buildMarketIntelligencePayload } from "./market-intelligence";
import { buildTrendVerificationPayload } from "./trend-verification";

export type SmartWatchlistOptions = {
  savedBy?: string;
  league?: string | "ALL";
  market?: string | "ALL";
  limit?: number;
};

export type SavedWatchlistSystem = {
  id: string;
  systemId: string;
  systemKind: string;
  name: string;
  league: string;
  market: string;
  side: string | null;
  savedBy: string;
  status: string;
  notes: string | null;
  tags: string[];
  alertRules: string[];
  createdAt: string;
};

export type SmartWatchlistAlertCandidate = {
  id: string;
  savedSystemId: string;
  systemId: string;
  eventId: string | null;
  eventLabel: string | null;
  alertType: "current_attachment" | "price_available" | "market_support" | "verified_grade" | "blocker_clear" | "risk_warning";
  severity: "info" | "watch" | "action" | "risk";
  title: string;
  message: string;
  reasons: string[];
  blockers: string[];
  payload: Record<string, unknown>;
};

export type SmartWatchlistPayload = {
  generatedAt: string;
  sourceNote: string;
  savedSystems: SavedWatchlistSystem[];
  alerts: SmartWatchlistAlertCandidate[];
  suggestedSystems: Array<{
    systemId: string;
    name: string;
    league: string;
    market: string;
    grade: string;
    score: number;
    reason: string;
  }>;
  stats: {
    savedCount: number;
    alertCount: number;
    actionCount: number;
    watchCount: number;
    riskCount: number;
    suggestedCount: number;
  };
};

type SavedSystemRow = Record<string, unknown>;

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function asDate(value: unknown) {
  if (!value) return new Date().toISOString();
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function sanitizeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_:-]/g, "_").slice(0, 180);
}

function mapSavedSystem(row: SavedSystemRow): SavedWatchlistSystem {
  return {
    id: String(row.id),
    systemId: String(row.system_id),
    systemKind: String(row.system_kind ?? "generated"),
    name: String(row.name),
    league: String(row.league ?? "ALL"),
    market: String(row.market ?? "ALL"),
    side: row.side == null ? null : String(row.side),
    savedBy: String(row.saved_by ?? "default"),
    status: String(row.status ?? "ACTIVE"),
    notes: row.notes == null ? null : String(row.notes),
    tags: asArray(row.tags_json),
    alertRules: asArray(row.alert_rules_json),
    createdAt: asDate(row.created_at)
  };
}

async function fetchSavedSystems(options: Required<SmartWatchlistOptions>) {
  const rows = await prisma.$queryRaw<SavedSystemRow[]>`
    SELECT *
    FROM saved_trend_systems
    WHERE saved_by = ${options.savedBy}
      AND status = 'ACTIVE'
      AND (${options.league} = 'ALL' OR league = ${options.league})
      AND (${options.market} = 'ALL' OR market = ${options.market})
    ORDER BY created_at DESC
    LIMIT ${options.limit}
  `;
  return rows.map(mapSavedSystem);
}

function alertId(savedSystemId: string, type: string, eventId: string | null) {
  return sanitizeId(`watch:${savedSystemId}:${type}:${eventId ?? "system"}`);
}

function addAlert(alerts: SmartWatchlistAlertCandidate[], alert: SmartWatchlistAlertCandidate) {
  if (!alerts.some((item) => item.id === alert.id)) alerts.push(alert);
}

export async function buildSmartWatchlist(options: SmartWatchlistOptions = {}): Promise<SmartWatchlistPayload> {
  if (!hasUsableServerDatabaseUrl()) {
    return {
      generatedAt: new Date().toISOString(),
      sourceNote: "Smart watchlist unavailable because DATABASE_URL is not configured.",
      savedSystems: [],
      alerts: [],
      suggestedSystems: [],
      stats: { savedCount: 0, alertCount: 0, actionCount: 0, watchCount: 0, riskCount: 0, suggestedCount: 0 }
    };
  }

  const resolved = {
    savedBy: options.savedBy ?? "default",
    league: (options.league ?? "ALL").toUpperCase(),
    market: (options.market ?? "ALL").toLowerCase(),
    limit: options.limit ?? 100
  };

  try {
    const [savedSystems, verification, attachments, market] = await Promise.all([
      fetchSavedSystems(resolved),
      buildTrendVerificationPayload({ league: resolved.league, market: resolved.market, limit: 500, requireCurrentAttachment: false }),
      buildGeneratedSystemAttachments({ league: resolved.league, topSystemsPerGame: 10, includeResearch: false }),
      buildMarketIntelligencePayload({ league: resolved.league, limitEvents: 150 })
    ]);

    const verificationById = new Map(verification.results.map((item) => [item.systemId, item]));
    const attachmentBySystemId = new Map<string, Array<{ eventId: string; eventLabel: string; league: string }>>();
    for (const game of attachments.games) {
      for (const system of game.topSystems) {
        const list = attachmentBySystemId.get(system.systemId) ?? [];
        list.push({ eventId: game.eventId, eventLabel: game.eventLabel, league: game.league });
        attachmentBySystemId.set(system.systemId, list);
      }
    }
    const marketByEventId = new Map(market.signals.map((item) => [item.eventId, item]));
    const alerts: SmartWatchlistAlertCandidate[] = [];

    for (const saved of savedSystems) {
      const verified = verificationById.get(saved.systemId);
      const attachedGames = attachmentBySystemId.get(saved.systemId) ?? [];

      if (verified?.verified && (verified.grade === "A" || verified.grade === "B")) {
        addAlert(alerts, {
          id: alertId(saved.id, "verified_grade", null),
          savedSystemId: saved.id,
          systemId: saved.systemId,
          eventId: null,
          eventLabel: null,
          alertType: "verified_grade",
          severity: "watch",
          title: `${saved.name} is verified ${verified.grade}`,
          message: `Verification score ${verified.verificationScore}; source risk ${verified.sourceRisk}, overfit risk ${verified.overfitRisk}.`,
          reasons: verified.reasons.slice(0, 5),
          blockers: verified.blockers.slice(0, 5),
          payload: { verification: verified }
        });
      }

      if (verified && (verified.sourceRisk === "high" || verified.overfitRisk === "high" || verified.blockers.length)) {
        addAlert(alerts, {
          id: alertId(saved.id, "risk_warning", null),
          savedSystemId: saved.id,
          systemId: saved.systemId,
          eventId: null,
          eventLabel: null,
          alertType: "risk_warning",
          severity: "risk",
          title: `${saved.name} has verification risk`,
          message: `Source risk ${verified.sourceRisk}; overfit risk ${verified.overfitRisk}.`,
          reasons: verified.reasons.slice(0, 4),
          blockers: verified.blockers.slice(0, 6),
          payload: { verification: verified }
        });
      }

      if (verified && !verified.blockers.length) {
        addAlert(alerts, {
          id: alertId(saved.id, "blocker_clear", null),
          savedSystemId: saved.id,
          systemId: saved.systemId,
          eventId: null,
          eventLabel: null,
          alertType: "blocker_clear",
          severity: "info",
          title: `${saved.name} has no verification blockers`,
          message: "Verification currently reports no blockers for this saved system.",
          reasons: verified.reasons.slice(0, 5),
          blockers: [],
          payload: { verification: verified }
        });
      }

      for (const game of attachedGames) {
        const marketSignal = marketByEventId.get(game.eventId);
        addAlert(alerts, {
          id: alertId(saved.id, "current_attachment", game.eventId),
          savedSystemId: saved.id,
          systemId: saved.systemId,
          eventId: game.eventId,
          eventLabel: game.eventLabel,
          alertType: "current_attachment",
          severity: verified?.verified ? "action" : "watch",
          title: `${saved.name} is attached to ${game.eventLabel}`,
          message: verified?.verified ? "Saved system is verified and attached to a current game." : "Saved system is attached to a current game but has not cleared verification.",
          reasons: verified?.reasons.slice(0, 4) ?? [],
          blockers: verified?.blockers.slice(0, 4) ?? [],
          payload: { game, verification: verified ?? null }
        });

        if (marketSignal?.lineMovement.currentPrice != null || marketSignal?.lineMovement.closingPrice != null) {
          addAlert(alerts, {
            id: alertId(saved.id, "price_available", game.eventId),
            savedSystemId: saved.id,
            systemId: saved.systemId,
            eventId: game.eventId,
            eventLabel: game.eventLabel,
            alertType: "price_available",
            severity: "watch",
            title: `${game.eventLabel} has market price data`,
            message: `Current price ${marketSignal.lineMovement.currentPrice ?? "TBD"}; close ${marketSignal.lineMovement.closingPrice ?? "TBD"}.`,
            reasons: marketSignal.reasons.slice(0, 4),
            blockers: marketSignal.blockers.slice(0, 4),
            payload: { market: marketSignal }
          });
        }

        if (marketSignal?.reasons.length) {
          addAlert(alerts, {
            id: alertId(saved.id, "market_support", game.eventId),
            savedSystemId: saved.id,
            systemId: saved.systemId,
            eventId: game.eventId,
            eventLabel: game.eventLabel,
            alertType: "market_support",
            severity: verified?.verified ? "action" : "watch",
            title: `${game.eventLabel} has market support`,
            message: marketSignal.reasons[0] ?? "Market intelligence has sourced support for this game.",
            reasons: marketSignal.reasons.slice(0, 5),
            blockers: marketSignal.blockers.slice(0, 5),
            payload: { market: marketSignal, verification: verified ?? null }
          });
        }
      }
    }

    const savedIds = new Set(savedSystems.map((item) => item.systemId));
    const suggestedSystems = verification.results
      .filter((item) => item.verified && (item.grade === "A" || item.grade === "B") && !savedIds.has(item.systemId))
      .slice(0, 12)
      .map((item) => ({
        systemId: item.systemId,
        name: item.name,
        league: item.league,
        market: item.market,
        grade: item.grade,
        score: item.verificationScore,
        reason: item.reasons[0] ?? "Verified generated system available to save."
      }));

    return {
      generatedAt: new Date().toISOString(),
      sourceNote: "Smart watchlist combines saved systems, verification, generated-system attachments, and sourced market intelligence. It does not create picks or place bets.",
      savedSystems,
      alerts: alerts.sort((left, right) => {
        const weight = { action: 4, risk: 3, watch: 2, info: 1 } as const;
        return weight[right.severity] - weight[left.severity] || left.title.localeCompare(right.title);
      }),
      suggestedSystems,
      stats: {
        savedCount: savedSystems.length,
        alertCount: alerts.length,
        actionCount: alerts.filter((item) => item.severity === "action").length,
        watchCount: alerts.filter((item) => item.severity === "watch").length,
        riskCount: alerts.filter((item) => item.severity === "risk").length,
        suggestedCount: suggestedSystems.length
      }
    };
  } catch (error) {
    return {
      generatedAt: new Date().toISOString(),
      sourceNote: error instanceof Error ? `Smart watchlist unavailable: ${error.message}` : "Smart watchlist unavailable.",
      savedSystems: [],
      alerts: [],
      suggestedSystems: [],
      stats: { savedCount: 0, alertCount: 0, actionCount: 0, watchCount: 0, riskCount: 0, suggestedCount: 0 }
    };
  }
}
