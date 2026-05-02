import { buildTrendsCenterSnapshot } from "@/services/trends/trends-center";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TileTone = "good" | "warn" | "bad" | "neutral";

function toneClass(tone: TileTone) {
  if (tone === "good") return "border-emerald-400/20 bg-emerald-400/7";
  if (tone === "warn") return "border-amber-300/25 bg-amber-300/7";
  if (tone === "bad") return "border-red-400/20 bg-red-400/7";
  return "border-white/10 bg-slate-950/60";
}

function Tile({ label, value, note, tone = "neutral" }: { label: string; value: string | number; note: string; tone?: TileTone }) {
  return (
    <div className={`rounded-2xl border p-4 ${toneClass(tone)}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function tierClass(tier: string) {
  if (tier === "promote") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (tier === "watch") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (tier === "verified-idle") return "border-cyan-400/25 bg-cyan-400/10 text-cyan-200";
  return "border-slate-500/25 bg-slate-800/60 text-slate-300";
}

function actionClass(actionability: string | null | undefined) {
  const value = String(actionability ?? "").toUpperCase();
  if (value.includes("ACTIVE")) return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (value.includes("WATCH")) return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  return "border-slate-500/25 bg-slate-800/60 text-slate-300";
}

function laneClass(tier: string) {
  if (tier === "promote") return "border-emerald-400/20 bg-emerald-400/[0.05]";
  if (tier === "watch") return "border-sky-400/20 bg-sky-400/[0.05]";
  if (tier === "verified-idle") return "border-cyan-400/20 bg-cyan-400/[0.05]";
  return "border-white/10 bg-slate-950/50";
}

function distributionText(record: Record<string, number> | undefined, limit = 6) {
  const entries = Object.entries(record ?? {}).sort((left, right) => right[1] - left[1]).slice(0, limit);
  return entries.length ? entries.map(([key, value]) => `${key} ${value}`).join(" · ") : "none";
}

function formatTime(value: string | null | undefined) {
  if (!value) return "time TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function priceLabel(price: number | null | undefined) {
  if (typeof price !== "number" || !Number.isFinite(price)) return "price needed";
  return price > 0 ? `+${price}` : String(price);
}

function LaneCard({ item }: { item: any }) {
  return (
    <a href={item.href} className="block rounded-xl border border-white/10 bg-black/25 p-3 hover:border-cyan-300/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 truncate text-sm font-semibold text-white">#{item.rank} {item.name}</div>
        <div className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${tierClass(item.tier)}`}>{item.score}</div>
      </div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{item.reason}</div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] uppercase tracking-[0.12em] text-slate-500">
        <span>{item.primaryAction}</span>
        {item.blockers?.length ? item.blockers.map((blocker: string) => <span key={blocker}>· {blocker}</span>) : <span>· clear</span>}
      </div>
    </a>
  );
}

