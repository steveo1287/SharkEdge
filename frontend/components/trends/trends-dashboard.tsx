import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { SetupStateCard } from "@/components/ui/setup-state-card";
import { StatCard } from "@/components/ui/stat-card";
import type { TrendDashboardView } from "@/lib/types/domain";

type TrendsDashboardProps = {
  data: TrendDashboardView;
};

export function TrendsDashboard({ data }: TrendsDashboardProps) {
  if (data.setup) {
    return <SetupStateCard title={data.setup.title} detail={data.setup.detail} steps={data.setup.steps} />;
  }

  return (
    <div className="grid gap-6">
      <Card className="p-5">
        <div className="text-xs uppercase tracking-[0.2em] text-sky-300">Real Data</div>
        <div className="mt-3 font-display text-3xl font-semibold text-white">
          Historical movement, CLV, and ledger-backed segments
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">{data.sourceNote}</p>
        <div className="mt-4 rounded-2xl border border-dashed border-line bg-slate-950/65 p-4 text-sm text-slate-300">
          Active saved trend: <span className="text-white">{data.savedTrendName}</span>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => (
          <StatCard key={metric.label} label={metric.label} value={metric.value} note={metric.note} />
        ))}
      </div>

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
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
            Largest Market Moves
          </div>
          {data.movementRows.length ? (
            <DataTable
              compact
              columns={["Market", "Move", "Context"]}
              rows={data.movementRows.map((row) => [row.label, row.movement, row.note])}
            />
          ) : (
            <Card className="p-5 text-sm text-slate-400">
              No harvested movement rows are available yet.
            </Card>
          )}
        </div>

        <div className="grid gap-3">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
            CLV + Segment Read
          </div>
          {data.segmentRows.length ? (
            <DataTable
              compact
              columns={["Segment", "Value", "Context"]}
              rows={data.segmentRows.map((row) => [row.label, row.movement, row.note])}
            />
          ) : (
            <Card className="p-5 text-sm text-slate-400">
              Segment tables will populate once settled bets and harvested odds history accumulate.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
