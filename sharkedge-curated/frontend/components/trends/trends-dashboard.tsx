"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { BOARD_SPORTS } from "@/lib/config/board-sports";
import type { TrendDashboardView, TrendFilters, TrendMode } from "@/lib/types/domain";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { SetupStateCard } from "@/components/ui/setup-state-card";
import { StatCard } from "@/components/ui/stat-card";
import { TREND_QUERY_EXAMPLES } from "@/services/trends/ai-query";

type TrendsDashboardProps = {
  data: TrendDashboardView;
};

function buildTrendHref(
  filters: TrendFilters,
  mode: TrendMode,
  aiQuery: string,
  overrides?: Partial<Record<string, string | number | null | undefined>>
) {
  const params = new URLSearchParams();

  params.set("mode", mode);
  if (aiQuery.trim()) {
    params.set("q", aiQuery.trim());
  }

  for (const [key, value] of Object.entries(filters)) {
    if (value === "" || value === "ALL" || value === "all") continue;
    params.set(key, String(value));
  }

  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value === null || value === undefined || value === "") {
      params.delete(key);
      continue;
    }
    params.set(key, String(value));
  }

  return `/trends?${params.toString()}`;
}

function formatTimestamp(value: string | null) {
  if (!value) return "Not run yet";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function toneClass(tone: "success" | "brand" | "premium" | "muted") {
  if (tone === "success") return "border-emerald-400/20 bg-emerald-400/5";
  if (tone === "brand") return "border-sky-400/20 bg-sky-400/5";
  if (tone === "premium") return "border-amber-300/20 bg-amber-300/5";
  return "border-line bg-slate-950/65";
}

export function TrendsDashboard({ data }: TrendsDashboardProps) {
  const router = useRouter();
  const [saveName, setSaveName] = useState(
    data.savedTrendName && data.savedTrendName !== data.querySummary ? data.savedTrendName : ""
  );
  const [powerSort, setPowerSort] = useState<"roi" | "hitRate" | "sample" | "alpha">("roi");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const activeSystems = useMemo(
    () => data.savedSystems.filter((system) => !system.archivedAt),
    [data.savedSystems]
  );
  const archivedSystems = useMemo(
    () => data.savedSystems.filter((system) => Boolean(system.archivedAt)),
    [data.savedSystems]
  );
  const displayCards = useMemo(() => {
    const cards = [...data.cards];

    cards.sort((left, right) => {
      if (powerSort === "sample") {
        return right.sampleSize - left.sampleSize;
      }

      if (powerSort === "hitRate") {
        return Number(right.hitRate?.replace("%", "") ?? -999) - Number(left.hitRate?.replace("%", "") ?? -999);
      }

      if (powerSort === "alpha") {
        return left.title.localeCompare(right.title);
      }

      return Number(right.roi?.replace("%", "") ?? -999) - Number(left.roi?.replace("%", "") ?? -999);
    });

    return data.mode === "simple" ? cards.slice(0, 4) : cards;
  }, [data.cards, data.mode, powerSort]);

  async function mutateSavedSystem(
    url: string,
    options: RequestInit,
    successMessage: string
  ) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {})
      }
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Trend system request failed.");
    }

    setStatusMessage(successMessage);
    router.refresh();
  }

  function handleSaveCurrentSystem() {
    const trimmedName = saveName.trim() || data.savedTrendName || data.querySummary;

    startTransition(() => {
      mutateSavedSystem(
        "/api/trends/saved",
        {
          method: "POST",
          body: JSON.stringify({
            name: trimmedName,
            filters: data.filters,
            aiQuery: data.aiQuery || null,
            mode: data.mode
          })
        },
        `Saved system: ${trimmedName}`
      ).catch((error) => {
        setStatusMessage(error instanceof Error ? error.message : "Failed to save system.");
      });
    });
  }

  function handleUpdateSystem(id: string) {
    startTransition(() => {
      mutateSavedSystem(
        `/api/trends/saved/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            filters: data.filters,
            aiQuery: data.aiQuery || null,
            mode: data.mode
          })
        },
        "Saved system updated with the current query."
      ).catch((error) => {
        setStatusMessage(error instanceof Error ? error.message : "Failed to update system.");
      });
    });
  }

  function handleArchiveSystem(id: string, archived: boolean) {
    startTransition(() => {
      mutateSavedSystem(
        `/api/trends/saved/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            archived
          })
        },
        archived ? "Saved system archived." : "Saved system restored."
      ).catch((error) => {
        setStatusMessage(error instanceof Error ? error.message : "Failed to archive system.");
      });
    });
  }

  function handleDeleteSystem(id: string) {
    startTransition(() => {
      mutateSavedSystem(
        `/api/trends/saved/${id}`,
        {
          method: "DELETE"
        },
        "Saved system deleted."
      ).catch((error) => {
        setStatusMessage(error instanceof Error ? error.message : "Failed to delete system.");
      });
    });
  }

  if (data.setup) {
    return <SetupStateCard title={data.setup.title} detail={data.setup.detail} steps={data.setup.steps} />;
  }

  return (
    <div className="grid gap-6">
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-sky-300">Historical Intelligence</div>
            <div className="mt-2 font-display text-3xl font-semibold text-white">
              Trends that connect to today's slate
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">{data.sourceNote}</p>
          </div>
          <div className="inline-flex rounded-2xl border border-line bg-slate-950/80 p-1">
            <Link
              href={buildTrendHref(data.filters, "simple", data.aiQuery)}
              className={`rounded-xl px-4 py-2 text-sm ${data.mode === "simple" ? "bg-sky-500/15 text-sky-200" : "text-slate-400"}`}
            >
              Simple Mode
            </Link>
            <Link
              href={buildTrendHref(data.filters, "power", data.aiQuery)}
              className={`rounded-xl px-4 py-2 text-sm ${data.mode === "power" ? "bg-sky-500/15 text-sky-200" : "text-slate-400"}`}
            >
              Power Mode
            </Link>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <form action="/trends" method="get" className="grid gap-3">
          <input type="hidden" name="mode" value={data.mode} />
          <label className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Query Assistant
          </label>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <input
              name="q"
              defaultValue={data.aiQuery}
              placeholder="Show me NBA road underdogs after a loss"
              className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500"
            />
            <button
              type="submit"
              className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-5 py-3 text-sm font-medium text-sky-200"
            >
              Run Query
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {TREND_QUERY_EXAMPLES.map((example) => (
              <Link
                key={example}
                href={buildTrendHref(data.filters, data.mode, example, { q: example })}
                className="rounded-full border border-line bg-slate-950/65 px-3 py-1.5 text-xs text-slate-300"
              >
                {example}
              </Link>
            ))}
          </div>
          <div className="text-xs leading-6 text-slate-500">
            SharkEdge translates your prompt into structured filters, then summarizes real stored results. It does not invent systems, samples, or confidence.
          </div>
          {data.aiHelper ? (
            <div className="rounded-2xl border border-line bg-slate-950/70 p-4 text-sm text-slate-300">
              <div className="font-medium text-white">
                Parsed with {data.aiHelper.confidence} confidence
              </div>
              <div className="mt-2 leading-6">{data.aiHelper.note}</div>
              {data.mode === "power" ? (
                <pre className="mt-3 overflow-x-auto rounded-xl border border-line bg-slate-950 p-3 text-xs text-slate-400">
                  {JSON.stringify(data.aiHelper.parsedFilters, null, 2)}
                </pre>
              ) : null}
            </div>
          ) : null}
        </form>
      </Card>

      {data.mode === "power" ? (
        <Card className="p-4">
          <form action="/trends" method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" name="mode" value="power" />
            {data.aiQuery ? <input type="hidden" name="q" value={data.aiQuery} /> : null}
            <select name="sport" defaultValue={data.filters.sport} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
              <option value="ALL">All sports</option>
              <option value="BASKETBALL">Basketball</option>
              <option value="BASEBALL">Baseball</option>
              <option value="HOCKEY">Hockey</option>
              <option value="FOOTBALL">Football</option>
              <option value="MMA">MMA</option>
              <option value="BOXING">Boxing</option>
            </select>
            <select name="league" defaultValue={data.filters.league} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
              <option value="ALL">All leagues</option>
              {BOARD_SPORTS.map((sport) => (
                <option key={sport.leagueKey} value={sport.leagueKey}>
                  {sport.leagueLabel}
                </option>
              ))}
            </select>
            <select name="market" defaultValue={data.filters.market} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
              <option value="ALL">All markets</option>
              <option value="spread">Spread</option>
              <option value="moneyline">Moneyline</option>
              <option value="total">Total</option>
              <option value="player_points">Player Points</option>
              <option value="player_rebounds">Player Rebounds</option>
              <option value="player_assists">Player Assists</option>
              <option value="player_threes">Player Threes</option>
              <option value="fight_winner">Fight Winner</option>
              <option value="method_of_victory">Method of Victory</option>
              <option value="round_total">Round Total</option>
              <option value="round_winner">Round Winner</option>
            </select>
            <select name="sportsbook" defaultValue={data.filters.sportsbook} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
              <option value="all">All books</option>
              <option value="DraftKings">DraftKings</option>
              <option value="FanDuel">FanDuel</option>
              <option value="BetMGM">BetMGM</option>
              <option value="Caesars">Caesars</option>
            </select>
            <select name="side" defaultValue={data.filters.side} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
              <option value="ALL">All sides</option>
              <option value="HOME">Home</option>
              <option value="AWAY">Away</option>
              <option value="OVER">Over</option>
              <option value="UNDER">Under</option>
              <option value="FAVORITE">Favorite</option>
              <option value="UNDERDOG">Underdog</option>
              <option value="COMPETITOR_A">Competitor A</option>
              <option value="COMPETITOR_B">Competitor B</option>
            </select>
            <input name="subject" defaultValue={data.filters.subject} placeholder="Subject" className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            <input name="team" defaultValue={data.filters.team} placeholder="Team" className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            <input name="player" defaultValue={data.filters.player} placeholder="Player" className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            <input name="fighter" defaultValue={data.filters.fighter} placeholder="Fighter" className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            <input name="opponent" defaultValue={data.filters.opponent} placeholder="Opponent" className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            <div className="grid grid-cols-2 gap-3">
              <select name="window" defaultValue={data.filters.window} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
                <option value="30d">30d</option>
                <option value="90d">90d</option>
                <option value="365d">365d</option>
                <option value="all">All history</option>
              </select>
              <input name="sample" type="number" min={1} max={100} defaultValue={data.filters.sample} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white" />
            </div>
            <button type="submit" className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-300">
              Run Power Query
            </button>
          </form>
          <div className="mt-4 flex items-center gap-3">
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Sort cards</label>
            <select
              value={powerSort}
              onChange={(event) => setPowerSort(event.target.value as typeof powerSort)}
              className="rounded-xl border border-line bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="roi">ROI</option>
              <option value="hitRate">Hit Rate</option>
              <option value="sample">Sample</option>
              <option value="alpha">Title</option>
            </select>
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <form action="/trends" method="get" className="grid gap-3 md:grid-cols-4">
            <input type="hidden" name="mode" value="simple" />
            {data.aiQuery ? <input type="hidden" name="q" value={data.aiQuery} /> : null}
            <select name="sport" defaultValue={data.filters.sport} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
              <option value="ALL">All sports</option>
              <option value="BASKETBALL">Basketball</option>
              <option value="BASEBALL">Baseball</option>
              <option value="HOCKEY">Hockey</option>
              <option value="FOOTBALL">Football</option>
              <option value="MMA">MMA</option>
              <option value="BOXING">Boxing</option>
            </select>
            <select name="market" defaultValue={data.filters.market} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
              <option value="ALL">All markets</option>
              <option value="spread">Spread</option>
              <option value="moneyline">Moneyline</option>
              <option value="total">Total</option>
              <option value="player_points">Player Points</option>
              <option value="fight_winner">Fight Winner</option>
            </select>
            <select name="window" defaultValue={data.filters.window} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
              <option value="30d">30d</option>
              <option value="90d">90d</option>
              <option value="365d">365d</option>
              <option value="all">All history</option>
            </select>
            <select name="sample" defaultValue={String(data.filters.sample)} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
              <option value="3">3+</option>
              <option value="5">5+</option>
              <option value="10">10+</option>
              <option value="20">20+</option>
              <option value="50">50+</option>
            </select>
            <button type="submit" className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-200">
              Refine Simple View
            </button>
          </form>
        </Card>
      )}

      {data.explanation ? (
        <Card className="p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-sky-300">Trend Read</div>
          <div className="mt-3 font-display text-2xl font-semibold text-white">{data.explanation.headline}</div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Why it matters</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">{data.explanation.whyItMatters}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Use with caution</div>
              <div className="mt-2 text-sm leading-6 text-amber-100">{data.explanation.caution}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Query logic</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">{data.explanation.queryLogic}</div>
            </div>
          </div>
        </Card>
      ) : null}

      {statusMessage ? (
        <Card className="border-sky-400/25 bg-sky-500/5 p-4 text-sm text-sky-100">
          {statusMessage}
        </Card>
      ) : null}

      {data.sampleNote ? (
        <Card className="border-amber-300/25 bg-amber-400/5 p-4 text-sm leading-7 text-amber-100">
          {data.sampleNote}
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {displayCards.map((card) => (
          <Card key={card.id} className={`p-5 ${toneClass(card.tone)}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{card.title}</div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{card.sampleSize} sample</div>
            </div>
            <div className="mt-3 font-display text-3xl font-semibold text-white">{card.value}</div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
              <span>{card.dateRange}</span>
              {card.hitRate ? <span>Hit {card.hitRate}</span> : null}
              {card.roi ? <span>ROI {card.roi}</span> : null}
            </div>
            <div className="mt-3 text-sm leading-6 text-slate-300">{card.note}</div>
            {data.mode === "simple" ? (
              <div className="mt-3 rounded-2xl border border-line bg-slate-950/50 p-3 text-xs leading-6 text-slate-400">
                <div>{card.whyItMatters}</div>
                <div className="mt-2 text-amber-100">{card.caution}</div>
              </div>
            ) : null}
            {card.href ? (
              <Link href={card.href} className="mt-4 inline-flex text-sm text-sky-300">
                Open context
              </Link>
            ) : null}
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => (
          <StatCard key={metric.label} label={metric.label} value={metric.value} note={metric.note} />
        ))}
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Today's Matching Games</div>
            <div className="mt-2 font-display text-2xl font-semibold text-white">
              {data.todayMatches.length ? `${data.todayMatches.length} active match${data.todayMatches.length === 1 ? "" : "es"}` : "No active matches"}
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              {data.todayMatchesNote ?? "Current matches are coming from the live event catalog and the active trend filters."}
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300">
            Active query: <span className="text-white">{data.querySummary}</span>
          </div>
        </div>
        {data.todayMatches.length ? (
          <div className="mt-5 grid gap-3">
            {data.todayMatches.map((match) => (
              <div key={match.id} className="rounded-2xl border border-line bg-slate-950/70 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      {match.leagueKey} - {match.status}
                    </div>
                    <div className="mt-2 font-semibold text-white">{match.eventLabel}</div>
                    <div className="mt-2 text-sm text-slate-400">
                      {match.matchingLogic}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {new Date(match.startTime).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit"
                      })}
                      {match.stateDetail ? ` - ${match.stateDetail}` : ""}
                    </div>
                    {match.oddsContext ? (
                      <div className="mt-2 text-xs text-slate-400">{match.oddsContext}</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={match.matchupHref} className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
                      Matchup
                    </Link>
                    {match.boardHref ? (
                      <Link href={match.boardHref} className="rounded-xl border border-line px-3 py-2 text-sm text-slate-300">
                        Board
                      </Link>
                    ) : null}
                    {match.propsHref ? (
                      <Link href={match.propsHref} className="rounded-xl border border-line px-3 py-2 text-sm text-slate-300">
                        Props
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Saved Systems</div>
            <div className="mt-2 font-display text-2xl font-semibold text-white">
              Save the angles you want SharkEdge to keep checking
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[240px_auto]">
            <input
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              placeholder="System name"
              className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500"
            />
            <button
              type="button"
              disabled={pending}
              onClick={handleSaveCurrentSystem}
              className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-200 disabled:opacity-50"
            >
              Save Current Query
            </button>
          </div>
        </div>

        {activeSystems.length ? (
          <div className="mt-5 grid gap-3">
            {activeSystems.map((system) => (
              <div key={system.id} className="rounded-2xl border border-line bg-slate-950/70 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      {system.sport} - {system.currentMatchCount} current matches
                    </div>
                    <div className="mt-2 font-semibold text-white">{system.name}</div>
                    <div className="mt-2 text-sm text-slate-400">
                      Last run {formatTimestamp(system.lastRunAt)} - Sample {system.sampleSize ?? "n/a"} - ROI {system.roi ?? "Unavailable"} - Hit {system.hitRate ?? "Unavailable"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={system.href} className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
                      Load
                    </Link>
                    <button type="button" onClick={() => handleUpdateSystem(system.id)} className="rounded-xl border border-line px-3 py-2 text-sm text-slate-300">
                      Overwrite
                    </button>
                    <button type="button" onClick={() => handleArchiveSystem(system.id, true)} className="rounded-xl border border-line px-3 py-2 text-sm text-slate-300">
                      Archive
                    </button>
                    <button type="button" onClick={() => handleDeleteSystem(system.id)} className="rounded-xl border border-rose-400/30 px-3 py-2 text-sm text-rose-200">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-line bg-slate-950/65 p-5 text-sm text-slate-400">
            No saved systems yet. Save a current query to keep checking today's slate against it.
          </div>
        )}

        {archivedSystems.length ? (
          <div className="mt-5 grid gap-3">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Archived systems</div>
            {archivedSystems.map((system) => (
              <div key={system.id} className="rounded-2xl border border-line bg-slate-950/50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="text-sm text-slate-300">
                    {system.name} - archived {formatTimestamp(system.archivedAt)}
                  </div>
                  <button type="button" onClick={() => handleArchiveSystem(system.id, false)} className="rounded-xl border border-line px-3 py-2 text-sm text-slate-300">
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      {data.mode === "power" ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data.insights.map((insight) => (
              <Card key={insight.id} className="p-5">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{insight.title}</div>
                <div className="mt-3 font-display text-3xl font-semibold text-white">{insight.value}</div>
                <div className="mt-2 text-sm leading-6 text-slate-400">{insight.note}</div>
              </Card>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="grid gap-3">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Largest Market Moves</div>
              {data.movementRows.length ? (
                <DataTable
                  compact
                  columns={["Market", "Move", "Context", "Matchup"]}
                  rows={data.movementRows.map((row) => [
                    row.label,
                    row.movement,
                    row.note,
                    row.href ? (
                      <Link href={row.href} className="text-sky-300">
                        Open
                      </Link>
                    ) : (
                      <span className="text-slate-500">No link</span>
                    )
                  ])}
                />
              ) : (
                <Card className="p-5 text-sm text-slate-400">No harvested movement rows match this query yet.</Card>
              )}
            </div>

            <div className="grid gap-3">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">CLV + Segment Read</div>
              {data.segmentRows.length ? (
                <DataTable
                  compact
                  columns={["Segment", "Value", "Context"]}
                  rows={data.segmentRows.map((row) => [row.label, row.movement, row.note])}
                />
              ) : (
                <Card className="p-5 text-sm text-slate-400">
                  Segment tables stay blank until this query has enough settled bets or harvested odds history to say something honest.
                </Card>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
