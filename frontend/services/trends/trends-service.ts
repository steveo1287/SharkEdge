import { getServerDatabaseResolution, hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { TrendDashboardView } from "@/lib/types/domain";

function buildTrendSetupState(error?: unknown): TrendDashboardView["setup"] {
  const message = error instanceof Error ? error.message : "";
  const resolution = getServerDatabaseResolution();

  if (!hasUsableServerDatabaseUrl()) {
    return {
      status: "blocked",
      title: "Historical trends need Postgres",
      detail:
        "The trends page now runs from harvested historical odds snapshots and persisted ledger data. This runtime still needs a usable Postgres URL before those cards can render.",
      steps: [
        "Set DATABASE_URL, POSTGRES_PRISMA_URL, or POSTGRES_URL in the server runtime.",
        "Run npx prisma migrate deploy.",
        "Run npm run prisma:seed to load starter ledger rows."
      ]
    };
  }

  if (/does not exist|relation .* does not exist|P2021|P2022/i.test(message)) {
    return {
      status: "blocked",
      title: "Trend tables are not migrated yet",
      detail:
        "The app can reach Postgres, but the historical odds and ledger tables are not ready in this database yet.",
      steps: [
        "Run npx prisma migrate deploy.",
        "Run npm run prisma:seed.",
        "Redeploy the frontend after the database is ready."
      ]
    };
  }

  return {
    status: "blocked",
    title: "Trends are unavailable in this runtime",
    detail:
      "The trends service hit a database-backed error and is refusing to backfill fake cards.",
    steps: [
      "Check the deployment logs for the Prisma error.",
      `Active DB source: ${resolution.key ?? "none"}.`,
      `Latest error: ${message || "Unknown trends service error."}`
    ]
  };
}

function buildEmptyTrends(setup: TrendDashboardView["setup"]): TrendDashboardView {
  return {
    setup,
    metrics: [],
    insights: [],
    movementRows: [],
    segmentRows: [],
    savedTrendName: "Historical odds foundation",
    sourceNote:
      "Trend cards stay blank until the database-backed historical odds and ledger layers are available."
  };
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatSigned(value: number, digits = 2) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export async function getTrendDashboard(): Promise<TrendDashboardView> {
  try {
    const [markets, bets, savedTrend] = await Promise.all([
      prisma.eventMarket.findMany({
        where: {
          sourceKey: "oddsharvester_historical",
          snapshots: {
            some: {}
          }
        },
        include: {
          event: {
            include: {
              league: {
                select: {
                  key: true,
                  name: true
                }
              }
            }
          },
          sportsbook: {
            select: {
              name: true
            }
          },
          snapshots: {
            orderBy: {
              capturedAt: "asc"
            }
          }
        },
        orderBy: {
          updatedAt: "desc"
        },
        take: 60
      }),
      prisma.bet.findMany({
        where: {
          archivedAt: null,
          result: {
            not: "OPEN"
          }
        },
        include: {
          sportsbook: {
            select: {
              name: true
            }
          }
        },
        orderBy: {
          placedAt: "desc"
        },
        take: 300
      }),
      prisma.savedTrend.findFirst({
        orderBy: {
          updatedAt: "desc"
        }
      })
    ]);

    const movements = markets
      .map((market) => {
        const opening = market.snapshots[0];
        const latest = market.snapshots[market.snapshots.length - 1];
        if (!opening || !latest) {
          return null;
        }

        const delta =
          typeof opening.line === "number" && typeof latest.line === "number"
            ? latest.line - opening.line
            : (latest.oddsAmerican ?? 0) - (opening.oddsAmerican ?? 0);

        return {
          id: market.id,
          label: `${market.event.league.key} | ${market.marketLabel}`,
          movement: delta,
          note: `${market.sportsbook?.name ?? "Unknown book"} | ${opening.capturedAt.toISOString().slice(0, 10)} -> ${latest.capturedAt.toISOString().slice(0, 10)}`
        };
      })
      .filter(Boolean)
      .sort((left, right) => Math.abs(right!.movement) - Math.abs(left!.movement))
      .slice(0, 6) as Array<{
      id: string;
      label: string;
      movement: number;
      note: string;
    }>;

    const clvBets = bets.filter((bet) => typeof bet.clvPercentage === "number");
    const clvBySport = Array.from(
      clvBets.reduce<Map<string, number[]>>((map, bet) => {
        const key = bet.sport;
        map.set(key, [...(map.get(key) ?? []), bet.clvPercentage ?? 0]);
        return map;
      }, new Map())
    )
      .map(([label, values]) => ({
        label,
        value: average(values)
      }))
      .sort((left, right) => right.value - left.value);

    const clvByBook = Array.from(
      clvBets.reduce<Map<string, number[]>>((map, bet) => {
        const key = bet.sportsbook?.name ?? "No book";
        map.set(key, [...(map.get(key) ?? []), bet.clvPercentage ?? 0]);
        return map;
      }, new Map())
    )
      .map(([label, values]) => ({
        label,
        value: average(values)
      }))
      .sort((left, right) => right.value - left.value);

    const totalsBets = bets.filter(
      (bet) => bet.marketType === "total" || bet.marketType === "round_total"
    );
    const totalWins = totalsBets.filter((bet) => bet.result === "WIN").length;
    const totalsHitRate = totalsBets.length ? (totalWins / totalsBets.length) * 100 : 0;

    const metrics = [
      {
        label: "Snapshots",
        value: `${markets.reduce((total, market) => total + market.snapshots.length, 0)}`,
        note: "Harvested historical odds snapshots stored in Postgres."
      },
      {
        label: "Tracked Markets",
        value: `${markets.length}`,
        note: "Historical event markets currently available for movement and CLV work."
      },
      {
        label: "Tracked CLV Bets",
        value: `${clvBets.length}`,
        note: "Settled ledger bets with a calculable CLV percentage."
      },
      {
        label: "Totals Hit Rate",
        value: `${totalsHitRate.toFixed(1)}%`,
        note: "Based only on settled total and round-total bets in the ledger."
      }
    ];

    const insights: TrendDashboardView["insights"] = [
      {
        id: "largest-line-move",
        title: "Largest line move",
        value: movements.length ? formatSigned(movements[0].movement, 1) : "No data",
        note:
          movements[0]?.label ??
          "Historical odds snapshots are available, but there is not enough movement history yet.",
        tone: movements.length && Math.abs(movements[0].movement) >= 1 ? "brand" : "muted"
      },
      {
        id: "best-clv-sport",
        title: "Best CLV sport",
        value: clvBySport[0] ? `${clvBySport[0].label} ${formatSigned(clvBySport[0].value)}%` : "No data",
        note:
          clvBySport[0]
            ? "Average CLV percentage across settled ledger bets by sport."
            : "Add more settled bets with closing numbers to make this card meaningful.",
        tone: clvBySport[0] && clvBySport[0].value > 0 ? "success" : "muted"
      },
      {
        id: "best-book-clv",
        title: "Best book CLV",
        value: clvByBook[0] ? `${clvByBook[0].label} ${formatSigned(clvByBook[0].value)}%` : "No data",
        note:
          clvByBook[0]
            ? "Average CLV percentage across settled ledger bets by sportsbook."
            : "Sportsbook CLV cards will strengthen once more settled bets are stored.",
        tone: clvByBook[0] && clvByBook[0].value > 0 ? "premium" : "muted"
      },
      {
        id: "totals-trend",
        title: "Totals ledger trend",
        value: `${totalsHitRate.toFixed(1)}%`,
        note:
          totalsBets.length
            ? `${totalsBets.length} settled totals-grade bets in the current ledger sample.`
            : "No settled totals sample is stored yet.",
        tone: totalsHitRate >= 55 ? "success" : "muted"
      }
    ];

    const movementRows = movements.map((movement) => ({
      label: movement.label,
      movement: formatSigned(movement.movement, 1),
      note: movement.note
    }));

    const segmentRows = [
      ...clvBySport.slice(0, 3).map((segment) => ({
        label: `CLV by sport | ${segment.label}`,
        movement: `${formatSigned(segment.value)}%`,
        note: "Average CLV from settled ledger bets."
      })),
      ...clvByBook.slice(0, 3).map((segment) => ({
        label: `CLV by book | ${segment.label}`,
        movement: `${formatSigned(segment.value)}%`,
        note: "Average CLV from settled ledger bets."
      }))
    ];

    return {
      setup: null,
      metrics,
      insights,
      movementRows,
      segmentRows,
      savedTrendName: savedTrend?.name ?? "Historical odds foundation",
      sourceNote:
        "These cards are powered by harvested historical odds snapshots plus persisted settled bets. They show real stored data, not mock trend copy."
    };
  } catch (error) {
    return buildEmptyTrends(buildTrendSetupState(error));
  }
}
