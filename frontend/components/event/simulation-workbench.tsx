"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { EventSimulationView } from "@/services/simulation/simulation-view-service";

type Props = {
  simulation: EventSimulationView;
};

type PlayerWorkbenchOption = {
  id: string;
  label: string;
  statKey: string;
  meanValue: number;
  medianValue: number;
  stdDev: number;
  marketLine: number | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  drivers: string[];
};

type GameMarketOption = {
  key: "total" | "spread_home";
  label: string;
  projected: number;
  marketLine: number;
  stdDev: number;
  scenarioLow: number | null;
  scenarioMid: number | null;
  scenarioHigh: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function erf(x: number) {
  const sign = x >= 0 ? 1 : -1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);
  return sign * y;
}

function normalCdf(x: number, mean: number, sd: number) {
  if (!Number.isFinite(sd) || sd <= 0) {
    return x >= mean ? 1 : 0;
  }
  const z = (x - mean) / (sd * Math.sqrt(2));
  return 0.5 * (1 + erf(z));
}

function formatProbability(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatSigned(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatStatLabel(statKey: string) {
  return statKey.replace(/^player_/, "").replace(/_/g, " ");
}

function getPlayerStep(statKey: string, meanValue: number) {
  if (statKey.includes("passing") || statKey.includes("rushing") || statKey.includes("receiving")) {
    return 5;
  }
  if (statKey.includes("pitcher_outs")) {
    return 1;
  }
  if (statKey.includes("points") && meanValue >= 20) {
    return 1;
  }
  return 0.5;
}

function buildAltLines(baseLine: number, step: number, count = 3) {
  const lines: number[] = [];
  for (let offset = -count; offset <= count; offset += 1) {
    lines.push(round(baseLine + offset * step, 1));
  }
  return Array.from(new Set(lines)).sort((left, right) => left - right);
}

function getScenarioBand(mean: number, stdDev: number) {
  const low = round(mean - 1.28155 * stdDev, 1);
  const high = round(mean + 1.28155 * stdDev, 1);
  return { low, high };
}

function getToneFromEdge(value: number) {
  if (Math.abs(value) >= 10) return "success" as const;
  if (Math.abs(value) >= 4) return "brand" as const;
  return "muted" as const;
}

function extractPlayerOptions(simulation: EventSimulationView): PlayerWorkbenchOption[] {
  return simulation.topPlayerProjections
    .map((projection) => {
      const metadata = getRecord(projection.metadata);
      const marketLine = getNumber(metadata.marketLine);
      const playerName =
        typeof metadata.playerName === "string" && metadata.playerName.trim().length
          ? metadata.playerName
          : projection.playerId;
      const drivers = Array.isArray(metadata.drivers)
        ? metadata.drivers.filter((value): value is string => typeof value === "string").slice(0, 4)
        : [];

      return {
        id: `${projection.playerId}:${projection.statKey}`,
        label: `${playerName} · ${formatStatLabel(projection.statKey)}`,
        statKey: projection.statKey,
        meanValue: projection.meanValue,
        medianValue: projection.medianValue ?? projection.meanValue,
        stdDev: projection.stdDev,
        marketLine,
        p10: getNumber(metadata.p10),
        p50: getNumber(metadata.p50),
        p90: getNumber(metadata.p90),
        drivers,
      } satisfies PlayerWorkbenchOption;
    })
    .sort(
      (left, right) =>
        Math.abs((right.marketLine ?? right.meanValue) - right.meanValue) -
        Math.abs((left.marketLine ?? left.meanValue) - left.meanValue)
    );
}

function extractGameMarkets(simulation: EventSimulationView): GameMarketOption[] {
  const projectionSummary = simulation.projectionSummary;
  if (!projectionSummary) {
    return [];
  }

  const metadata = getRecord(simulation.eventProjection?.metadata);
  const simulationMeta = getRecord(metadata.simulation);
  const distribution = getRecord(simulationMeta.distribution);
  const totalStdDev = getNumber(distribution.totalStdDev) ?? 7;
  const homeScoreStdDev = getNumber(distribution.homeScoreStdDev) ?? 5;
  const awayScoreStdDev = getNumber(distribution.awayScoreStdDev) ?? 5;
  const spreadStdDev = Math.max(1.25, Math.sqrt(homeScoreStdDev ** 2 + awayScoreStdDev ** 2));
  const p10Total = getNumber(distribution.p10Total);
  const p50Total = getNumber(distribution.p50Total);
  const p90Total = getNumber(distribution.p90Total);

  return simulation.eventBetComparisons.map((comparison) => ({
    key: comparison.marketType,
    label: comparison.marketType === "total" ? "Game total" : "Home spread",
    projected: comparison.projected,
    marketLine: comparison.marketLine,
    stdDev: comparison.marketType === "total" ? totalStdDev : spreadStdDev,
    scenarioLow:
      comparison.marketType === "total"
        ? p10Total
        : round(comparison.projected - 1.28155 * spreadStdDev, 1),
    scenarioMid: comparison.marketType === "total" ? p50Total : comparison.projected,
    scenarioHigh:
      comparison.marketType === "total"
        ? p90Total
        : round(comparison.projected + 1.28155 * spreadStdDev, 1),
  }));
}

function buildProbabilityRow(mean: number, stdDev: number, line: number) {
  const overProbability = clamp(1 - normalCdf(line, mean, stdDev), 0.001, 0.999);
  const underProbability = clamp(1 - overProbability, 0.001, 0.999);
  return {
    overProbability,
    underProbability,
    edgeVsLine: round(mean - line, 2),
  };
}

export function SimulationWorkbench({ simulation }: Props) {
  const playerOptions = useMemo(() => extractPlayerOptions(simulation), [simulation]);
  const gameMarkets = useMemo(() => extractGameMarkets(simulation), [simulation]);

  const bookGameMarkets = simulation.bookMarketState?.gameMarkets ?? [];
  const bookPlayerMarkets = simulation.bookMarketState?.playerMarkets ?? [];

  const [gameMarketKey, setGameMarketKey] = useState<"total" | "spread_home">(
    gameMarkets[0]?.key ?? "total"
  );
  const selectedGameMarket =
    gameMarkets.find((market) => market.key === gameMarketKey) ?? gameMarkets[0] ?? null;
  const selectedGameBookMarket =
    bookGameMarkets.find((market) => market.marketType === gameMarketKey) ?? null;

  const [gameLineMode, setGameLineMode] = useState<"consensus" | "book" | "custom">(
    selectedGameBookMarket?.books.length ? "book" : "consensus"
  );
  const [selectedGameBookKey, setSelectedGameBookKey] = useState<string>(
    selectedGameBookMarket?.bestBook ? `${selectedGameBookMarket.bestBook.bookKey}:${selectedGameBookMarket.bestBook.line}` : selectedGameBookMarket?.books[0] ? `${selectedGameBookMarket.books[0].bookKey}:${selectedGameBookMarket.books[0].line}` : ""
  );
  const [gameCustomLine, setGameCustomLine] = useState<string>(
    selectedGameMarket ? String(selectedGameMarket.marketLine) : ""
  );

  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(playerOptions[0]?.id ?? "");
  const selectedPlayer =
    playerOptions.find((option) => option.id === selectedPlayerId) ?? playerOptions[0] ?? null;
  const selectedPlayerBookMarket =
    bookPlayerMarkets.find((market) => market.key === selectedPlayerId) ?? null;

  const [playerLineMode, setPlayerLineMode] = useState<"consensus" | "book" | "custom">(
    selectedPlayerBookMarket?.books.length ? "book" : "consensus"
  );
  const [selectedPlayerBookKey, setSelectedPlayerBookKey] = useState<string>(
    selectedPlayerBookMarket?.bestBook ? `${selectedPlayerBookMarket.bestBook.bookKey}:${selectedPlayerBookMarket.bestBook.line}` : selectedPlayerBookMarket?.books[0] ? `${selectedPlayerBookMarket.books[0].bookKey}:${selectedPlayerBookMarket.books[0].line}` : ""
  );
  const [playerCustomLine, setPlayerCustomLine] = useState<string>(
    selectedPlayer?.marketLine != null
      ? String(selectedPlayer.marketLine)
      : String(round(selectedPlayer?.meanValue ?? 0, 1))
  );

  const selectedGameBook =
    selectedGameBookMarket?.books.find((book) => `${book.bookKey}:${book.line}` === selectedGameBookKey) ??
    selectedGameBookMarket?.bestBook ??
    selectedGameBookMarket?.books[0] ??
    null;

  const selectedPlayerBook =
    selectedPlayerBookMarket?.books.find((book) => `${book.bookKey}:${book.line}` === selectedPlayerBookKey) ??
    selectedPlayerBookMarket?.bestBook ??
    selectedPlayerBookMarket?.books[0] ??
    null;

  const effectiveGameLine = useMemo(() => {
    if (!selectedGameMarket) {
      return null;
    }
    if (gameLineMode === "custom") {
      const parsed = Number(gameCustomLine);
      return Number.isFinite(parsed) ? parsed : selectedGameMarket.marketLine;
    }
    if (gameLineMode === "book") {
      return (
        selectedGameBook?.line ??
        selectedGameBookMarket?.consensusLine ??
        selectedGameMarket.marketLine
      );
    }
    return selectedGameBookMarket?.consensusLine ?? selectedGameMarket.marketLine;
  }, [gameCustomLine, gameLineMode, selectedGameBook, selectedGameBookMarket, selectedGameMarket]);

  const effectivePlayerLine = useMemo(() => {
    if (!selectedPlayer) {
      return null;
    }
    if (playerLineMode === "custom") {
      const parsed = Number(playerCustomLine);
      return Number.isFinite(parsed)
        ? parsed
        : selectedPlayer.marketLine ?? round(selectedPlayer.meanValue, 1);
    }
    if (playerLineMode === "book") {
      return (
        selectedPlayerBook?.line ??
        selectedPlayerBookMarket?.consensusLine ??
        selectedPlayer.marketLine ??
        round(selectedPlayer.meanValue, 1)
      );
    }
    return (
      selectedPlayerBookMarket?.consensusLine ??
      selectedPlayer.marketLine ??
      round(selectedPlayer.meanValue, 1)
    );
  }, [playerCustomLine, playerLineMode, selectedPlayer, selectedPlayerBook, selectedPlayerBookMarket]);

  const gameProbabilities =
    selectedGameMarket && effectiveGameLine != null
      ? buildProbabilityRow(selectedGameMarket.projected, selectedGameMarket.stdDev, effectiveGameLine)
      : null;
  const playerProbabilities =
    selectedPlayer && effectivePlayerLine != null
      ? buildProbabilityRow(selectedPlayer.meanValue, selectedPlayer.stdDev, effectivePlayerLine)
      : null;

  const gameAltLines =
    selectedGameMarket && effectiveGameLine != null
      ? buildAltLines(effectiveGameLine, selectedGameMarket.key === "total" ? 1 : 0.5, 3)
      : [];
  const playerAltLines =
    selectedPlayer && effectivePlayerLine != null
      ? buildAltLines(
          effectivePlayerLine,
          getPlayerStep(selectedPlayer.statKey, selectedPlayer.meanValue),
          3
        )
      : [];

  const playerBand = selectedPlayer
    ? {
        low: selectedPlayer.p10 ?? getScenarioBand(selectedPlayer.meanValue, selectedPlayer.stdDev).low,
        mid: selectedPlayer.p50 ?? round(selectedPlayer.medianValue, 1),
        high: selectedPlayer.p90 ?? getScenarioBand(selectedPlayer.meanValue, selectedPlayer.stdDev).high,
      }
    : null;

  return (
    <Card className="surface-panel p-4 sm:p-5">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[0.72rem] uppercase tracking-[0.18em] text-slate-500">
              Interactive sim workstation
            </div>
            <div className="mt-1 text-[1.2rem] font-semibold text-white">
              Work the book mesh against the model
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              MLB build now supports consensus, book-native, or custom-line reruns using the current market mesh.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="muted">Consensus vs book</Badge>
            <Badge tone="muted">Alt line ladder</Badge>
            <Badge tone="muted">Scenario ranges</Badge>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Game markets</div>
                <div className="mt-1 text-lg font-semibold text-white">Side and total rerun</div>
              </div>
              {selectedGameBookMarket ? <Badge tone="muted">{selectedGameBookMarket.simSide}</Badge> : null}
            </div>

            {selectedGameMarket ? (
              <div className="mt-4 grid gap-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Market</span>
                    <select
                      value={selectedGameMarket.key}
                      onChange={(event) => {
                        const nextKey = event.target.value as "total" | "spread_home";
                        setGameMarketKey(nextKey);
                        const nextMarket = gameMarkets.find((market) => market.key === nextKey);
                        const nextBookMarket =
                          bookGameMarkets.find((market) => market.marketType === nextKey) ?? null;
                        if (nextMarket) {
                          setGameCustomLine(String(nextMarket.marketLine));
                        }
                        if (nextBookMarket?.books[0]) {
                          setSelectedGameBookKey(
                            nextBookMarket.bestBook
                              ? `${nextBookMarket.bestBook.bookKey}:${nextBookMarket.bestBook.line}`
                              : `${nextBookMarket.books[0].bookKey}:${nextBookMarket.books[0].line}`
                          );
                        }
                      }}
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none"
                    >
                      {gameMarkets.map((market) => (
                        <option key={market.key} value={market.key}>
                          {market.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid gap-2">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Line source</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setGameLineMode("consensus")}
                        className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                          gameLineMode === "consensus"
                            ? "border-sky-400/30 bg-sky-500/10 text-sky-300"
                            : "border-white/10 bg-slate-950/70 text-slate-400"
                        }`}
                      >
                        Consensus
                      </button>
                      <button
                        type="button"
                        disabled={!selectedGameBookMarket?.books.length}
                        onClick={() => setGameLineMode("book")}
                        className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                          gameLineMode === "book"
                            ? "border-sky-400/30 bg-sky-500/10 text-sky-300"
                            : "border-white/10 bg-slate-950/70 text-slate-400"
                        } disabled:cursor-not-allowed disabled:opacity-40`}
                      >
                        Book
                      </button>
                      <button
                        type="button"
                        onClick={() => setGameLineMode("custom")}
                        className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                          gameLineMode === "custom"
                            ? "border-sky-400/30 bg-sky-500/10 text-sky-300"
                            : "border-white/10 bg-slate-950/70 text-slate-400"
                        }`}
                      >
                        Custom
                      </button>
                    </div>
                  </div>
                </div>

                {gameLineMode === "book" && selectedGameBookMarket?.books.length ? (
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Book</span>
                    <select
                      value={selectedGameBook ? `${selectedGameBook.bookKey}:${selectedGameBook.line}` : selectedGameBookKey}
                      onChange={(event) => setSelectedGameBookKey(event.target.value)}
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none"
                    >
                      {selectedGameBookMarket.books.map((book) => (
                        <option key={`${book.bookKey}:${book.line}`} value={`${book.bookKey}:${book.line}`}>
                          {book.bookName} · line {book.line}
                          {book.oddsAmerican != null
                            ? ` · ${book.oddsAmerican > 0 ? "+" : ""}${book.oddsAmerican}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {gameLineMode === "custom" ? (
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Custom line</span>
                    <input
                      value={gameCustomLine}
                      onChange={(event) => setGameCustomLine(event.target.value)}
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none"
                    />
                  </label>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Projected</div>
                    <div className="mt-2 text-lg font-semibold text-white">{selectedGameMarket.projected.toFixed(1)}</div>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Active line</div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {effectiveGameLine != null ? effectiveGameLine.toFixed(1) : "—"}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Sim side</div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {selectedGameBookMarket?.simSide ?? "NONE"}
                    </div>
                  </div>
                </div>

                {selectedGameBookMarket?.bestBookCallout ? (
                  <div className="grid gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-3 text-sm text-emerald-50">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-200/80">Best book callout</div>
                    <div>{selectedGameBookMarket.bestBookCallout}</div>
                    {selectedGameBookMarket.executionTriggers.length ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedGameBookMarket.executionTriggers.map((trigger) => (
                          <Badge key={`game-trigger:${trigger}`} tone="muted">{trigger}</Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {selectedGameBook ? (
                  <div className="grid gap-2 rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-300">
                    <div className="flex items-center justify-between gap-2">
                      <div>{selectedGameBook.bookName}</div>
                      <div className="flex gap-2">
                        <Badge tone="muted">Exec {selectedGameBook.executionScore.toFixed(1)}</Badge>
                        {selectedGameBook.isOutlier ? <Badge tone="brand">Outlier</Badge> : null}
                        {selectedGameBook.isStale ? <Badge tone="muted">Stale</Badge> : null}
                      </div>
                    </div>
                    <div className="text-slate-400">
                      Line {selectedGameBook.line.toFixed(1)}
                      {selectedGameBook.oddsAmerican != null
                        ? ` · odds ${selectedGameBook.oddsAmerican > 0 ? "+" : ""}${selectedGameBook.oddsAmerican}`
                        : ""}
                      {selectedGameBook.deltaFromConsensus != null
                        ? ` · vs consensus ${formatSigned(selectedGameBook.deltaFromConsensus, 2)}`
                        : ""}
                      {` · ${selectedGameBook.freshnessMinutes}m old`}
                    </div>
                    {selectedGameBook.executionReasons.length ? (
                      <div className="mt-1 grid gap-2">
                        {selectedGameBook.executionReasons.map((reason) => (
                          <div key={reason} className="rounded-xl bg-white/[0.04] px-3 py-2 text-slate-200">
                            {reason}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {gameProbabilities ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                        {selectedGameMarket.key === "total" ? "Over prob" : "Home cover prob"}
                      </div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {formatProbability(gameProbabilities.overProbability)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                        {selectedGameMarket.key === "total" ? "Under prob" : "Away cover prob"}
                      </div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {formatProbability(gameProbabilities.underProbability)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Edge vs line</div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {formatSigned(gameProbabilities.edgeVsLine, 2)}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Scenario range</div>
                    <div className="mt-2 text-sm leading-6 text-slate-300">
                      {selectedGameMarket.scenarioLow?.toFixed(1) ?? "—"} · {selectedGameMarket.scenarioMid?.toFixed(1) ?? "—"} · {selectedGameMarket.scenarioHigh?.toFixed(1) ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Alt line ladder</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {gameAltLines.map((line) => {
                        const probability = buildProbabilityRow(selectedGameMarket.projected, selectedGameMarket.stdDev, line);
                        return (
                          <Badge key={line} tone={getToneFromEdge(probability.edgeVsLine)}>
                            {line.toFixed(1)} · {formatProbability(probability.overProbability)}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-slate-400">No game market projections are available.</div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Player markets</div>
                <div className="mt-1 text-lg font-semibold text-white">Prop rerun</div>
              </div>
              {selectedPlayerBookMarket ? <Badge tone="muted">{selectedPlayerBookMarket.simSide}</Badge> : null}
            </div>

            {selectedPlayer ? (
              <div className="mt-4 grid gap-4">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Prop</span>
                  <select
                    value={selectedPlayer.id}
                    onChange={(event) => {
                      const nextKey = event.target.value;
                      setSelectedPlayerId(nextKey);
                      const nextPlayer = playerOptions.find((option) => option.id === nextKey) ?? null;
                      const nextBookMarket = bookPlayerMarkets.find((market) => market.key === nextKey) ?? null;
                      if (nextPlayer) {
                        setPlayerCustomLine(
                          String(nextPlayer.marketLine ?? round(nextPlayer.meanValue, 1))
                        );
                      }
                      if (nextBookMarket?.books[0]) {
                        setSelectedPlayerBookKey(
                          nextBookMarket.bestBook
                            ? `${nextBookMarket.bestBook.bookKey}:${nextBookMarket.bestBook.line}`
                            : `${nextBookMarket.books[0].bookKey}:${nextBookMarket.books[0].line}`
                        );
                      }
                    }}
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none"
                  >
                    {playerOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-2">
                  <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Line source</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPlayerLineMode("consensus")}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                        playerLineMode === "consensus"
                          ? "border-sky-400/30 bg-sky-500/10 text-sky-300"
                          : "border-white/10 bg-slate-950/70 text-slate-400"
                      }`}
                    >
                      Consensus
                    </button>
                    <button
                      type="button"
                      disabled={!selectedPlayerBookMarket?.books.length}
                      onClick={() => setPlayerLineMode("book")}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                        playerLineMode === "book"
                          ? "border-sky-400/30 bg-sky-500/10 text-sky-300"
                          : "border-white/10 bg-slate-950/70 text-slate-400"
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      Book
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlayerLineMode("custom")}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                        playerLineMode === "custom"
                          ? "border-sky-400/30 bg-sky-500/10 text-sky-300"
                          : "border-white/10 bg-slate-950/70 text-slate-400"
                      }`}
                    >
                      Custom
                    </button>
                  </div>
                </div>

                {playerLineMode === "book" && selectedPlayerBookMarket?.books.length ? (
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Book</span>
                    <select
                      value={selectedPlayerBook ? `${selectedPlayerBook.bookKey}:${selectedPlayerBook.line}` : selectedPlayerBookKey}
                      onChange={(event) => setSelectedPlayerBookKey(event.target.value)}
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none"
                    >
                      {selectedPlayerBookMarket.books.map((book) => (
                        <option key={`${book.bookKey}:${book.line}`} value={`${book.bookKey}:${book.line}`}>
                          {book.bookName} · line {book.line}
                          {book.oddsAmerican != null
                            ? ` · ${book.oddsAmerican > 0 ? "+" : ""}${book.oddsAmerican}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {playerLineMode === "custom" ? (
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Custom line</span>
                    <input
                      value={playerCustomLine}
                      onChange={(event) => setPlayerCustomLine(event.target.value)}
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none"
                    />
                  </label>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Sim mean</div>
                    <div className="mt-2 text-lg font-semibold text-white">{selectedPlayer.meanValue.toFixed(2)}</div>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Active line</div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {effectivePlayerLine != null ? effectivePlayerLine.toFixed(1) : "—"}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Sim side</div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {selectedPlayerBookMarket?.simSide ?? "NONE"}
                    </div>
                  </div>
                </div>

                {selectedPlayerBookMarket?.bestBookCallout ? (
                  <div className="grid gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-3 text-sm text-emerald-50">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-200/80">Best book callout</div>
                    <div>{selectedPlayerBookMarket.bestBookCallout}</div>
                    {selectedPlayerBookMarket.executionTriggers.length ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedPlayerBookMarket.executionTriggers.map((trigger) => (
                          <Badge key={`player-trigger:${trigger}`} tone="muted">{trigger}</Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {selectedPlayerBook ? (
                  <div className="grid gap-2 rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-300">
                    <div className="flex items-center justify-between gap-2">
                      <div>{selectedPlayerBook.bookName}</div>
                      <div className="flex gap-2">
                        <Badge tone="muted">Exec {selectedPlayerBook.executionScore.toFixed(1)}</Badge>
                        {selectedPlayerBook.isOutlier ? <Badge tone="brand">Outlier</Badge> : null}
                        {selectedPlayerBook.isStale ? <Badge tone="muted">Stale</Badge> : null}
                      </div>
                    </div>
                    <div className="text-slate-400">
                      Line {selectedPlayerBook.line.toFixed(1)}
                      {selectedPlayerBook.oddsAmerican != null
                        ? ` · odds ${selectedPlayerBook.oddsAmerican > 0 ? "+" : ""}${selectedPlayerBook.oddsAmerican}`
                        : ""}
                      {selectedPlayerBook.deltaFromConsensus != null
                        ? ` · vs consensus ${formatSigned(selectedPlayerBook.deltaFromConsensus, 2)}`
                        : ""}
                      {` · ${selectedPlayerBook.freshnessMinutes}m old`}
                    </div>
                    {selectedPlayerBook.executionReasons.length ? (
                      <div className="mt-1 grid gap-2">
                        {selectedPlayerBook.executionReasons.map((reason) => (
                          <div key={reason} className="rounded-xl bg-white/[0.04] px-3 py-2 text-slate-200">
                            {reason}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {playerProbabilities ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Over prob</div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {formatProbability(playerProbabilities.overProbability)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Under prob</div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {formatProbability(playerProbabilities.underProbability)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Edge vs line</div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {formatSigned(playerProbabilities.edgeVsLine, 2)}
                      </div>
                    </div>
                  </div>
                ) : null}

                {playerBand ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Confidence band</div>
                      <div className="mt-2 text-sm leading-6 text-slate-300">
                        {playerBand.low.toFixed(1)} · {playerBand.mid.toFixed(1)} · {playerBand.high.toFixed(1)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Alt line ladder</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {playerAltLines.map((line) => {
                          const probability = buildProbabilityRow(selectedPlayer.meanValue, selectedPlayer.stdDev, line);
                          return (
                            <Badge key={line} tone={getToneFromEdge(probability.edgeVsLine)}>
                              {line.toFixed(1)} · {formatProbability(probability.overProbability)}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}

                {selectedPlayer.drivers.length ? (
                  <div className="rounded-2xl bg-white/[0.04] p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Drivers</div>
                    <div className="mt-2 grid gap-2 text-sm leading-6 text-slate-300">
                      {selectedPlayer.drivers.map((driver) => (
                        <div key={driver} className="rounded-xl bg-slate-950/40 px-3 py-2">
                          {driver}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 text-sm text-slate-400">No player projections are available.</div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
