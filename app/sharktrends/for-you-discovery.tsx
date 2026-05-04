type DiscoveryItem = Record<string, any>;

type DiscoverySection = {
  id: string;
  title: string;
  description: string;
  items: DiscoveryItem[];
  empty: string;
};

function unit(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return `${value > 0 ? "+" : ""}${value}u`;
}

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return `${value}%`;
}

function price(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "price needed";
  return value > 0 ? `+${value}` : String(value);
}

function score(item: DiscoveryItem) {
  return Number(item.strength?.score ?? item.sharkScore ?? item.score ?? 0);
}

function proof(item: DiscoveryItem) {
  return item.proof ?? {};
}

function isActive(item: DiscoveryItem) {
  return Number(item.activeMatches ?? 0) > 0 || String(item.actionability ?? item.actionLabel ?? item.primaryAction ?? "").toUpperCase().includes("ACTIVE") || Boolean(item.eventLabel);
}

function hasPrice(item: DiscoveryItem) {
  return typeof item.price === "number" && Number.isFinite(item.price);
}

function isUndefeated(item: DiscoveryItem) {
  const packet = proof(item);
  const wins = Number(packet.wins ?? 0);
  const losses = Number(packet.losses ?? 0);
  const sample = Number(packet.sampleSize ?? wins);
  return wins > 0 && losses === 0 && sample > 0;
}

function textBlob(item: DiscoveryItem) {
  return `${item.name ?? ""} ${item.category ?? ""} ${item.market ?? ""} ${item.reason ?? ""} ${(item.reasons ?? []).join(" ")}`.toUpperCase();
}

function isMarketMoved(item: DiscoveryItem) {
  return /MARKET|MOVE|MOVED|STEAM|LINE|CLV|PRICE/.test(textBlob(item));
}

function isHotTeam(item: DiscoveryItem) {
  const packet = proof(item);
  return /TEAM|STREAK|HOT|FORM|SITUATION/.test(textBlob(item)) || Number(packet.last30WinRatePct ?? 0) >= 58 || String(packet.currentStreak ?? "").toUpperCase().startsWith("W");
}

function systemHref(item: DiscoveryItem) {
  const systemId = item.systemId ?? item.id;
  const gameId = item.gameId;
  const query = gameId ? `?gameId=${encodeURIComponent(gameId)}` : "";
  return `/sharktrends/system/${encodeURIComponent(systemId)}${query}`;
}

