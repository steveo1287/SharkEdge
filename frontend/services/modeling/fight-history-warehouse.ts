export type FightWarehouseInput = {
  sportKey: "UFC" | "BOXING";
  rounds: number;
  fighter: {
    record: string | null;
    recentWinRate?: number | null;
    recentMargin?: number | null;
    metadata?: Record<string, unknown> | null;
  };
  opponent: {
    record: string | null;
    recentWinRate?: number | null;
    recentMargin?: number | null;
    metadata?: Record<string, unknown> | null;
  };
};

export type FightWarehouseView = {
  fighterQualityBucket: string | null;
  opponentQualityBucket: string | null;
  finishPressureBucket: string | null;
  durabilityEdgeBucket: string | null;
  styleConflictBucket: string | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseRecord(record: string | null | undefined) {
  const match = (record ?? "").match(/(\d+)-(\d+)(?:-(\d+))?/);
  if (!match) {
    return { winPct: 0.5, sampleSize: 0, losses: 0 };
  }
  const wins = Number(match[1] ?? 0);
  const losses = Number(match[2] ?? 0);
  const draws = Number(match[3] ?? 0);
  const sampleSize = wins + losses + draws;
  return {
    winPct: sampleSize ? (wins + draws * 0.5) / sampleSize : 0.5,
    sampleSize,
    losses
  };
}

function getMetadataNumber(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = asNumber(metadata?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function getQualityBucket(score: number) {
  if (score >= 8.2) return "elite";
  if (score >= 6.8) return "strong";
  if (score >= 5.4) return "solid";
  return "volatile";
}

export function buildFightHistoryFeatureView(input: FightWarehouseInput): FightWarehouseView {
  const fighterRecord = parseRecord(input.fighter.record);
  const opponentRecord = parseRecord(input.opponent.record);
  const fighterFinish = clamp(getMetadataNumber(input.fighter.metadata, ["finishRate", "koRate", "submissionRate"]) ?? 0.38, 0.08, 0.9);
  const opponentFinish = clamp(getMetadataNumber(input.opponent.metadata, ["finishRate", "koRate", "submissionRate"]) ?? 0.38, 0.08, 0.9);
  const fighterDurability = getMetadataNumber(input.fighter.metadata, ["durabilityScore", "chinScore", "defenseScore"]) ?? clamp(8 - fighterRecord.losses * 0.12, 4.5, 9.4);
  const opponentDurability = getMetadataNumber(input.opponent.metadata, ["durabilityScore", "chinScore", "defenseScore"]) ?? clamp(8 - opponentRecord.losses * 0.12, 4.5, 9.4);
  const fighterStyle = getMetadataNumber(input.fighter.metadata, input.sportKey === "UFC" ? ["controlScore", "grapplingScore", "sigStrikeDiff"] : ["powerScore", "jabScore", "counterScore"]) ?? 6;
  const opponentStyle = getMetadataNumber(input.opponent.metadata, input.sportKey === "UFC" ? ["controlScore", "grapplingScore", "sigStrikeDiff"] : ["powerScore", "jabScore", "counterScore"]) ?? 6;

  const fighterQualityScore = fighterRecord.winPct * 6 + (input.fighter.recentWinRate ?? 50) / 25 + (input.fighter.recentMargin ?? 0) * 0.08;
  const opponentQualityScore = opponentRecord.winPct * 6 + (input.opponent.recentWinRate ?? 50) / 25 + (input.opponent.recentMargin ?? 0) * 0.08;
  const finishPressure = ((fighterFinish + opponentFinish) / 2) * 10 + (input.rounds <= 5 ? 1 : 0);
  const durabilityEdge = fighterDurability - opponentDurability;
  const styleConflict = Math.abs(fighterStyle - opponentStyle);

  return {
    fighterQualityBucket: getQualityBucket(fighterQualityScore),
    opponentQualityBucket: getQualityBucket(opponentQualityScore),
    finishPressureBucket: finishPressure >= 7.2 ? "high_finish" : finishPressure >= 5.8 ? "balanced" : "decision_heavy",
    durabilityEdgeBucket: durabilityEdge >= 1 ? "fighter_durable_edge" : durabilityEdge <= -1 ? "opponent_durable_edge" : "durability_neutral",
    styleConflictBucket: styleConflict >= 2.2 ? "style_clash" : "style_neutral"
  };
}
