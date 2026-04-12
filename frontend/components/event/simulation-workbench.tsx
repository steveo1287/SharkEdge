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
  overOdds: number | null;
  underOdds: number | null;
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

function buildAltLines(baseLine: number, step: number, count = 2) {
  const lines: number[] = [];
  for (let offset = -count; offset <= count; offset += 1) {
    lines.push(round(baseLine + offset * step, step >= 1 ? 1 : 1));
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
    .map((projection: EventSimulationView["topPlayerProjections"][number]) => {
      const metadata = getRecord(projection.metadata);
      const marketLine = getNumber(metadata.marketLine);
      const overOdds = getNumber(metadata.marketOddsOver);
      const underOdds = getNumber(metadata.marketOddsUnder);
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
        overOdds,
        underOdds,
        p10: getNumber(metadata.p10),
        p50: getNumber(metadata.p50),
        p90: getNumber(metadata.p90),
        drivers
      } satisfies PlayerWorkbenchOption;
    })
    .sort((left: PlayerWorkbenchOption, right: PlayerWorkbenchOption) => Math.abs((right.marketLine ?? right.meanValue) - right.meanValue) - Math.abs((left.marketLine ?? left.meanValue) - left.meanValue));
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
    scenarioMid:
      comparison.marketType === "total" ? p50Total : comparison.projected,
    scenarioHigh:
      comparison.marketType === "total"
        ? p90Total
        : round(comparison.projected + 1.28155 * spreadStdDev, 1)
  }));
}

function buildProbabilityRow(mean: number, stdDev: number, line: number) {
  const overProbability = clamp(1 - normalCdf(line, mean, stdDev), 0.001, 0.999);
  const underProbability = clamp(1 - overProbability, 0.001, 0.999);
  return {
    overProbability,
    underProbability,
    edgeVsLine: round(mean - line, 2)
  };
}

