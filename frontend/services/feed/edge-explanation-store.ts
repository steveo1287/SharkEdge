import { prisma } from "@/lib/db/prisma";

type PersistEdgeExplanationInput = {
  signalId: string;
  metadataJson: unknown;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export async function persistEdgeExplanation(input: PersistEdgeExplanationInput) {
  const current = await prisma.edgeSignal.findUnique({
    where: { id: input.signalId },
    select: { metadataJson: true }
  });

  const existing = asObject(current?.metadataJson) ?? {};
  const incoming = asObject(input.metadataJson) ?? {};

  return prisma.edgeSignal.update({
    where: { id: input.signalId },
    data: {
      metadataJson: {
        ...existing,
        ...incoming,
        explanationUpdatedAt: new Date().toISOString()
      }
    },
    select: { id: true, metadataJson: true }
  });
}
