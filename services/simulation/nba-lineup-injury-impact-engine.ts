export type NbaLineupPlayerInput = {
  playerId?: string | null;
  name: string;
  position?: string | null;
  starter?: boolean | null;
  injuryStatus?: "ACTIVE" | "QUESTIONABLE" | "DOUBTFUL" | "OUT" | null;
  seasonMinutes?: number | null;
  projectedMinutes?: number | null;
  usageRate?: number | null;
  onOffUsageDelta?: number | null;
  rolePriority?: number | null; // 0-1, higher gets more redistributed opportunity
};

export type NbaLineupInjuryImpactInput = {
  targetPlayerName: string;
  targetPlayerId?: string | null;
  teamPlayers: NbaLineupPlayerInput[];
  gameSpreadAbs?: number | null;
  gameTotal?: number | null;
};

export type NbaLineupInjuryImpactOutput = {
  targetAvailable: boolean;
  projectedMinutesDelta: number;
  usageVacatedPct: number;
  usageBoostPct: number;
  minutesRedistribution: Array<{
    player: string;
    minutesDelta: number;
    usageBoostPct: number;
  }>;
  rotationRisk: number;
  reasons: string[];
  riskFlags: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function safe(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isTarget(input: NbaLineupInjuryImpactInput, player: NbaLineupPlayerInput) {
  if (input.targetPlayerId && player.playerId) return input.targetPlayerId === player.playerId;
  return player.name.trim().toLowerCase() === input.targetPlayerName.trim().toLowerCase();
}

function unavailableWeight(status: NbaLineupPlayerInput["injuryStatus"]) {
  if (status === "OUT") return 1;
  if (status === "DOUBTFUL") return 0.7;
  if (status === "QUESTIONABLE") return 0.25;
  return 0;
}

function roleWeight(player: NbaLineupPlayerInput) {
  const base = player.starter ? 1.15 : 0.75;
  const priority = safe(player.rolePriority, player.starter ? 0.72 : 0.42);
  const minutes = clamp(safe(player.projectedMinutes, safe(player.seasonMinutes, player.starter ? 30 : 18)) / 36, 0.25, 1.15);
  return Math.max(0.05, base * priority * minutes);
}

export function buildNbaLineupInjuryImpact(input: NbaLineupInjuryImpactInput): NbaLineupInjuryImpactOutput {
  const reasons: string[] = [];
  const riskFlags: string[] = [];
  const target = input.teamPlayers.find((player) => isTarget(input, player));

  if (!target) {
    return {
      targetAvailable: true,
      projectedMinutesDelta: 0,
      usageVacatedPct: 0,
      usageBoostPct: 0,
      minutesRedistribution: [],
      rotationRisk: 0.35,
      reasons: ["Lineup engine did not find target player; neutral impact applied"],
      riskFlags: ["Target player missing from lineup context"]
    };
  }

  const targetUnavailable = unavailableWeight(target.injuryStatus);
  if (targetUnavailable >= 1) {
    return {
      targetAvailable: false,
      projectedMinutesDelta: -safe(target.projectedMinutes, safe(target.seasonMinutes, 0)),
      usageVacatedPct: 0,
      usageBoostPct: 0,
      minutesRedistribution: [],
      rotationRisk: 1,
      reasons: ["Target player marked OUT by lineup engine"],
      riskFlags: ["Target unavailable"]
    };
  }

  const unavailableTeammates = input.teamPlayers.filter((player) => !isTarget(input, player) && unavailableWeight(player.injuryStatus) > 0);
  let vacatedMinutes = 0;
  let vacatedUsage = 0;

  for (const player of unavailableTeammates) {
    const weight = unavailableWeight(player.injuryStatus);
    const minutes = safe(player.projectedMinutes, safe(player.seasonMinutes, player.starter ? 30 : 18));
    const usage = safe(player.usageRate, player.starter ? 0.22 : 0.17);
    vacatedMinutes += minutes * weight;
    vacatedUsage += usage * 100 * weight * clamp(minutes / 36, 0.35, 1.1);
    reasons.push(`${player.name} ${player.injuryStatus?.toLowerCase()} creates rotation opportunity`);
  }

  const eligiblePlayers = input.teamPlayers.filter((player) => unavailableWeight(player.injuryStatus) < 0.7);
  const totalRoleWeight = eligiblePlayers.reduce((sum, player) => sum + roleWeight(player), 0) || 1;
  const redistribution = eligiblePlayers.map((player) => {
    const share = roleWeight(player) / totalRoleWeight;
    const minutesDelta = vacatedMinutes * share;
    const usageBoostPct = vacatedUsage * share;
    return {
      player: player.name,
      minutesDelta: Number(minutesDelta.toFixed(2)),
      usageBoostPct: Number(usageBoostPct.toFixed(2))
    };
  });

  const targetRedistribution = redistribution.find((entry) => entry.player === target.name);
  const questionableDrag = target.injuryStatus === "QUESTIONABLE" ? -2.25 : target.injuryStatus === "DOUBTFUL" ? -8 : 0;
  const projectedMinutesDelta = clamp((targetRedistribution?.minutesDelta ?? 0) + questionableDrag, -12, 8);
  const usageBoostPct = clamp(targetRedistribution?.usageBoostPct ?? 0, 0, 8);
  const usageVacatedPct = Number(vacatedUsage.toFixed(2));

  if (usageBoostPct >= 1.5) reasons.push(`Target absorbs ${usageBoostPct.toFixed(1)} pts of vacated usage`);
  if (projectedMinutesDelta >= 1.5) reasons.push(`Target minutes rise ${projectedMinutesDelta.toFixed(1)} from lineup redistribution`);
  if (questionableDrag < 0) riskFlags.push("Target injury tag offsets teammate opportunity");

  const spreadRisk = clamp(safe(input.gameSpreadAbs, 0) / 18, 0, 0.5);
  const injuryRisk = clamp(unavailableTeammates.length * 0.12 + targetUnavailable * 0.35, 0, 0.75);
  const rotationRisk = clamp(0.15 + spreadRisk + injuryRisk, 0, 1);

  if (rotationRisk > 0.55) riskFlags.push("High lineup volatility");
  if (!reasons.length) reasons.push("Lineup engine neutral; no major teammate injury redistribution found");

  return {
    targetAvailable: true,
    projectedMinutesDelta: Number(projectedMinutesDelta.toFixed(2)),
    usageVacatedPct,
    usageBoostPct: Number(usageBoostPct.toFixed(2)),
    minutesRedistribution: redistribution,
    rotationRisk: Number(rotationRisk.toFixed(4)),
    reasons,
    riskFlags
  };
}
