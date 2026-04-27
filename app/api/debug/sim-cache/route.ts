import { getCacheStats } from "@/services/simulation/sim-cache";

export async function GET() {
  const stats = getCacheStats();

  return Response.json({
    status: "ok",
    cache: stats,
    message: `${stats.active} active sims cached, ${stats.expired} expired, ${stats.total} total`
  });
}
