import Link from "next/link";
import { notFound } from "next/navigation";

import { SimulationIntelligencePanel } from "@/components/event/simulation-intelligence-panel";
import { SimulationWorkbench } from "@/components/event/simulation-workbench";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { withTimeoutFallback } from "@/lib/utils/async";
import { buildEventSimulationView } from "@/services/simulation/simulation-view-service";
import { getBoardPageData, parseBoardFilters } from "@/services/odds/board-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function getStatusBadgeTone(status: string) {
  if (status === "LIVE") return "success" as const;
  if (status === "FINAL") return "muted" as const;
  return "premium" as const;
}

async function getGameDetails(gameId: string) {
  try {
    const boardData = await withTimeoutFallback(
      (async () => {
        const data = await getBoardPageData(
          parseBoardFilters({ league: "ALL", date: "today", status: "all" })
        );
        return data.games.find((g) => g.id === gameId) ?? null;
      })(),
      {
        timeoutMs: 2000,
        fallback: null
      }
    );

    return boardData;
  } catch {
    return null;
  }
}

async function getSimulation(gameId: string) {
  try {
    const sim = await withTimeoutFallback(
      buildEventSimulationView(gameId),
      {
        timeoutMs: 3000,
        fallback: null
      }
    );
    return sim;
  } catch {
    return null;
  }
}

export default async function GameDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [game, simulation] = await Promise.all([
    getGameDetails(id),
    getSimulation(id)
  ]);

  if (!game) {
    notFound();
  }

  return (
    <div className="grid gap-6">
      {/* ── Game Header ─────────────────────────────────────────────────────── */}
      <div className="hero-shell p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">
              Live Game
            </div>
            <h1 className="mt-2 font-display text-[28px] font-semibold tracking-[-0.01em] text-text-primary sm:text-[32px]">
              {game.awayTeam.name} @ {game.homeTeam.name}
            </h1>
            <div className="mt-2 text-[13px] text-bone/70">{formatTime(game.startTime)}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={getStatusBadgeTone(game.status)}>{game.status}</Badge>
            {game.leagueKey && (
              <Badge tone="muted">
                {game.leagueKey.toUpperCase()}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* ── Simulation Panel ────────────────────────────────────────────────── */}
      {simulation && (
        <>
          <SimulationIntelligencePanel simulation={simulation} />
          <SimulationWorkbench simulation={simulation} />
        </>
      )}

      {/* ── Markets Overview ────────────────────────────────────────────────── */}
      <section className="grid gap-3">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">
            Market Summary
          </div>
          <h2 className="mt-1 font-display text-[20px] font-semibold tracking-[-0.01em] text-text-primary">
            Live Odds
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {/* Moneyline */}
          <Card className="surface-panel p-4">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/60">
              {game.moneyline.label}
            </div>
            <div className="mt-3">
              <div className="text-[11px] text-bone/50">{game.moneyline.bestBook}</div>
              <div className="mt-1 font-mono text-[16px] font-semibold text-mint">
                {game.moneyline.bestOdds ? `${game.moneyline.bestOdds > 0 ? "+" : ""}${game.moneyline.bestOdds}` : "—"}
              </div>
            </div>
            {game.moneyline.movement !== 0 && (
              <div className="mt-3 text-[11px] text-bone/50">
                Movement: {game.moneyline.movement > 0 ? "↑" : "↓"} {Math.abs(game.moneyline.movement).toFixed(1)}
              </div>
            )}
          </Card>

          {/* Spread */}
          <Card className="surface-panel p-4">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/60">
              {game.spread.label}
            </div>
            <div className="mt-3">
              <div className="text-[11px] text-bone/50">{game.spread.bestBook}</div>
              <div className="mt-1 font-mono text-[16px] font-semibold">
                {game.spread.lineLabel || "—"}
              </div>
            </div>
            {game.spread.movement !== 0 && (
              <div className="mt-3 text-[11px] text-bone/50">
                Movement: {game.spread.movement > 0 ? "↑" : "↓"} {Math.abs(game.spread.movement).toFixed(1)}
              </div>
            )}
          </Card>

          {/* Total */}
          <Card className="surface-panel p-4">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/60">
              {game.total.label}
            </div>
            <div className="mt-3">
              <div className="text-[11px] text-bone/50">{game.total.bestBook}</div>
              <div className="mt-1 font-mono text-[20px] font-semibold text-aqua">
                {game.total.lineLabel || "—"}
              </div>
            </div>
            {game.total.movement !== 0 && (
              <div className="mt-3 text-[11px] text-bone/50">
                Movement: {game.total.movement > 0 ? "↑" : "↓"} {Math.abs(game.total.movement).toFixed(1)}
              </div>
            )}
          </Card>
        </div>
      </section>

      {/* ── Back to Board ───────────────────────────────────────────────────── */}
      <div className="flex justify-center">
        <Link
          href="/board"
          className="rounded-md border border-bone/[0.10] bg-surface px-4 py-2.5 text-[12.5px] font-semibold text-bone/70 transition-colors hover:border-aqua/25 hover:text-aqua"
        >
          ← Back to Board
        </Link>
      </div>
    </div>
  );
}
