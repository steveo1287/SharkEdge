import Link from "next/link";

import { SharkTrendsCoverageCard } from "@/components/sharktrends/SharkTrendsCoverageCard";
import { SharkTrendsSavedSystems } from "@/components/sharktrends/SharkTrendsSavedSystems";
import { SharkTrendsSearch } from "@/components/sharktrends/SharkTrendsSearch";
import { SharkTrendsWarningBanner } from "@/components/sharktrends/SharkTrendsWarningBanner";
import { prisma } from "@/lib/db/prisma";
import { getSharkTrendCatalog } from "@/src/server/sharktrends/catalog";
import { getMlbHistoricalOddsCoverage, type MlbHistoricalOddsCoverage } from "@/src/server/sharktrends/coverage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function emptyCoverage(): MlbHistoricalOddsCoverage {
  return {
    leagueKey: "MLB",
    minEventStartTime: null,
    maxEventStartTime: null,
    minSnapshotCapturedAt: null,
    maxSnapshotCapturedAt: null,
    seasonsAvailable: [],
    eventCount: 0,
    gradedEventCount: 0,
    marketCount: 0,
    snapshotCount: 0,
    sportsbookCount: 0,
    sourceKeys: [],
    marketTypes: [],
    marketsByType: {},
    rowsBySourceKey: {},
    rowsBySeason: {},
    warnings: ["Coverage could not be loaded from the database."],
    dataQualityScore: 0
  };
}

export default async function SharkTrendsPage() {
  const [coverage, catalog] = await Promise.all([
    getMlbHistoricalOddsCoverage(prisma).catch(() => emptyCoverage()),
    Promise.resolve(getSharkTrendCatalog())
  ]);

  return (
    <main className="min-h-screen bg-[#020617] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.16),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.12),transparent_28%)]" />
      <div className="relative mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-slate-950/70 p-6 shadow-2xl shadow-cyan-950/20 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-cyan-300">SharkEdge MLB intelligence</p>
              <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-tight text-white md:text-6xl">SharkTrends</h1>
              <p className="mt-4 max-w-3xl text-lg text-slate-300">
                Historical MLB trend discovery, exact-game backtesting, and live qualifier scanning. Built from the existing odds warehouse, not fabricated records.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Link href="/sharktrends/mlb-warehouse" className="rounded-full border border-slate-700 px-4 py-2 text-slate-300 hover:border-cyan-300 hover:text-white">Warehouse</Link>
              <Link href="/sharktrends/historical-audit" className="rounded-full border border-slate-700 px-4 py-2 text-slate-300 hover:border-cyan-300 hover:text-white">Historical audit</Link>
              <Link href="/sharktrends/mlb-stat-trends" className="rounded-full border border-slate-700 px-4 py-2 text-slate-300 hover:border-cyan-300 hover:text-white">MLB stat trends</Link>
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-slate-800 bg-black/25 p-4 text-sm text-slate-400">
            Trends are historical context, not guarantees. SharkTrends always exposes sample size, coverage, warnings, and the exact matching games behind every result.
          </div>
        </section>

        <SharkTrendsCoverageCard coverage={coverage} />
        <SharkTrendsWarningBanner warnings={coverage.warnings} />
        <SharkTrendsSearch templates={catalog.templates} />
        <SharkTrendsSavedSystems />
      </div>
    </main>
  );
}
