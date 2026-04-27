import { autoTuneModel, saveTuning } from "@/services/simulation/sim-auto-tuner";

export async function GET() {
  const params = await autoTuneModel();
  await saveTuning(params);
  return Response.json({
    status: "ok",
    params
  });
}
