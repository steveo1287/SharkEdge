import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = {
  league?: string | string[];
  prop?: string | string[];
  player?: string | string[];
  line?: string | string[];
};

type PageProps = {
  searchParams?: Promise<SearchParams>;
};

type PlayerSimRow = {
  id: string;
  player: string;
  team: string;
  opponent: string;
  league: string;
  prop: string;
  line: number;
  mean: number;
  median: number;
  overPct: number;
  underPct: number;
  bookOdds: string;
  fairOdds: string;
  edgePct: number;
  confidence: number;
  sample: number;
  decision: "ATTACK" | "WATCH" | "PASS";
  drivers: string[];
  buckets: number[];
};

const LEAGUES = ["ALL", "MLB", "NBA", "NHL", "NFL", "NCAAF", "UFC", "BOXING"] as const;
const PROP_TYPES = [
  "Points",
  "Rebounds",
  "Assists",
  "Threes",
  "Hits",
  "Total Bases",
  "Strikeouts",
  "Shots",
  "Saves"
] as const;

const PLAYER_SIM_ROWS: PlayerSimRow[] = [
  {
    id: "demo-nba-1",
    player: "Primary Scorer",
    team: "LAL",
    opponent: "DEN",
    league: "NBA",
    prop: "Points",
    line: 27.5,
    mean: 30.1,
    median: 30,
    overPct: 0.617,
    underPct: 0.383,
    bookOdds: "-110",
    fairOdds: "-161",
    edgePct: 8.9,
    confidence: 0.78,
    sample: 12400,
    decision: "ATTACK",
    drivers: ["Usage spike vs small frontcourt", "Pace-adjusted volume up", "Market line below sim mean"],
    buckets: [4, 7, 12, 18, 24, 19, 10, 5, 1]
  },
  {
    id: "demo-mlb-1",
    player: "Power Bat",
    team: "CHC",
    opponent: "STL",
    league: "MLB",
    prop: "Total Bases",
    line: 1.5,
    mean: 1.82,
    median: 2,
    overPct: 0.552,
    underPct: 0.448,
    bookOdds: "+115",
    fairOdds: "-123",
    edgePct: 6.7,
    confidence: 0.71,
    sample: 9100,
    decision: "WATCH",
    drivers: ["Pitcher split supports hard contact", "Wind factor slightly positive", "Price is playable only above +110"],
    buckets: [18, 22, 21, 16, 11, 7, 3, 1, 1]
  },
  {
    id: "demo-nhl-1",
    player: "Shot Volume Wing",
    team: "CHI",
    opponent: "NSH",
    league: "NHL",
    prop: "Shots",
    line: 3.5,
    mean: 3.42,
    median: 3,
    overPct: 0.486,
    underPct: 0.514,
    bookOdds: "-105",
    fairOdds: "+106",
    edgePct: -2.9,
    confidence: 0.62,
    sample: 6800,
    decision: "PASS",
    drivers: ["Line already shaded up", "Opponent suppresses wing attempts", "No plus-price cushion"],
    buckets: [7, 12, 20, 25, 18, 10, 5, 2, 1]
  }
];

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeLeague(value: string | string[] | undefined) {
  const raw = String(scalar(value) ?? "ALL").toUpperCase();
  return LEAGUES.includes(raw as (typeof LEAGUES)[number]) ? raw : "ALL";
}

function normalizeProp(value: string | string[] | undefined) {
  const raw = scalar(value);
  if (!raw) return "Points";
  const match = PROP_TYPES.find((prop) => prop.toLowerCase() === raw.toLowerCase());
  return match ?? "Points";
}

function toPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function plus(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function decisionTone(decision: PlayerSimRow["decision"]) {
  if (decision === "ATTACK") return "success" as const;
  if (decision === "PASS") return "danger" as const;
  return "premium" as const;
}

function decisionClass(decision: PlayerSimRow["decision"]) {
  if (decision === "ATTACK") return "border-mint/30 bg-mint/10 text-mint";
  if (decision === "PASS") return "border-crimson/30 bg-crimson/10 text-crimson";
  return "border-bone/25 bg-bone/[0.08] text-bone";
}

function MetricTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-bone/[0.08] bg-panel p-4">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-bone/45">{label}</div>
      <div className="mt-2 font-mono text-[22px] font-semibold leading-none text-text-primary">{value}</div>
      {sub ? <div className="mt-1.5 text-[11.5px] leading-5 text-bone/50">{sub}</div> : null}
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-sm border border-aqua/40 bg-aqua/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.10em] text-aqua"
          : "rounded-sm border border-bone/[0.08] bg-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.10em] text-bone/55 transition-colors hover:border-aqua/25 hover:text-aqua"
      }
    >
      {children}
    </Link>
  );
}

function DistributionBars({ buckets }: { buckets: number[] }) {
  const max = Math.max(...buckets, 1);
  return (
    <div className="flex h-28 items-end gap-1.5 rounded-lg border border-bone/[0.08] bg-abyss/40 p-3">
      {buckets.map((bucket, index) => (
        <div key={`${bucket}-${index}`} className="flex flex-1 items-end">
          <div
            className="w-full rounded-t-sm bg-aqua/45"
            style={{ height: `${Math.max(8, (bucket / max) * 100)}%` }}
            title={`${bucket}% bucket`}
          />
        </div>
      ))}
    </div>
  );
}

