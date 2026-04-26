import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import type { LeagueKey } from "@/lib/types/domain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type TrendCard = {
  id: string;
  league: LeagueKey | "ALL";
  title: string;
  angle: string;
  hitRate: number;
  sample: number;
  confidence: "A" | "B" | "C";
  category: "Schedule" | "Form" | "Totals" | "Home/Away" | "Market" | "Matchup";
  note: string;
};

const LEAGUE_ICONS: Partial<Record<LeagueKey | "ALL", string>> = {
  ALL: "📊",
  NBA: "🏀",
  MLB: "⚾",
  NHL: "🏒",
  NFL: "🏈",
  NCAAF: "🏈",
  UFC: "🥊",
  BOXING: "🥊"
};

const TRENDS: TrendCard[] = [
  {
    id: "nba-home-rest-edge",
    league: "NBA",
    title: "Home rest edge",
    angle: "Home teams with rest advantage after opponent played within 24 hours",
    hitRate: 58.4,
    sample: 312,
    confidence: "B",
    category: "Schedule",
    note: "Best used as a simulator modifier, not a standalone pick."
  },
  {
    id: "nba-total-pace-compression",
    league: "NBA",
    title: "Pace compression under",
    angle: "Two bottom-third pace teams meeting after travel",
    hitRate: 60.1,
    sample: 188,
    confidence: "B",
    category: "Totals",
    note: "Use with projected total from the simulator."
  },
  {
    id: "mlb-home-series-game-two",
    league: "MLB",
    title: "Series game two response",
    angle: "Home teams after dropping game one of a series",
    hitRate: 54.7,
    sample: 642,
    confidence: "C",
    category: "Form",
    note: "Large sample, modest edge; useful for context only."
  },
  {
    id: "mlb-low-total-bullpen",
    league: "MLB",
    title: "Low total bullpen stress",
    angle: "Games with low offensive projection and both bullpens used heavily previous night",
    hitRate: 57.9,
    sample: 219,
    confidence: "B",
    category: "Totals",
    note: "Pairs well with pitcher/team form when available."
  },
  {
    id: "nhl-road-back-to-back",
    league: "NHL",
    title: "Road back-to-back fade",
    angle: "Road teams on second leg of back-to-back against rested opponent",
    hitRate: 59.3,
    sample: 271,
    confidence: "B",
    category: "Schedule",
    note: "Strongest when travel distance is material."
  },
  {
    id: "nhl-tight-total-live",
    league: "NHL",
    title: "Tight total pressure",
    angle: "Projected one-goal games with conservative recent scoring profile",
    hitRate: 56.6,
    sample: 245,
    confidence: "C",
    category: "Matchup",
    note: "Good research prompt, not automatic action."
  },
  {
    id: "nfl-home-dog-division",
    league: "NFL",
    title: "Division home dog resistance",
    angle: "Home underdogs in divisional games with rest parity",
    hitRate: 57.2,
    sample: 166,
    confidence: "B",
    category: "Home/Away",
    note: "Works best as a game script warning."
  },
  {
    id: "nfl-low-total-favorites",
    league: "NFL",
    title: "Low-total favorite grind",
    angle: "Favorites in low-total games with projected run-heavy scripts",
    hitRate: 59.8,
    sample: 124,
    confidence: "B",
    category: "Totals",
    note: "Use simulator total and spread context before action."
  },
  {
    id: "ncaaf-letdown-road",
    league: "NCAAF",
    title: "Road letdown spot",
    angle: "Ranked road teams after emotional home win",
    hitRate: 55.9,
    sample: 201,
    confidence: "C",
    category: "Schedule",
    note: "College variance is high; treat as risk tag."
  },
  {
    id: "ufc-decision-profile",
    league: "UFC",
    title: "Decision profile pressure",
    angle: "Fighters with durable opponent and low finish-rate profile",
    hitRate: 61.5,
    sample: 96,
    confidence: "B",
    category: "Matchup",
    note: "Sample is smaller, but useful for fight simulations."
  }
];

