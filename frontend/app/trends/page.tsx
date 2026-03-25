import { SectionTitle } from "@/components/ui/section-title";
import { TrendsDashboard } from "@/components/trends/trends-dashboard";
import { getTrendDashboard } from "@/services/trends/trends-service";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  const data = await getTrendDashboard();

  return (
    <div className="grid gap-6">
      <SectionTitle
        title="Trends Builder"
        description="Historical movement, CLV, totals performance, and segment cards now run from stored data where the database is ready. If the runtime is missing Postgres or migrations, SharkEdge shows that honestly."
      />
      <TrendsDashboard data={data} />
    </div>
  );
}
