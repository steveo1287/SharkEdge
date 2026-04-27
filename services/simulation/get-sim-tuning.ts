import { prisma } from "@/lib/prisma";
import { DEFAULT_TUNING, SimTuningParams } from "./sim-tuning";

export async function getSimTuning(): Promise<SimTuningParams> {
  const record = await prisma.simTuning.findFirst({
    where: { scope: "global" }
  });
  return record?.params ?? DEFAULT_TUNING;
}