function PlacementLane({ title, description, tier, items }: { title: string; description: string; tier: string; items: any[] }) {
  const hidden = Math.max(0, items.length - 4);
  return (
    <div className={`rounded-[1.25rem] border p-4 ${laneClass(tier)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">{description}</div>
        </div>
        <div className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${tierClass(tier)}`}>{items.length}</div>
      </div>
      <div className="mt-3 grid gap-2">
        {items.length ? items.slice(0, 4).map((item) => <LaneCard key={item.id} item={item} />) : <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-500">No systems in this lane.</div>}
      </div>
      {hidden ? <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-slate-500">+{hidden} more in full inventory JSON</div> : null}
    </div>
  );
}

function MatchupTrendTile({ trend }: { trend: any }) {
  return (
    <a href={trend.href} className="rounded-xl border border-white/10 bg-black/25 p-3 hover:border-cyan-300/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 truncate text-sm font-semibold text-white">{trend.name}</div>
        <div className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${actionClass(trend.actionability)}`}>{trend.actionability}</div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400 sm:grid-cols-4">
        <span>{trend.market}</span>
        <span>{trend.side}</span>
        <span>{priceLabel(trend.price)}</span>
        <span>{trend.edgePct == null ? "edge TBD" : `${trend.edgePct}% edge`}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] uppercase tracking-[0.12em] text-slate-500">
        <span>{trend.verified ? "verified" : "provisional"}</span>
        <span>score {trend.score}</span>
        <span>{trend.primaryAction}</span>
      </div>
    </a>
  );
}

function MatchupTile({ matchup }: { matchup: any }) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <a href={matchup.href} className="text-base font-semibold text-white hover:text-cyan-100">{matchup.eventLabel}</a>
          <div className="mt-1 text-xs leading-5 text-slate-500">{formatTime(matchup.startTime)} · {matchup.status}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200">{matchup.trendCount} trends</span>
          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{matchup.activeTrends} active</span>
          <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200">{matchup.verifiedTrends} verified</span>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {matchup.trends?.length ? matchup.trends.map((trend: any) => <MatchupTrendTile key={trend.id} trend={trend} />) : <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-500">No visible trends for this matchup.</div>}
      </div>
      {matchup.hiddenTrendCount ? <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-slate-500">+{matchup.hiddenTrendCount} more trends in matchup detail</div> : null}
    </div>
  );
}

function LeagueMatchupSection({ group }: { group: any }) {
  return (
    <section className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.035] p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{group.league}</div>
          <h2 className="mt-1 text-xl font-semibold text-white">{group.matchupCount} matchup{group.matchupCount === 1 ? "" : "s"}</h2>
          <div className="mt-1 text-xs leading-5 text-slate-400">{group.trendCount} trend links · {group.activeTrendCount} active · {group.verifiedTrendCount} verified</div>
        </div>
        <a href={`/trends?league=${encodeURIComponent(group.league)}&mode=power`} className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200 hover:text-cyan-100">League trends</a>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {group.matchups?.map((matchup: any) => <MatchupTile key={matchup.id} matchup={matchup} />)}
      </div>
    </section>
  );
}

export default async function SharkTrendsPage() {
  const snapshot = await buildTrendsCenterSnapshot();
  const board = snapshot.promotionBoard ?? [];
  const lanes = snapshot.placementLanes ?? { promote: [], watch: [], "verified-idle": [], bench: [] };
  const queue = snapshot.commandQueue ?? [];
  const activeSystems = snapshot.activeSystems ?? [];
  const matchupGroups = snapshot.matchupsByLeague ?? [];
  const counts = snapshot.counts;
  const coverage = snapshot.coverage;
  const boardLimit = snapshot.thresholds?.promotionBoardLimit ?? board.length;
  const hiddenBoardRows = Math.max(0, (counts.allPromotionRows ?? board.length) - board.length);

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">SharkTrends</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Matchup trend board</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              The global top {boardLimit} remains as the promotion rail, but the main browse path is now league → matchup tiles → trend links. Open a trend for explicit proof, blockers, and price details.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <a href="/trends" className="text-cyan-200 hover:text-cyan-100">Trends</a>
            <a href="/api/trends/sharktrends" className="text-cyan-200 hover:text-cyan-100">JSON</a>
            <a href="/api/trends/systems/cycle?inactive=true&limit=500" className="text-cyan-200 hover:text-cyan-100">Run cycle</a>
            <a href="/api/trends/historical-audit" className="text-cyan-200 hover:text-cyan-100">Historical audit</a>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Tile label="Matchups" value={counts.matchupTiles ?? 0} tone={counts.matchupTiles ? "good" : "warn"} note={`${counts.leagueMatchupGroups ?? 0} league groups · ${counts.matchupTrendLinks ?? 0} attached trend links.`} />
        <Tile label="Inventory" value={`${counts.allPromotionRows ?? counts.publishedTotal}`} tone={counts.publishedTotal ? "good" : "warn"} note={`Full published-system inventory. Top ${counts.visiblePromotionRows ?? board.length} shown on board.`} />
        <Tile label="Active published" value={`${counts.publishedActive}/${counts.publishedTotal}`} tone={counts.publishedActive ? "good" : "warn"} note={`${counts.activeMatches} active matches · ${coverage.publishedActivePct}% active coverage.`} />
        <Tile label="Promotion ready" value={`${counts.promotableSystems}/${counts.publishedTotal}`} tone={counts.promotableSystems ? "good" : counts.watchSystems ? "warn" : "neutral"} note={`${counts.watchSystems} watchlist · ${counts.benchSystems} bench · ${coverage.promotablePct}% promotable.`} />
        <Tile label="Blocked systems" value={counts.blockedSystems ?? 0} tone={counts.blockedSystems ? "warn" : "good"} note={`${coverage.blockedPct ?? 0}% blocked by proof, activity, or action-gate issues.`} />
        <Tile label="Saved rows" value={`${counts.savedActive}/${counts.savedTotal}`} tone={counts.stale || counts.neverRun ? "warn" : counts.savedActive ? "good" : "neutral"} note={`${counts.stale} stale · ${counts.neverRun} never-run · ${coverage.runCoveragePct}% recent run coverage.`} />
      </section>

      {matchupGroups.length ? (
        <section className="grid gap-4">
          {matchupGroups.map((group: any) => <LeagueMatchupSection key={group.league} group={group} />)}
        </section>
      ) : (
        <section className="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/7 p-4 text-sm text-amber-100">
          No active matchup trend tiles yet. Run the sim/market refresh and trend cycle so published systems can attach to current games.
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-4">
        <PlacementLane title="Promote" tier="promote" description="Verified systems with live qualifiers. These deserve the top rail." items={lanes.promote ?? []} />
        <PlacementLane title="Watch" tier="watch" description="Live qualifiers without enough proof. Keep visible but not premium." items={lanes.watch ?? []} />
        <PlacementLane title="Verified idle" tier="verified-idle" description="Verified but no current qualifier. Keep ready for the next slate." items={lanes["verified-idle"] ?? []} />
        <PlacementLane title="Bench" tier="bench" description="No live qualifier and/or proof/action blockers. Do not promote." items={lanes.bench ?? []} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Global top 12</div>
              <h2 className="mt-1 text-xl font-semibold text-white">Top {board.length} of {counts.allPromotionRows ?? board.length} systems</h2>
              <div className="mt-1 text-xs leading-5 text-slate-500">Display limit {boardLimit}. Matchup tiles above are the main browse layer.</div>
            </div>
            <a href="/api/trends/sharktrends" className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200 hover:text-cyan-100">Inspect JSON</a>
          </div>

          <div className="mt-4 grid gap-3">
            {board.length ? board.map((item) => (
              <a key={item.id} href={item.href} className="rounded-2xl border border-white/10 bg-black/25 p-4 hover:border-cyan-300/30">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">#{item.rank} {item.name}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-400">{item.reason}</div>
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${tierClass(item.tier)}`}>
                    {item.tier} · {item.score}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  <span>{item.league}</span>
                  <span>{item.market}</span>
                  <span>{item.category}</span>
                  <span>{item.activeMatches} live</span>
                  <span>{item.verified ? "verified" : "provisional"}</span>
                  <span>{item.primaryAction}</span>
                  {item.blockers?.map((blocker: string) => <span key={blocker}>{blocker}</span>)}
                </div>
              </a>
            )) : (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/7 p-4 text-sm text-amber-100">
                No promotion board rows yet. Run the trend cycle and verify published system inventory.
              </div>
            )}
            {hiddenBoardRows ? <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] p-3 text-xs leading-5 text-cyan-100/80">{hiddenBoardRows} lower-ranked systems are omitted from the display board but still counted in lanes, blockers, and distributions. Inspect JSON for full inventory.</div> : null}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Command queue</div>
            <div className="mt-3 grid gap-2">
              {queue.length ? queue.map((item) => (
                <a key={`${item.reason}-${item.id}`} href={item.href} className="rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 hover:border-amber-200/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-white">{item.name}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200">{item.reason}</div>
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-400">{item.note}</div>
                </a>
              )) : (
                <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3 text-xs leading-5 text-emerald-100/80">
                  No command blockers. Use matchup tiles, proof grade, ROI, and live signal quality for placement.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Distribution</div>
            <div className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
              <div><span className="font-semibold uppercase tracking-[0.14em] text-slate-300">Matchups</span><span className="ml-2">{distributionText(snapshot.distribution.byMatchupLeague)}</span></div>
              <div><span className="font-semibold uppercase tracking-[0.14em] text-slate-300">Blockers</span><span className="ml-2">{distributionText(snapshot.distribution.byBlocker)}</span></div>
              <div><span className="font-semibold uppercase tracking-[0.14em] text-slate-300">Actions</span><span className="ml-2">{distributionText(snapshot.distribution.byPrimaryAction)}</span></div>
              <div><span className="font-semibold uppercase tracking-[0.14em] text-slate-300">Tiers</span><span className="ml-2">{distributionText(snapshot.distribution.byPromotionTier)}</span></div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Active systems</div>
            <div className="mt-3 grid gap-2">
              {activeSystems.length ? activeSystems.map((item) => (
                <a key={item.id} href={item.href} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs hover:border-cyan-300/25">
                  <span className="min-w-0 truncate text-slate-200">{item.name}</span>
                  <span className="shrink-0 text-slate-500">{item.league} · {item.market} · {item.activeMatches} live</span>
                </a>
              )) : <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-500">No active published systems right now.</div>}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-xs leading-5 text-slate-400">
        <span className="font-semibold uppercase tracking-[0.16em] text-cyan-300">Next action:</span> {snapshot.nextAction}
      </section>
    </main>
  );
}