function PlayerSimCard({ row }: { row: PlayerSimRow }) {
  return (
    <Card className="surface-panel p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{row.league}</Badge>
            <Badge tone="muted">{row.team} vs {row.opponent}</Badge>
            <Badge tone={decisionTone(row.decision)}>{row.decision}</Badge>
          </div>
          <h2 className="mt-3 font-display text-[22px] font-semibold tracking-[-0.02em] text-text-primary">{row.player}</h2>
          <div className="mt-1 text-[13px] text-bone/60">{row.prop} over/under {row.line}</div>
        </div>
        <div className={`rounded-md border px-3 py-2 text-center ${decisionClass(row.decision)}`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-75">Edge</div>
          <div className="mt-1 font-mono text-xl font-semibold">{plus(row.edgePct)}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <MetricTile label="Over" value={toPercent(row.overPct)} sub={`Under ${toPercent(row.underPct)}`} />
        <MetricTile label="Sim Mean" value={row.mean.toFixed(2)} sub={`Median ${row.median}`} />
        <MetricTile label="Fair Odds" value={row.fairOdds} sub={`Book ${row.bookOdds}`} />
        <MetricTile label="Confidence" value={toPercent(row.confidence)} sub={`${row.sample.toLocaleString()} sims`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_280px]">
        <div>
          <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-bone/45">Projected distribution</div>
          <DistributionBars buckets={row.buckets} />
        </div>
        <div>
          <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-bone/45">Model drivers</div>
          <div className="grid gap-2">
            {row.drivers.map((driver) => (
              <div key={driver} className="rounded-md border border-bone/[0.06] bg-panel px-3 py-2 text-[12px] leading-5 text-bone/65">
                {driver}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default async function PlayerSimPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const league = normalizeLeague(params.league);
  const prop = normalizeProp(params.prop);
  const playerQuery = String(scalar(params.player) ?? "").trim();
  const manualLine = scalar(params.line);

  const rows = PLAYER_SIM_ROWS.filter((row) => {
    const leagueOk = league === "ALL" || row.league === league;
    const propOk = !prop || row.prop === prop || prop === "Points";
    const playerOk = !playerQuery || row.player.toLowerCase().includes(playerQuery.toLowerCase());
    return leagueOk && propOk && playerOk;
  });

  const attackCount = rows.filter((row) => row.decision === "ATTACK").length;
  const avgEdge = rows.length ? rows.reduce((sum, row) => sum + row.edgePct, 0) / rows.length : 0;
  const best = rows.slice().sort((a, b) => b.edgePct - a.edgePct)[0];

  return (
    <div className="space-y-6">
      <section className="surface-panel-strong p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="section-kicker">SharkEdge Player Sim</div>
            <h1 className="mt-3 max-w-4xl font-display text-4xl font-semibold tracking-tight text-white">
              Player Simulation Engine
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-bone/65">
              Dedicated player prop simulation workspace. Search a player, choose a prop type, compare the sportsbook line to the simulated distribution, and classify the result as attack, watch, or pass.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/sim" className="rounded-md border border-bone/[0.12] bg-panel px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-bone/75 hover:border-aqua/30 hover:text-aqua">Game Sim</Link>
            <Link href="/props" className="rounded-md border border-aqua/35 bg-aqua/10 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-aqua hover:bg-aqua/15">Open Props</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <MetricTile label="Matched Props" value={String(rows.length)} sub="Visible simulation cards" />
        <MetricTile label="Attack Signals" value={String(attackCount)} sub="Cleared edge gate" />
        <MetricTile label="Average Edge" value={plus(avgEdge)} sub="Filtered result set" />
        <MetricTile label="Best Candidate" value={best ? best.edgePct > 0 ? plus(best.edgePct) : "No edge" : "—"} sub={best ? `${best.player} ${best.prop}` : "No row selected"} />
      </section>

      <Card className="surface-panel p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-aqua">Filters</div>
              <div className="mt-1 text-[13px] text-bone/55">These controls are URL-driven so the props page can deep-link directly into this sim.</div>
            </div>
            <div className="rounded-md border border-bone/[0.08] bg-panel px-3 py-2 font-mono text-[11px] text-bone/50">
              /sim/players?league={league}&prop={encodeURIComponent(prop)}{manualLine ? `&line=${manualLine}` : ""}
            </div>
          </div>

          <div className="grid gap-4">
            <div>
              <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-bone/45">League</div>
              <div className="flex flex-wrap gap-2">
                {LEAGUES.map((item) => (
                  <FilterLink key={item} href={`/sim/players?league=${item}&prop=${encodeURIComponent(prop)}`} active={league === item}>{item}</FilterLink>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-bone/45">Prop Type</div>
              <div className="flex flex-wrap gap-2">
                {PROP_TYPES.map((item) => (
                  <FilterLink key={item} href={`/sim/players?league=${league}&prop=${encodeURIComponent(item)}`} active={prop === item}>{item}</FilterLink>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <section className="grid gap-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="section-kicker">Simulation Board</div>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-text-primary">Player prop candidates</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-bone/55">
              Demo rows are in place so the route is usable now. The next wiring step is replacing `PLAYER_SIM_ROWS` with real props, player baselines, injuries, weather, and usage inputs.
            </p>
          </div>
          <Badge tone="muted">Structure Ready</Badge>
        </div>

        {rows.length ? (
          <div className="grid gap-4">
            {rows.map((row) => <PlayerSimCard key={row.id} row={row} />)}
          </div>
        ) : (
          <Card className="surface-panel p-8 text-center">
            <div className="text-lg font-semibold text-text-primary">No simulated props matched these filters.</div>
            <div className="mt-2 text-sm text-bone/55">Reset to all leagues or choose a different prop type.</div>
            <Link href="/sim/players" className="mt-4 inline-flex rounded-md border border-aqua/35 bg-aqua/10 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-aqua hover:bg-aqua/15">Reset Filters</Link>
          </Card>
        )}
      </section>
    </div>
  );
}
