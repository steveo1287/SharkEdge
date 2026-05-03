import crypto from "node:crypto";

import {
  ingestUfcRealDataSnapshot,
  type UfcRealDataSnapshot
} from "@/services/ufc/real-data-ingestion";
import {
  runUfcOperationalSkillSim,
  type UfcOperationalSimResult
} from "@/services/ufc/operational-sim";

export type UfcCardRunFightPlan = {
  sourceFightId: string;
  warehouseFightId: string;
  eventLabel: string;
  modelVersion: string;
  marketOddsAOpen: number | null;
  marketOddsBOpen: number | null;
};

export type UfcCardRunResult = {
  ok: true;
  sourceKey: string;
  modelVersion: string;
  ingested: Awaited<ReturnType<typeof ingestUfcRealDataSnapshot>>;
  plannedFights: UfcCardRunFightPlan[];
  simulations: UfcOperationalSimResult[];
};

function stableId(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

export function ufcWarehouseFightIdForSource(sourceFightId: string, eventLabel: string, fightDate: string) {
  return stableId("ufcfi", sourceFightId || `${eventLabel}:${fightDate}`);
}

export function buildUfcOperationalCardRunPlan(snapshot: UfcRealDataSnapshot): UfcCardRunFightPlan[] {
  const modelVersion = snapshot.modelVersion ?? "ufc-fight-iq-v1";
  return snapshot.fights.map((fight) => ({
    sourceFightId: fight.sourceFightId,
    warehouseFightId: ufcWarehouseFightIdForSource(fight.sourceFightId, fight.eventLabel, fight.fightDate),
    eventLabel: fight.eventLabel,
    modelVersion,
    marketOddsAOpen: fight.marketOddsAOpen ?? null,
    marketOddsBOpen: fight.marketOddsBOpen ?? null
  }));
}

export async function runUfcOperationalCard(snapshot: UfcRealDataSnapshot, options: { simulations?: number; seed?: number; recordShadow?: boolean } = {}): Promise<UfcCardRunResult> {
  const modelVersion = snapshot.modelVersion ?? "ufc-fight-iq-v1";
  const ingested = await ingestUfcRealDataSnapshot(snapshot);
  const plannedFights = buildUfcOperationalCardRunPlan(snapshot);
  const simulations: UfcOperationalSimResult[] = [];

  for (const fight of plannedFights) {
    simulations.push(await runUfcOperationalSkillSim(fight.warehouseFightId, {
      modelVersion,
      simulations: options.simulations,
      seed: options.seed,
      recordShadow: options.recordShadow,
      marketOddsAOpen: fight.marketOddsAOpen,
      marketOddsBOpen: fight.marketOddsBOpen
    }));
  }

  return {
    ok: true,
    sourceKey: snapshot.sourceKey,
    modelVersion,
    ingested,
    plannedFights,
    simulations
  };
}
