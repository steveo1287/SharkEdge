import Link from "next/link";
import { notFound } from "next/navigation";

import { MobileTopBar } from "@/components/mobile/mobile-top-bar";
import { SectionTabs } from "@/components/mobile/section-tabs";
import { TrendBreakdownAccordion } from "@/components/trends/trend-breakdown-accordion";
import { TrendHero } from "@/components/trends/trend-hero";
import { getPublishedTrendFeed, type PublishedTrendCard } from "@/lib/trends/publisher";
import type { TrendFilters } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";
import { getDiscoveredTrendSystem } from "@/services/trends/discovered-systems";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: keyof TrendFilters
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function buildFilters(searchParams: Record<string, string | string[] | undefined>) {
  try {
    return trendFiltersSchema.parse({
      sport: readValue(searchParams, "sport"),
      league: readValue(searchParams, "league"),
      market: readValue(searchParams, "market"),
      sportsbook: readValue(searchParams, "sportsbook"),
      side: readValue(searchParams, "side"),
      subject: readValue(searchParams, "subject"),
      team: readValue(searchParams, "team"),
      player: readValue(searchParams, "player"),
      fighter: readValue(searchParams, "fighter"),
      opponent: readValue(searchParams, "opponent"),
      window: readValue(searchParams, "window"),
      sample: readValue(searchParams, "sample")
    });
  } catch {
    return trendFiltersSchema.parse({});
  }
}

function formatPercent(value: number | null | undefined) {
  return typeof value === "number" ? `${value.toFixed(2)}%` : "--";
}

function formatUnits(value: number | null | undefined) {
  return typeof value === "number"
    ? `${value > 0 ? "+" : ""}${value.toFixed(1)}u`
    : "--";
}

function formatRecord(
  wins: number | null | undefined,
  losses: number | null | undefined,
  pushes: number | null | undefined
) {
  if (typeof wins !== "number" || typeof losses !== "number") {
    return "--";
  }

  return `${wins}-${losses}-${typeof pushes === "number" ? pushes : 0}`;
}

function normalizeBreakdownRows(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }

          const row = entry as Record<string, unknown>;

          return {
            label: String(
              row.label ?? row.team ?? row.opponent ?? row.season ?? row.line ?? "Item"
            ),
            value:
              typeof row.profit === "number"
                ? row.profit
                : typeof row.units === "number"
                  ? row.units
                  : null,
            record: typeof row.record === "string" ? row.record : null,
            note: typeof row.note === "string" ? row.note : null
          };
        })
        .filter(
          (
            entry
          ): entry is {
            label: string;
            value: number | null;
            record: string | null;
            note: string | null;
          } => entry !== null
        )
    : [];
}

function buildSyntheticChart(card: PublishedTrendCard) {
  const base =
    typeof card.profitUnits === "number" ? card.profitUnits : card.sampleSize / 6;

  return Array.from({ length: 8 }, (_, index) =>
    Number(((base / 8) * (index + 1) + index * 0.4).toFixed(2))
  );
}

