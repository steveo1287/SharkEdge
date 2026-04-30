import Link from "next/link";

import { SimMetricTile, SimSignalCard, SimWorkspaceHeader } from "@/components/sim/sim-ui";
import { SectionTitle } from "@/components/ui/section-title";
import { SimPriorityQueue } from "@/app/sim/priority-queue";

export const revalidate = 300;

type WorkspaceConfig = {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  primaryMetric: string;
  secondaryMetric: string;
  action: string;
};

function WorkspaceCard({ config }: { config: WorkspaceConfig }) {
  return (
    <Link href={config.href} className="block h-full">
      <SimSignalCard className="group h-full transition hover:border-sky-400/35 hover:bg-sky-500/[0.055]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200/80">{config.eyebrow}</div>
            <div className="mt-2 font-display text-2xl font-semibold tracking-tight text-white">{config.title}</div>
          </div>
          <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200">Open</span>
        </div>
        <p className="mt-4 min-h-[52px] text-sm leading-6 text-slate-400">{config.description}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <SimMetricTile label="Primary" value={config.primaryMetric} />
          <SimMetricTile label="Status" value={config.secondaryMetric} />
        </div>
        <div className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-sky-200 group-hover:text-sky-100">{config.action} -&gt;</div>
      </SimSignalCard>
    </Link>
  );
}

export default function SimHubPage() {
  const workspaces: WorkspaceConfig[] = [
    {
      href: "/sim/nba",
      eyebrow: "NBA workspace",
      title: "Player Sims + Side Queue",
      description: "Calibrated player box scores, prop drilldowns, confidence gates, and side reads in one tight board.",
      primaryMetric: "Live",
      secondaryMetric: "On demand",
      action: "Open NBA desk"
    },
    {
      href: "/sim/mlb",
      eyebrow: "MLB workspace",
      title: "Sides + Totals Edge Desk",
      description: "Moneyline, total edge, pitcher/bullpen factors, market-line matching, and MLB Data API player-model status.",
      primaryMetric: "Live",
      secondaryMetric: "On demand",
      action: "Open MLB desk"
    },
    {
      href: "/sim/players?league=NBA",
      eyebrow: "NBA drilldown",
      title: "Projected Player Box Scores",
      description: "Use this when the player prop board needs exact points, boards, assists, threes, PRA, floor and ceiling.",
      primaryMetric: "10k sims",
      secondaryMetric: "Props ready",
      action: "Open player board"
    }
  ];

  return (
    <div className="space-y-6">
      <SimWorkspaceHeader
        eyebrow="Simulation Command Desk"
        title="Pick the right workspace, then make the decision fast."
        description="This hub is intentionally light: it renders immediately, then loads the NBA/MLB priority queue separately with hard timeouts so a slow odds, model, or stats provider cannot freeze the page."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SimMetricTile label="Shell" value="Fast" sub="No request-time projection batch" emphasis="strong" />
          <SimMetricTile label="Priority API" value="/api/sim/priority" sub="10-row cap + timeout" />
          <SimMetricTile label="NBA slate" value="On demand" sub="Open full workspace" />
          <SimMetricTile label="MLB slate" value="On demand" sub="No duplicate edge projection" />
        </div>
      </SimWorkspaceHeader>

      <section className="grid gap-4 xl:grid-cols-3">
        {workspaces.map((workspace) => <WorkspaceCard key={workspace.href} config={workspace} />)}
      </section>

      <section className="grid gap-4">
        <SectionTitle title="First decisions to check" description="Loaded after first paint. The detailed league pages still run the full simulation stack." />
        <SimPriorityQueue />
      </section>
    </div>
  );
}
