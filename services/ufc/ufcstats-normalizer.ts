import type { UfcRealDataSnapshot, UfcRealFighterSnapshot } from "@/services/ufc/real-data-ingestion";
import type { UfcStatsEventPage, UfcStatsFightDetail, UfcStatsFighterProfile } from "@/services/ufc/ufcstats-parser";

export type UfcStatsSnapshotInput = {
  event: UfcStatsEventPage;
  fights: UfcStatsFightDetail[];
  fighters: UfcStatsFighterProfile[];
  snapshotAt: string;
  modelVersion?: string;
};

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const idFor = (name: string) => `ufcstats-${slug(name)}`;
const number = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value) ? value : null;

function fighterSnapshot(profile: UfcStatsFighterProfile | undefined, name: string): UfcRealFighterSnapshot {
  return {
    sourceId: profile?.sourceId ?? idFor(name),
    name: profile?.name ?? name,
    heightInches: number(profile?.heightInches),
    reachInches: number(profile?.reachInches),
    stance: profile?.stance ?? null,
    sigStrikesLandedPerMin: number(profile?.slpm),
    sigStrikesAbsorbedPerMin: number(profile?.sapm),
    takedownsPer15: number(profile?.takedownsPer15),
    takedownDefensePct: number(profile?.takedownDefensePct),
    submissionAttemptsPer15: number(profile?.submissionAttemptsPer15),
    feature: {
      ...(profile?.feature ?? {}),
      sigStrikeAccuracyPct: number(profile?.strikeAccuracyPct),
      sigStrikeDefensePct: number(profile?.strikeDefensePct),
      takedownAccuracyPct: number(profile?.takedownAccuracyPct),
      ufcStatsSourceId: profile?.sourceId ?? idFor(name)
    }
  };
}

function parseEventDate(date: string) {
  const parsed = new Date(date);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return date;
}

export function normalizeUfcStatsSnapshot(input: UfcStatsSnapshotInput): UfcRealDataSnapshot {
  const fightersByName = new Map(input.fighters.map((fighter) => [fighter.name.toLowerCase(), fighter]));
  const fightDetailsById = new Map(input.fights.map((fight) => [fight.sourceFightId, fight]));
  const fightDate = parseEventDate(input.event.eventDate);

  return {
    sourceKey: "ufcstats",
    modelVersion: input.modelVersion ?? "ufc-fight-iq-v1",
    snapshotAt: input.snapshotAt,
    fights: input.event.fights.map((eventFight) => {
      const detail = fightDetailsById.get(eventFight.sourceFightId);
      const fighterAName = detail?.fighterAName ?? eventFight.fighterAName ?? "Unknown A";
      const fighterBName = detail?.fighterBName ?? eventFight.fighterBName ?? "Unknown B";
      return {
        sourceFightId: eventFight.sourceFightId,
        eventLabel: `${fighterAName} vs ${fighterBName}`,
        fightDate,
        scheduledRounds: detail?.scheduledRounds ?? 3,
        weightClass: detail?.weightClass ?? eventFight.weightClass ?? null,
        fighterA: fighterSnapshot(fightersByName.get(fighterAName.toLowerCase()), fighterAName),
        fighterB: fighterSnapshot(fightersByName.get(fighterBName.toLowerCase()), fighterBName)
      };
    })
  };
}