function dedupe(items: DiscoveryItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.systemId ?? item.id}:${item.gameId ?? "system"}:${item.title ?? item.name ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function top(items: DiscoveryItem[], limit = 5) {
  return dedupe(items).slice(0, limit);
}

function DiscoveryCard({ item }: { item: DiscoveryItem }) {
  const packet = proof(item);
  const strength = item.strength;
  const title = item.eventLabel ? `${item.eventLabel} · ${item.name}` : item.name;
  const href = systemHref(item);
  return (
    <a href={href} className="rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:border-cyan-300/30">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="line-clamp-2 text-sm font-semibold leading-5 text-white">{title}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">{item.league ?? packet.filters?.league ?? "ALL"} · {item.market ?? packet.filters?.market ?? "market"} · {item.category ?? item.side ?? "system"}</div>
        </div>
        <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-cyan-100">
          {strength ? `${strength.grade} ${strength.score}` : `Score ${score(item)}`}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400 sm:grid-cols-4">
        <span>{packet.record ?? "record TBD"}</span>
        <span>{unit(packet.profitUnits)}</span>
        <span>{pct(packet.roiPct)} ROI</span>
        <span>{hasPrice(item) ? price(item.price) : `${Number(item.activeMatches ?? 0)} active`}</span>
      </div>
      <div className="mt-3 text-xs leading-5 text-slate-400">{strength?.reasons?.[0] ?? item.reason ?? item.reasons?.[0] ?? "Curated from current SharkTrends proof and matchup context."}</div>
      {strength?.penalties?.length ? <div className="mt-2 text-[11px] leading-5 text-amber-100/80">Watch: {strength.penalties.slice(0, 2).join(" · ")}</div> : null}
    </a>
  );
}

function DiscoveryRail({ section }: { section: DiscoverySection }) {
  return (
    <section className="rounded-[1.25rem] border border-white/10 bg-slate-950/55 p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">{section.title}</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">{section.description}</div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-300">{section.items.length}</span>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {section.items.length ? section.items.map((item) => <DiscoveryCard key={`${section.id}:${item.systemId ?? item.id}:${item.gameId ?? "system"}`} item={item} />) : <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-500">{section.empty}</div>}
      </div>
    </section>
  );
}

export function ForYouTrendDiscovery({ rows, matchups }: { rows: DiscoveryItem[]; matchups: DiscoveryItem[] }) {
  const matchupTrends = matchups.flatMap((matchup) => (matchup.trends ?? []).map((trend: DiscoveryItem) => ({
    ...trend,
    eventLabel: matchup.eventLabel,
    startTime: matchup.startTime,
    status: matchup.status,
    league: matchup.league,
    matchupHref: matchup.href
  })));

  const currentFits = top([...matchupTrends].sort((left, right) => score(right) - score(left)), 6);
  const mostProfitableActive = top(rows.filter(isActive).sort((left, right) => Number(proof(right).profitUnits ?? 0) - Number(proof(left).profitUnits ?? 0)), 6);
  const undefeatedActive = top(rows.filter((item) => isActive(item) && isUndefeated(item)).sort((left, right) => Number(proof(right).sampleSize ?? 0) - Number(proof(left).sampleSize ?? 0)), 6);
  const hotTeamFits = top([...matchupTrends, ...rows.filter(isActive)].filter(isHotTeam).sort((left, right) => score(right) - score(left)), 6);
  const marketMoved = top([...matchupTrends, ...rows.filter(isActive)].filter(isMarketMoved).sort((left, right) => score(right) - score(left)), 6);
  const needsPrice = top(matchupTrends.filter((item) => !hasPrice(item) || (item.blockers ?? []).some((blocker: string) => /price/i.test(blocker))).sort((left, right) => score(right) - score(left)), 6);
  const verifiedIdle = top(rows.filter((item) => item.verified && !isActive(item)).sort((left, right) => score(right) - score(left)), 6);

  const sections: DiscoverySection[] = [
    { id: "best-current-fits", title: "Best Current Fits", description: "Highest-strength attached matchup signals from the current board.", items: currentFits, empty: "No current matchup signals match the current filters." },
    { id: "most-profitable-active", title: "Most Profitable Active", description: "Active systems ranked by stored profit units, then strength.", items: mostProfitableActive, empty: "No profitable active systems are available under the current filters." },
    { id: "undefeated-active", title: "Undefeated Active", description: "Active systems with wins and no recorded losses in the proof packet.", items: undefeatedActive, empty: "No undefeated active systems were found." },
    { id: "hot-team-fits", title: "Hot Team Fits", description: "Team/form/streak-style systems that are attached to current board context.", items: hotTeamFits, empty: "No hot-team fit candidates were found." },
    { id: "market-moved", title: "Market-Moved Systems", description: "Systems with market, line, price, movement, steam, or CLV context.", items: marketMoved, empty: "No market-movement systems matched this view." },
    { id: "needs-price", title: "Needs Price", description: "Current matchup fits that are interesting but missing a usable current price.", items: needsPrice, empty: "No current fits are waiting on price." },
    { id: "verified-idle", title: "Verified Idle", description: "Verified systems with proof, but no current attached matchup.", items: verifiedIdle, empty: "No verified idle systems under the current filters." }
  ];

  return (
    <details id="for-you" className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.035] p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">For You Trend Discovery</div>
            <div className="mt-1 text-xs leading-5 text-slate-400">Curated sections stay below matchup lanes so discovery adds depth without bringing back doom scrolling.</div>
          </div>
          <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-cyan-100">7 sections</span>
        </div>
      </summary>
      <div className="mt-4 grid gap-4">
        {sections.map((section) => <DiscoveryRail key={section.id} section={section} />)}
      </div>
    </details>
  );
}
