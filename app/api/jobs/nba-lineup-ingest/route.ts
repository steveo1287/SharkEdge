import { runLiveNbaLineupIngestion } from "@/services/simulation/nba-live-lineup-injury-ingestion";

export async function GET() {
  try {
    const result = await runLiveNbaLineupIngestion();
    return Response.json({ ok: true, result });
  } catch (error: any) {
    return Response.json(
      { ok: false, error: error?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