function MiniBars({
  items
}: {
  items: Array<{
    label: string;
    value: number | null;
    record?: string | null;
    note?: string | null;
  }>;
}) {
  const max = Math.max(...items.map((item) => Math.abs(item.value ?? 0)), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-300">{item.label}</span>
            <span className="font-semibold text-[#2dd36f]">
              {item.value === null
                ? "--"
                : `${item.value > 0 ? "+" : ""}${item.value.toFixed(1)}u`}
            </span>
          </div>
          <div className="h-10 overflow-hidden rounded-[14px] bg-white/[0.04]">
            <div
              className="flex h-full items-center bg-[#2dd36f] px-3 text-xs font-semibold text-[#04140a]"
              style={{
                width: `${Math.max(
                  14,
                  Math.round((Math.abs(item.value ?? 0) / max) * 100)
                )}%`
              }}
            >
              {item.record ?? item.note ?? ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function buildBackHref(filters: TrendFilters) {
  const params = new URLSearchParams();

  if (filters.sport !== "ALL") params.set("sport", filters.sport);
  if (filters.league !== "ALL") params.set("league", filters.league);
  if (filters.market !== "ALL") params.set("market", filters.market);
  if (filters.sportsbook !== "all") params.set("sportsbook", filters.sportsbook);
  if (filters.side !== "ALL") params.set("side", filters.side);
  if (filters.subject) params.set("subject", filters.subject);
  if (filters.team) params.set("team", filters.team);
  if (filters.player) params.set("player", filters.player);
  if (filters.fighter) params.set("fighter", filters.fighter);
  if (filters.opponent) params.set("opponent", filters.opponent);
  if (filters.window) params.set("window", filters.window);
  if (filters.sample) params.set("sample", String(filters.sample));

  const query = params.toString();
  return query ? `/trends?${query}` : "/trends";
}

async function getSafePublishedTrend(filters: TrendFilters, id: string) {
  try {
    const feed = await getPublishedTrendFeed(filters);

    return (
      feed.sections
        .flatMap((section) => section.cards)
        .find((entry) => entry.sourceTrend.id === id || entry.id === id) ?? null
    );
  } catch {
    return null;
  }
}

async function getSafeDiscoveredTrend(id: string) {
  try {
    return await getDiscoveredTrendSystem(id);
  } catch {
    return null;
  }
}

export default async function TrendDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const resolved = (await searchParams) ?? {};
  const filters = buildFilters(resolved);
  const backHref = buildBackHref(filters);

  const discovered = await getSafeDiscoveredTrend(id);
  let published: PublishedTrendCard | null = null;

  if (!discovered) {
    published = await getSafePublishedTrend(filters, id);
  }

  if (!discovered && !published) {
    notFound();
  }

  const title = discovered?.name ?? published?.title ?? "Trend";
  const eyebrow = discovered
    ? `${discovered.league} · ${discovered.marketType.replace(/_/g, " ")}`
    : `${published!.leagueLabel} · ${published!.marketLabel}`;

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        discovered?.validationScore ?? discovered?.score ?? published?.rankingScore ?? 70
      )
    )
  );

  const chartValues = discovered
    ? discovered.snapshots
        .slice()
        .reverse()
        .map((snapshot: any, index: number) =>
          typeof snapshot.totalProfit === "number" ? snapshot.totalProfit : index + 1
        )
    : buildSyntheticChart(published!);

  const metrics = discovered
    ? [
        {
          label: "Record",
          value: formatRecord(discovered.wins, discovered.losses, discovered.pushes)
        },
        { label: "ROI", value: formatPercent(discovered.roi) },
        { label: "Win rate", value: formatPercent(discovered.hitRate) },
        { label: "Units", value: formatUnits(discovered.totalProfit) }
      ]
    : [
        { label: "Record", value: published!.record },
        { label: "ROI", value: formatPercent(published!.roi) },
        { label: "Win rate", value: formatPercent(published!.hitRate) },
        { label: "Units", value: formatUnits(published!.profitUnits) }
      ];

  const seasonRows = normalizeBreakdownRows(discovered?.seasonsJson).slice(0, 8);
  const teamRows = normalizeBreakdownRows(discovered?.teamBreakdownJson).slice(0, 8);
  const opponentRows = normalizeBreakdownRows(discovered?.opponentBreakdownJson).slice(0, 8);
  const lineRows = normalizeBreakdownRows(discovered?.lineDistributionJson).slice(0, 8);

  const accordionSections = discovered
    ? [
        {
          id: "breakdown",
          title: "Breakdown",
          defaultOpen: true,
          content: (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-slate-500">Conditions</div>
                <div className="mt-2 space-y-2">
                  {Array.isArray(discovered.conditionsJson) &&
                  discovered.conditionsJson.length ? (
                    discovered.conditionsJson.slice(0, 6).map((condition: any, index: number) => (
                      <div
                        key={`${index}-${String(condition)}`}
                        className="rounded-[14px] bg-white/[0.03] px-3 py-2 text-sm text-slate-300"
                      >
                        {typeof condition === "string"
                          ? condition
                          : JSON.stringify(condition)}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[14px] bg-white/[0.03] px-3 py-2 text-sm text-slate-400">
                      No stored conditions were found for this system.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-slate-500">Warnings</div>
                <div className="mt-2 space-y-2">
                  {Array.isArray(discovered.warningsJson) &&
                  discovered.warningsJson.length ? (
                    discovered.warningsJson.slice(0, 6).map((warning: any, index: number) => (
                      <div
                        key={`${index}-${String(warning)}`}
                        className="rounded-[14px] bg-white/[0.03] px-3 py-2 text-sm text-slate-300"
                      >
                        {String(warning)}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[14px] bg-white/[0.03] px-3 py-2 text-sm text-slate-400">
                      No major warning flags were persisted for this system.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        },
        {
          id: "summary",
          title: "Game summary",
          content: (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-slate-500">Avg CLV</div>
                <div className="mt-1 text-white">{formatPercent(discovered.avgClv)}</div>
              </div>
              <div>
                <div className="text-slate-500">Beat close</div>
                <div className="mt-1 text-white">
                  {formatPercent(discovered.beatCloseRate)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Recent sample</div>
                <div className="mt-1 text-white">
                  {discovered.recentSampleSize ?? "--"}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Active matches</div>
                <div className="mt-1 text-white">
                  {discovered.activations.filter((item: any) => item.isActive).length}
                </div>
              </div>
            </div>
          )
        },
        {
          id: "distribution",
          title: "Line distribution",
          content: lineRows.length ? (
            <MiniBars items={lineRows} />
          ) : (
            <div className="text-slate-400">
              No line distribution was persisted for this system yet.
            </div>
          )
        },
        {
          id: "seasons",
          title: "Profit by season",
          content: seasonRows.length ? (
            <MiniBars items={seasonRows} />
          ) : (
            <div className="text-slate-400">Season splits are not available yet.</div>
          )
        },
        {
          id: "teams",
          title: "Profit by team",
          content: teamRows.length ? (
            <MiniBars items={teamRows} />
          ) : (
            <div className="text-slate-400">Team splits are not available yet.</div>
          )
        },
        {
          id: "opponents",
          title: "Profit by opponent",
          content: opponentRows.length ? (
            <MiniBars items={opponentRows} />
          ) : (
            <div className="text-slate-400">Opponent splits are not available yet.</div>
          )
        }
      ]
    : [
        {
          id: "breakdown",
          title: "Breakdown",
          defaultOpen: true,
          content: (
            <div className="space-y-3">
              {published!.whyNow.length ? (
                published!.whyNow.map((reason) => (
                  <div
                    key={reason}
                    className="rounded-[14px] bg-white/[0.03] px-3 py-2 text-sm text-slate-300"
                  >
                    {reason}
                  </div>
                ))
              ) : (
                <div className="text-slate-400">No breakdown reasons were attached.</div>
              )}
            </div>
          )
        },
        {
          id: "summary",
          title: "Game summary",
          content: <div className="text-sm leading-7 text-slate-300">{published!.description}</div>
        },
        {
          id: "distribution",
          title: "Line distribution",
          content: (
            <div className="text-sm leading-7 text-slate-400">
              Published trend cards do not persist full line-distribution histograms yet.
            </div>
          )
        },
        {
          id: "seasons",
          title: "Profit by season",
          content: (
            <div className="text-sm leading-7 text-slate-400">
              Season-level breakdowns are only available on discovered trend systems right now.
            </div>
          )
        },
        {
          id: "teams",
          title: "Profit by team",
          content: (
            <div className="text-sm leading-7 text-slate-400">
              Team breakdowns are not persisted for this published trend card yet.
            </div>
          )
        },
        {
          id: "opponents",
          title: "Profit by opponent",
          content: (
            <div className="text-sm leading-7 text-slate-400">
              Opponent breakdowns are not persisted for this published trend card yet.
            </div>
          )
        }
      ];

  const activationMatches = discovered?.activations.slice(0, 8) ?? published?.todayMatches ?? [];

  return (
    <div className="grid gap-4">
      <MobileTopBar title="Explore" leftHref={backHref} />

      <section className="mobile-surface !pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-slate-400">{eyebrow}</div>
          <div className="flex items-center gap-2">
            <button type="button" className="mobile-icon-button" aria-label="Favorite">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                <path
                  d="M12 20l-6.5-6.2a4.5 4.5 0 016.4-6.3l.1.1.1-.1a4.5 4.5 0 016.4 6.3L12 20z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button type="button" className="mobile-icon-button" aria-label="Share">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                <path
                  d="M12 5v10M8 9l4-4 4 4M5 15v2a2 2 0 002 2h10a2 2 0 002-2v-2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="mt-3">
          <SectionTabs items={[{ label: "Stats", active: true }, { label: "History" }]} />
        </div>
      </section>

      <TrendHero
        eyebrow={eyebrow}
        title={title}
        metrics={metrics}
        score={score}
        chartValues={chartValues}
        note={
          discovered
            ? `${discovered.sampleSize} historical rows with ${
                discovered.activations.filter((item: any) => item.isActive).length
              } currently active matches.`
            : published?.warning ?? published?.railReason ?? "Published historical support only."
        }
      />

      <section className="mobile-surface">
        <div className="text-sm leading-6 text-slate-300">
          {discovered
            ? `Validation score ${score}. Beat close ${formatPercent(
                discovered.beatCloseRate
              )}. Average CLV ${formatPercent(discovered.avgClv)}.`
            : published?.description}
        </div>
      </section>

      {activationMatches.length ? (
        <section className="mobile-surface">
          <div className="mb-3 text-[1.1rem] font-semibold text-white">Active games</div>
          <div className="grid gap-3">
            {activationMatches.map((match: any, index: number) => (
              <Link
                key={match.id ?? match.eventId ?? `${index}`}
                href={match.href ?? (match.event?.id ? `/game/${match.event.id}` : "/games")}
                className="rounded-[18px] bg-white/[0.03] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[1rem] font-semibold text-white">
                      {match.eventLabel ??
                        match.matchup ??
                        match.event?.name ??
                        "Upcoming game"}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {match.eventStartTime
                        ? new Date(match.eventStartTime).toLocaleString("en-US", {
                            month: "numeric",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit"
                          })
                        : match.startTime ?? "Scheduled"}
                    </div>
                  </div>
                  <div className="text-right text-sm text-[#2dd36f]">
                    {typeof match.edgePct === "number"
                      ? `${match.edgePct.toFixed(1)}% edge`
                      : match.tag ?? "Live"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <TrendBreakdownAccordion sections={accordionSections} />

      <section className="mobile-surface text-sm leading-6 text-slate-500">
        The information available here is believed, but not guaranteed, to be accurate.
        This product is for research and is not intended to violate state, local, or
        federal laws.
      </section>
    </div>
  );
}