import { upsertUfcWarehousePayload, type UfcWarehousePayload } from "@/services/ufc/warehouse-ingestion";

export type UfcRealFighterSnapshot = {
  sourceId: string;
  name: string;
  stance?: string | null;
  heightInches?: number | null;
  reachInches?: number | null;
  combatBase?: string | null;
  proFights?: number | null;
  ufcFights?: number | null;
  roundsFought?: number | null;
  sigStrikesLandedPerMin?: number | null;
  sigStrikesAbsorbedPerMin?: number | null;
  strikingDifferential?: number | null;
  takedownsPer15?: number | null;
  takedownDefensePct?: number | null;
  submissionAttemptsPer15?: number | null;
  controlTimePct?: number | null;
  opponentAdjustedStrength?: number | null;
  coldStartActive?: boolean;
  feature?: Record<string, unknown>;
};

export type UfcRealEventSnapshot = {
  sourceEventId: string;
  eventName: string;
  eventDate: string;
  location?: string | null;
  status?: string | null;
  payload?: Record<string, unknown>;
};

export type UfcRealFightSnapshot = {
  sourceFightId: string;
  eventId?: string | null;
  eventLabel: string;
  fightDate: string;
  scheduledRounds?: 3 | 5;
  weightClass?: string | null;
  fighterA: UfcRealFighterSnapshot;
  fighterB: UfcRealFighterSnapshot;
  marketOddsAOpen?: number | null;
  marketOddsBOpen?: number | null;
};

export type UfcRealDataSnapshot = {
  sourceKey: string;
  modelVersion?: string;
  snapshotAt: string;
  event?: UfcRealEventSnapshot | null;
  fights: UfcRealFightSnapshot[];
};

function assertPreFight(snapshotAt: string, fightDate: string, label: string) {
  if (new Date(snapshotAt).getTime() > new Date(fightDate).getTime()) {
    throw new Error(`${label} has future-data leakage: snapshotAt must be before fightDate.`);
  }
}

export function normalizeUfcRealDataSnapshot(snapshot: UfcRealDataSnapshot): UfcWarehousePayload {
  const modelVersion = snapshot.modelVersion ?? "ufc-fight-iq-v1";
  const fighters = new Map<string, UfcRealFighterSnapshot>();

  for (const fight of snapshot.fights) {
    assertPreFight(snapshot.snapshotAt, fight.fightDate, fight.eventLabel);
    fighters.set(fight.fighterA.sourceId, fight.fighterA);
    fighters.set(fight.fighterB.sourceId, fight.fighterB);
  }

  const eventKey = snapshot.event?.sourceEventId ?? null;

  return {
    events: snapshot.event ? [{
      externalEventId: snapshot.event.sourceEventId,
      sourceKey: snapshot.sourceKey,
      eventName: snapshot.event.eventName,
      eventDate: snapshot.event.eventDate,
      location: snapshot.event.location ?? null,
      status: snapshot.event.status ?? "SCHEDULED",
      payload: { sourceKey: snapshot.sourceKey, ...(snapshot.event.payload ?? {}) }
    }] : [],
    fighters: [...fighters.values()].map((fighter) => ({
      externalKey: fighter.sourceId,
      fullName: fighter.name,
      stance: fighter.stance ?? null,
      heightInches: fighter.heightInches ?? null,
      reachInches: fighter.reachInches ?? null,
      combatBase: fighter.combatBase ?? null,
      payload: { sourceKey: snapshot.sourceKey, rawFeature: fighter.feature ?? {} }
    })),
    fights: snapshot.fights.map((fight) => ({
      externalFightId: fight.sourceFightId,
      eventKey: fight.eventId ?? eventKey,
      eventLabel: fight.eventLabel,
      fightDate: fight.fightDate,
      scheduledRounds: fight.scheduledRounds ?? 3,
      fighterAKey: fight.fighterA.sourceId,
      fighterBKey: fight.fighterB.sourceId,
      weightClass: fight.weightClass ?? null,
      status: "SCHEDULED",
      preFightSnapshotAt: snapshot.snapshotAt,
      payload: {
        sourceKey: snapshot.sourceKey,
        sourceEventId: fight.eventId ?? eventKey,
        marketOddsAOpen: fight.marketOddsAOpen ?? null,
        marketOddsBOpen: fight.marketOddsBOpen ?? null
      }
    })),
    fightStatsRounds: [],
    fighterRatings: [],
    opponentStrengthSnapshots: [],
    amateurResults: [],
    prospectNotes: [],
    modelFeatures: snapshot.fights.flatMap((fight) => [
      {
        fightKey: fight.sourceFightId,
        fightDate: fight.fightDate,
        fighterKey: fight.fighterA.sourceId,
        opponentFighterKey: fight.fighterB.sourceId,
        snapshotAt: snapshot.snapshotAt,
        modelVersion,
        proFights: fight.fighterA.proFights ?? null,
        ufcFights: fight.fighterA.ufcFights ?? null,
        roundsFought: fight.fighterA.roundsFought ?? null,
        sigStrikesLandedPerMin: fight.fighterA.sigStrikesLandedPerMin ?? null,
        sigStrikesAbsorbedPerMin: fight.fighterA.sigStrikesAbsorbedPerMin ?? null,
        strikingDifferential: fight.fighterA.strikingDifferential ?? null,
        takedownsPer15: fight.fighterA.takedownsPer15 ?? null,
        takedownDefensePct: fight.fighterA.takedownDefensePct ?? null,
        submissionAttemptsPer15: fight.fighterA.submissionAttemptsPer15 ?? null,
        controlTimePct: fight.fighterA.controlTimePct ?? null,
        opponentAdjustedStrength: fight.fighterA.opponentAdjustedStrength ?? null,
        coldStartActive: Boolean(fight.fighterA.coldStartActive),
        feature: fight.fighterA.feature ?? {}
      },
      {
        fightKey: fight.sourceFightId,
        fightDate: fight.fightDate,
        fighterKey: fight.fighterB.sourceId,
        opponentFighterKey: fight.fighterA.sourceId,
        snapshotAt: snapshot.snapshotAt,
        modelVersion,
        proFights: fight.fighterB.proFights ?? null,
        ufcFights: fight.fighterB.ufcFights ?? null,
        roundsFought: fight.fighterB.roundsFought ?? null,
        sigStrikesLandedPerMin: fight.fighterB.sigStrikesLandedPerMin ?? null,
        sigStrikesAbsorbedPerMin: fight.fighterB.sigStrikesAbsorbedPerMin ?? null,
        strikingDifferential: fight.fighterB.strikingDifferential ?? null,
        takedownsPer15: fight.fighterB.takedownsPer15 ?? null,
        takedownDefensePct: fight.fighterB.takedownDefensePct ?? null,
        submissionAttemptsPer15: fight.fighterB.submissionAttemptsPer15 ?? null,
        controlTimePct: fight.fighterB.controlTimePct ?? null,
        opponentAdjustedStrength: fight.fighterB.opponentAdjustedStrength ?? null,
        coldStartActive: Boolean(fight.fighterB.coldStartActive),
        feature: fight.fighterB.feature ?? {}
      }
    ]),
    predictions: [],
    simRuns: [],
    backtestResults: []
  };
}

export async function ingestUfcRealDataSnapshot(snapshot: UfcRealDataSnapshot) {
  return upsertUfcWarehousePayload(normalizeUfcRealDataSnapshot(snapshot));
}