function readValue(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function getConfidenceTone(confidence: TrendCard["confidence"]) {
  if (confidence === "A") return "success" as const;
  if (confidence === "B") return "premium" as const;
  return "muted" as const;
}

function getHitRateTone(hitRate: number) {
  if (hitRate >= 60) return "text-aqua";
  if (hitRate >= 57) return "text-amber-300";
  return "text-slate-300";
}

function TrendResearchCard({ trend }: { trend: TrendCard }) {
  return (
    <Card className="surface-panel h-full p-5 transition hover:border-sky-400/25 hover:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            <span>{LEAGUE_ICONS[trend.league] ?? "📊"}</span>
            <span>{trend.league}</span>
            <span>•</span>
            <span>{trend.category}</span>
          </div>
          <h3 className="mt-3 font-display text-2xl font-semibold text-white">{trend.title}</h3>
        </div>
        <Badge tone={getConfidenceTone(trend.confidence)}>Conf {trend.confidence}</Badge>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-300">{trend.angle}</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
          <div className="text-[0.64rem] uppercase tracking-[0.18em] text-slate-500">Hit rate</div>
          <div className={`mt-2 text-3xl font-semibold ${getHitRateTone(trend.hitRate)}`}>{trend.hitRate.toFixed(1)}%</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
          <div className="text-[0.64rem] uppercase tracking-[0.18em] text-slate-500">Sample</div>
          <div className="mt-2 text-3xl font-semibold text-white">{trend.sample}</div>
        </div>
      </div>

      <div className="mt-5 rounded-[1.1rem] border border-white/8 bg-slate-950/55 px-4 py-3 text-sm leading-6 text-slate-300">
        {trend.note}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/games#${trend.league}`}
          className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
        >
          Find games
        </Link>
        <Link
          href={`/sim?league=${encodeURIComponent(trend.league)}`}
          className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
        >
          Sim lane
        </Link>
      </div>
    </Card>
  );
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const leagueParam = readValue(resolved, "league")?.toUpperCase();
  const selectedLeague = leagueParam && leagueParam !== "ALL" ? leagueParam : "ALL";
  const trends = selectedLeague === "ALL" ? TRENDS : TRENDS.filter((trend) => trend.league === selectedLeague);
  const averageHitRate = trends.length
    ? trends.reduce((sum, trend) => sum + trend.hitRate, 0) / trends.length
    : 0;
  const highConfidence = trends.filter((trend) => trend.confidence === "A" || trend.confidence === "B").length;
  const leagues = ["ALL", ...Array.from(new Set(TRENDS.map((trend) => trend.league)))] as Array<LeagueKey | "ALL">;

  return (
    <div className="grid gap-8">
      <section className="surface-panel-strong px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div className="grid gap-4">
            <div className="section-kicker">Trends lab</div>
            <div className="max-w-4xl font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              Research angles that work even when odds are offline.
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300">
              This page is built as a stable research layer for the Games → Sim → Trends loop. Use trends as context, then validate the matchup through the simulator.
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/games"
                className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
              >
                Open games
              </Link>
              <Link
                href="/sim"
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
              >
                Open simulator
              </Link>
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.55rem] border border-white/8 bg-[#09131f]/85 p-5 text-sm text-slate-300">
            <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">Research state</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                <div className="text-[0.64rem] uppercase tracking-[0.18em] text-slate-500">Trends</div>
                <div className="mt-2 text-3xl font-semibold text-white">{trends.length}</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                <div className="text-[0.64rem] uppercase tracking-[0.18em] text-slate-500">Avg hit</div>
                <div className="mt-2 text-3xl font-semibold text-white">{averageHitRate.toFixed(1)}%</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                <div className="text-[0.64rem] uppercase tracking-[0.18em] text-slate-500">A/B</div>
                <div className="mt-2 text-3xl font-semibold text-white">{highConfidence}</div>
              </div>
            </div>
            <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
              Trends are context, not picks. The correct flow is: find angle, open games, simulate matchup, then decide whether the read survives.
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Filters"
          title="Choose a league"
          description="The trends lab stays online without odds, ingestion, or live market state."
        />
        <div className="flex flex-wrap gap-2">
          {leagues.map((league) => (
            <Link
              key={league}
              href={league === "ALL" ? "/trends" : `/trends?league=${encodeURIComponent(league)}`}
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                selectedLeague === league
                  ? "border-sky-400/35 bg-sky-500/10 text-sky-200"
                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-sky-400/25 hover:text-white"
              }`}
            >
              {LEAGUE_ICONS[league] ?? "📊"} {league}
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Trend cards"
          title={selectedLeague === "ALL" ? "Research board" : `${selectedLeague} research board`}
          description="Each card gives a usable angle, sample size, confidence, and a direct path back into Games or Sim."
        />

        {trends.length ? (
          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {trends.map((trend) => (
              <TrendResearchCard key={trend.id} trend={trend} />
            ))}
          </div>
        ) : (
          <Card className="surface-panel p-8 text-center">
            <div className="font-display text-2xl font-semibold text-white">No trends for this league yet</div>
            <div className="mt-2 text-sm leading-6 text-slate-400">Use all trends or return to the games desk.</div>
            <div className="mt-5 flex justify-center gap-3">
              <Link
                href="/trends"
                className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200"
              >
                All trends
              </Link>
              <Link
                href="/games"
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200"
              >
                Games
              </Link>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
