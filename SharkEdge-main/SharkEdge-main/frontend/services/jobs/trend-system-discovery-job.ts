import { refreshDiscoveredTrendSystems } from "@/services/trends/discovered-systems";

export async function trendSystemDiscoveryJob(args?: {
  leagues?: string[];
  days?: number;
}) {
  return refreshDiscoveredTrendSystems(args);
}
