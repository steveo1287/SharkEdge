import { precomputeActivePropSims } from "@/services/simulation/sim-precompute";

export async function GET() {
  const metrics = await precomputeActivePropSims();

  return Response.json({
    status: "ok",
    metrics
  });
}
