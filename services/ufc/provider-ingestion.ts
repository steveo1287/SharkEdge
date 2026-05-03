import { ingestUfcRealDataSnapshot, type UfcRealDataSnapshot } from "@/services/ufc/real-data-ingestion";
import { mergeFightMatrixStrengthIntoSnapshot, mergeManualProspectsIntoSnapshot, mergeUfcStatsIntoSnapshot, normalizeOddsApiMmaEvents, validateProviderSnapshot, type FightMatrixStrengthSnapshot, type ManualProspectSnapshot, type UfcOddsApiEvent, type UfcStatsFighterSnapshot } from "@/services/ufc/provider-adapters";

export type UfcProviderCompositePayload = {
  snapshotAt: string;
  modelVersion?: string;
  oddsApiEvents?: UfcOddsApiEvent[];
  baseSnapshot?: UfcRealDataSnapshot;
  ufcStatsFighters?: UfcStatsFighterSnapshot[];
  fightMatrixStrengths?: FightMatrixStrengthSnapshot[];
  manualProspects?: ManualProspectSnapshot[];
};

export function buildUfcCompositeProviderSnapshot(payload: UfcProviderCompositePayload): UfcRealDataSnapshot {
  let snapshot = payload.baseSnapshot ?? normalizeOddsApiMmaEvents({ events: payload.oddsApiEvents ?? [], snapshotAt: payload.snapshotAt, modelVersion: payload.modelVersion });
  if (payload.modelVersion && !snapshot.modelVersion) snapshot = { ...snapshot, modelVersion: payload.modelVersion };
  if (payload.ufcStatsFighters?.length) snapshot = mergeUfcStatsIntoSnapshot(snapshot, payload.ufcStatsFighters);
  if (payload.fightMatrixStrengths?.length) snapshot = mergeFightMatrixStrengthIntoSnapshot(snapshot, payload.fightMatrixStrengths);
  if (payload.manualProspects?.length) snapshot = mergeManualProspectsIntoSnapshot(snapshot, payload.manualProspects);
  const validation = validateProviderSnapshot(snapshot);
  if (!validation.ok) throw new Error(`UFC provider snapshot failed validation: ${validation.errors.join("; ")}`);
  return snapshot;
}

export async function ingestUfcCompositeProviderPayload(payload: UfcProviderCompositePayload) {
  return ingestUfcRealDataSnapshot(buildUfcCompositeProviderSnapshot(payload));
}
