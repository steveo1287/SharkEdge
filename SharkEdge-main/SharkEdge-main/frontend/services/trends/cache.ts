import { prisma } from "@/lib/db/prisma";

export async function invalidateTrendCache() {
  try {
    await prisma.trendCache.deleteMany({});
  } catch {
    return false;
  }

  return true;
}