export function SimulationWorkbench({ simulation }: Props) {
  const playerOptions = useMemo(() => extractPlayerOptions(simulation), [simulation]);
  const gameMarkets = useMemo(() => extractGameMarkets(simulation), [simulation]);

  const [gameMarketKey, setGameMarketKey] = useState<"total" | "spread_home">(
    gameMarkets[0]?.key ?? "total"
  );
  const selectedGameMarket =
    gameMarkets.find((market) => market.key === gameMarketKey) ?? gameMarkets[0] ?? null;
  const [gameLineMode, setGameLineMode] = useState<"market" | "custom">("market");
  const [gameCustomLine, setGameCustomLine] = useState<string>(
    selectedGameMarket ? String(selectedGameMarket.marketLine) : ""
  );

  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(playerOptions[0]?.id ?? "");
  const selectedPlayer =
    playerOptions.find((option) => option.id === selectedPlayerId) ?? playerOptions[0] ?? null;
  const [playerLineMode, setPlayerLineMode] = useState<"market" | "custom">("market");
  const [playerCustomLine, setPlayerCustomLine] = useState<string>(
    selectedPlayer?.marketLine != null ? String(selectedPlayer.marketLine) : String(round(selectedPlayer?.meanValue ?? 0, 1))
  );

  const effectiveGameLine = useMemo(() => {
    if (!selectedGameMarket) {
      return null;
    }
    if (gameLineMode === "custom") {
      const parsed = Number(gameCustomLine);
      return Number.isFinite(parsed) ? parsed : selectedGameMarket.marketLine;
    }
    return selectedGameMarket.marketLine;
  }, [gameCustomLine, gameLineMode, selectedGameMarket]);

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
    return selectedPlayer.marketLine ?? round(selectedPlayer.meanValue, 1);
  }, [playerCustomLine, playerLineMode, selectedPlayer]);

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
      ? buildAltLines(effectivePlayerLine, getPlayerStep(selectedPlayer.statKey, selectedPlayer.meanValue), 3)
      : [];

  const playerBand = selectedPlayer
    ? {
        low: selectedPlayer.p10 ?? getScenarioBand(selectedPlayer.meanValue, selectedPlayer.stdDev).low,
        mid: selectedPlayer.p50 ?? round(selectedPlayer.medianValue, 1),
        high: selectedPlayer.p90 ?? getScenarioBand(selectedPlayer.meanValue, selectedPlayer.stdDev).high
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
              Work the line against the model
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              Current build supports consensus line or custom line reruns. True per-book selection still needs book-level prop states in the event payload.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="muted">Live line compare</Badge>
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
              {selectedGameMarket ? <Badge tone="muted">{selectedGameMarket.label}</Badge> : null}
            </div>

            {selectedGameMarket ? (
              <div className="mt-4 grid gap-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Market</span>
                    <select
                      value={selectedGameMarket.key}
                      onChange={(event: any) => {
                        setGameMarketKey(event.target.value as "total" | "spread_home");
                        const nextMarket = gameMarkets.find((market) => market.key === event.target.value);
                        if (nextMarket) {
                          setGameCustomLine(String(nextMarket.marketLine));
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
                        onClick={() => {
                          setGameLineMode("market");
                          setGameCustomLine(String(selectedGameMarket.marketLine));
                        }}
                        className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                          gameLineMode === "market"
                            ? "border-sky-400/30 bg-sky-500/10 text-sky-300"
                            : "border-white/10 bg-slate-950/70 text-slate-400"
                        }`}
                      >
                        Current market
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
                        Custom line
                      </button>
                    </div>
                  </div>
                </div>

                <label className="grid gap-2 text-sm text-slate-300">
                  <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Line</span>
                  <input
                    value={gameLineMode === "custom" ? gameCustomLine : String(selectedGameMarket.marketLine)}
                    onChange={(event: any) => setGameCustomLine(event.target.value)}
                    disabled={gameLineMode !== "custom"}
                    inputMode="decimal"
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>

                {gameProbabilities ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Projected</div>
                      <div className="mt-2 text-lg font-semibold text-white">{selectedGameMarket.projected.toFixed(1)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Over / home cover</div>
                      <div className="mt-2 text-lg font-semibold text-white">{formatProbability(gameProbabilities.overProbability)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Edge vs line</div>
                      <div className="mt-2 text-lg font-semibold text-white">{formatSigned(gameProbabilities.edgeVsLine, 2)}</div>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Scenario range</div>
                    <div className="mt-2 text-sm leading-6 text-slate-300">
                      Low {selectedGameMarket.scenarioLow?.toFixed(1) ?? "—"} · Mid {selectedGameMarket.scenarioMid?.toFixed(1) ?? "—"} · High {selectedGameMarket.scenarioHigh?.toFixed(1) ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Alternate lines</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {gameAltLines.map((line) => {
                        const probs = buildProbabilityRow(
                          selectedGameMarket.projected,
                          selectedGameMarket.stdDev,
                          line
                        );
                        return (
                          <button
                            key={line}
                            type="button"
                            onClick={() => {
                              setGameLineMode("custom");
                              setGameCustomLine(String(line));
                            }}
                            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300"
                          >
                            {line.toFixed(1)} · {formatProbability(probs.overProbability)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm leading-6 text-slate-400">Game market comparisons are not populated for this event yet.</div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Player prop workbench</div>
                <div className="mt-1 text-lg font-semibold text-white">Prop rerun against custom line</div>
              </div>
              {selectedPlayer ? <Badge tone="muted">{formatStatLabel(selectedPlayer.statKey)}</Badge> : null}
            </div>

            {selectedPlayer ? (
              <div className="mt-4 grid gap-4">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Player and prop</span>
                  <select
                    value={selectedPlayer.id}
                    onChange={(event: any) => {
                      setSelectedPlayerId(event.target.value);
                      const nextPlayer = playerOptions.find((option) => option.id === event.target.value);
                      if (nextPlayer) {
                        setPlayerCustomLine(String(nextPlayer.marketLine ?? round(nextPlayer.meanValue, 1)));
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

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-2">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Line source</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPlayerLineMode("market");
                          setPlayerCustomLine(String(selectedPlayer.marketLine ?? round(selectedPlayer.meanValue, 1)));
                        }}
                        className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                          playerLineMode === "market"
                            ? "border-sky-400/30 bg-sky-500/10 text-sky-300"
                            : "border-white/10 bg-slate-950/70 text-slate-400"
                        }`}
                      >
                        Current market
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
                        Custom line
                      </button>
                    </div>
                  </div>

                  <label className="grid gap-2 text-sm text-slate-300">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Line</span>
                    <input
                      value={playerLineMode === "custom" ? playerCustomLine : String(selectedPlayer.marketLine ?? round(selectedPlayer.meanValue, 1))}
                      onChange={(event: any) => setPlayerCustomLine(event.target.value)}
                      disabled={playerLineMode !== "custom"}
                      inputMode="decimal"
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>
                </div>

                {playerProbabilities ? (
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Sim mean</div>
                      <div className="mt-2 text-lg font-semibold text-white">{selectedPlayer.meanValue.toFixed(1)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Over probability</div>
                      <div className="mt-2 text-lg font-semibold text-white">{formatProbability(playerProbabilities.overProbability)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Under probability</div>
                      <div className="mt-2 text-lg font-semibold text-white">{formatProbability(playerProbabilities.underProbability)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Edge vs line</div>
                      <div className="mt-2 text-lg font-semibold text-white">{formatSigned(playerProbabilities.edgeVsLine, 2)}</div>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Confidence band</div>
                    <div className="mt-2 text-sm leading-6 text-slate-300">
                      P10 {playerBand?.low?.toFixed(1) ?? "—"} · P50 {playerBand?.mid?.toFixed(1) ?? "—"} · P90 {playerBand?.high?.toFixed(1) ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Alternate lines</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {playerAltLines.map((line) => {
                        const probs = buildProbabilityRow(selectedPlayer.meanValue, selectedPlayer.stdDev, line);
                        return (
                          <button
                            key={line}
                            type="button"
                            onClick={() => {
                              setPlayerLineMode("custom");
                              setPlayerCustomLine(String(line));
                            }}
                            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300"
                          >
                            {line.toFixed(getPlayerStep(selectedPlayer.statKey, selectedPlayer.meanValue) >= 1 ? 0 : 1)} · {formatProbability(probs.overProbability)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {selectedPlayer.drivers.length ? (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Why the sim moved</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedPlayer.drivers.map((driver) => (
                        <Badge key={driver} tone={getToneFromEdge(playerProbabilities?.edgeVsLine ?? 0)}>
                          {driver}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 text-sm leading-6 text-slate-400">Player prop simulations are not populated for this event yet.</div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
