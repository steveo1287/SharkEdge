import { prisma } from "@/lib/db/prisma";
import { DEFAULT_TUNING, SimTuningParams } from "./sim-tuning";

export async function getSimTuning(): Promise<SimTuningParams> {
  const record = await prisma.simTuning.findFirst({
    where: { scope: "global" }
  });
  return (record?.params as SimTuningParams | undefined) ?? DEFAULT_TUNING;
}
