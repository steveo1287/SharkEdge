import {
  buildVerifiedSportInputAudit,
  verifiedField,
  type VerifiedSportInputAudit
} from "@/services/verification/verified-sport-inputs";

type FighterEvidence = {
  fighterId?: string | null;
  fighterName?: string | null;
  proFights?: number | null;
  ufcFights?: number | null;
  roundsFought?: number | null;
  sigStrikesLandedPerMin?: number | null;
  sigStrikesAbsorbedPerMin?: number | null;
  sigStrikeAccuracyPct?: number | null;
  sigStrikeDefensePct?: number | null;
  takedownsPer15?: number | null;
  takedownAccuracyPct?: number | null;
  takedownDefensePct?: number | null;
  submissionAttemptsPer15?: number | null;
  controlTimePct?: number | null;
  knockdownsPer15?: number | null;
  finishRate?: number | null;
  opponentAdjustedStrength?: number | null;
  sourceUpdatedAt?: string | null;
};

export type UfcVerifiedInputGateArgs = {
  eventId: string;
  eventName?: string | null;
  eventDate?: string | null;
  venue?: string | null;
  boutId?: string | null;
  weightClass?: string | null;
  scheduledRounds?: number | null;
  fighterA: FighterEvidence;
  fighterB: FighterEvidence;
  source?: string | null;
  checkedAt?: string;
};

function fighterFields(prefix: "fighterA" | "fighterB", fighter: FighterEvidence, source: string | null) {
  const label = prefix === "fighterA" ? "Fighter A" : "Fighter B";
  return [
    verifiedField({ key: `${prefix}.id`, label: `${label} stable ID`, value: fighter.fighterId, source }),
    verifiedField({ key: `${prefix}.name`, label: `${label} identity`, value: fighter.fighterName, source }),
    verifiedField({ key: `${prefix}.sample.ufcFights`, label: `${label} UFC fight sample`, value: fighter.ufcFights, source }),
    verifiedField({ key: `${prefix}.sample.rounds`, label: `${label} round sample`, value: fighter.roundsFought, source }),
    verifiedField({ key: `${prefix}.striking.slpm`, label: `${label} significant strikes landed/min`, value: fighter.sigStrikesLandedPerMin, source }),
    verifiedField({ key: `${prefix}.striking.sapm`, label: `${label} significant strikes absorbed/min`, value: fighter.sigStrikesAbsorbedPerMin, source }),
    verifiedField({ key: `${prefix}.striking.accuracy`, label: `${label} significant strike accuracy`, value: fighter.sigStrikeAccuracyPct, source, required: false }),
    verifiedField({ key: `${prefix}.striking.defense`, label: `${label} significant strike defense`, value: fighter.sigStrikeDefensePct, source, required: false }),
    verifiedField({ key: `${prefix}.wrestling.tdPer15`, label: `${label} takedowns/15`, value: fighter.takedownsPer15, source }),
    verifiedField({ key: `${prefix}.wrestling.tdAccuracy`, label: `${label} takedown accuracy`, value: fighter.takedownAccuracyPct, source, required: false }),
    verifiedField({ key: `${prefix}.wrestling.tdDefense`, label: `${label} takedown defense`, value: fighter.takedownDefensePct, source }),
    verifiedField({ key: `${prefix}.grappling.subAttempts`, label: `${label} submission attempts/15`, value: fighter.submissionAttemptsPer15, source }),
    verifiedField({ key: `${prefix}.grappling.control`, label: `${label} control time`, value: fighter.controlTimePct, source }),
    verifiedField({ key: `${prefix}.damage.knockdowns`, label: `${label} knockdowns/15`, value: fighter.knockdownsPer15, source, required: false }),
    verifiedField({ key: `${prefix}.finishing.finishRate`, label: `${label} finish rate`, value: fighter.finishRate, source, required: false }),
    verifiedField({ key: `${prefix}.opponentStrength`, label: `${label} opponent-adjusted strength`, value: fighter.opponentAdjustedStrength, source, required: false })
  ];
}

export function buildUfcVerifiedInputAudit(args: UfcVerifiedInputGateArgs): VerifiedSportInputAudit {
  const source = args.source ?? "UFC verified inputs";
  const fields = [
    verifiedField({ key: "event.name", label: "Official event", value: args.eventName, source }),
    verifiedField({ key: "event.date", label: "Official event date", value: args.eventDate, source }),
    verifiedField({ key: "event.venue", label: "Venue", value: args.venue, source, required: false }),
    verifiedField({ key: "bout.id", label: "Stable bout ID", value: args.boutId, source }),
    verifiedField({ key: "bout.weightClass", label: "Weight class", value: args.weightClass, source }),
    verifiedField({ key: "bout.rounds", label: "Scheduled rounds", value: args.scheduledRounds, source }),
    ...fighterFields("fighterA", args.fighterA, source),
    ...fighterFields("fighterB", args.fighterB, source)
  ];

  return buildVerifiedSportInputAudit({
    sport: "UFC",
    eventId: args.eventId,
    fields,
    checkedAt: args.checkedAt
  });
}

export function ufcPropsPublishable(audit: VerifiedSportInputAudit) {
  if (audit.sport !== "UFC" || audit.state === "BLOCKED") return false;

  const required = new Set([
    "fighterA.sample.ufcFights",
    "fighterA.sample.rounds",
    "fighterA.striking.slpm",
    "fighterA.striking.sapm",
    "fighterA.wrestling.tdPer15",
    "fighterA.wrestling.tdDefense",
    "fighterA.grappling.subAttempts",
    "fighterA.grappling.control",
    "fighterB.sample.ufcFights",
    "fighterB.sample.rounds",
    "fighterB.striking.slpm",
    "fighterB.striking.sapm",
    "fighterB.wrestling.tdPer15",
    "fighterB.wrestling.tdDefense",
    "fighterB.grappling.subAttempts",
    "fighterB.grappling.control"
  ]);

  return audit.fields
    .filter((field) => required.has(field.key))
    .every((field) => field.state === "VERIFIED");
}
