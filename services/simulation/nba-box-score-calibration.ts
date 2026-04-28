import type { NbaPlayerStatProjection } from "@/services/simulation/nba-player-stat-sim";

type TeamSide = NbaPlayerStatProjection["teamSide"];

type CalibrationTargets = {
  awayPoints: number;
  homePoints: number;
};

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sum(rows: NbaPlayerStatProjection[], selector: (row: NbaPlayerStatProjection) => number) {
  return rows.reduce((total, row) => total + selector(row), 0);
}

function targetForSide(side: TeamSide, targets: CalibrationTargets) {
  return side === "away" ? targets.awayPoints : targets.homePoints;
}

function maxPointsForRank(rank: number, teamTarget: number) {
  const highTotalBump = teamTarget >= 122 ? 1.8 : teamTarget >= 116 ? 0.8 : 0;
  if (rank === 0) return 34.5 + highTotalBump;
  if (rank === 1) return 27.5 + highTotalBump * 0.6;
  if (rank === 2) return 22.5;
  if (rank === 3) return 18.5;
  if (rank === 4) return 15.5;
  if (rank === 5) return 13.5;
  return 11.5;
}

function minPointsForRank(rank: number) {
  if (rank === 0) return 14;
  if (rank === 1) return 10;
  if (rank === 2) return 7;
  if (rank === 3) return 5;
  if (rank === 4) return 3;
  return 0.5;
}

function playerWeight(row: NbaPlayerStatProjection) {
  return Math.max(
    0.35,
    row.projectedPoints * 0.72 +
    row.projectedMinutes * 0.2 +
    row.projectedAssists * 0.18 +
    row.confidence * 2
  );
}

function scalePointFields(row: NbaPlayerStatProjection, nextPoints: number): NbaPlayerStatProjection {
  const original = Math.max(0.1, row.projectedPoints);
  const factor = nextPoints / original;
  const nextFloor = clamp(row.floor.points * factor, 0, nextPoints);
  const nextCeiling = Math.max(nextPoints, row.ceiling.points * factor);

  return {
    ...row,
    projectedPoints: round(nextPoints),
    median: {
      ...row.median,
      points: round(nextPoints)
    },
    floor: {
      ...row.floor,
      points: round(nextFloor)
    },
    ceiling: {
      ...row.ceiling,
      points: round(nextCeiling)
    },
    whyLikely: [
      "Projection is calibrated to team implied points so the box score sums like a real NBA game.",
      ...row.whyLikely.filter((reason) => !reason.toLowerCase().includes("calibrated"))
    ].slice(0, 4),
    source: row.source.includes("calibrated") ? row.source : `${row.source}+calibrated`
  };
}

function scaleCountingFields(row: NbaPlayerStatProjection, reboundFactor: number, assistFactor: number, threeFactor: number): NbaPlayerStatProjection {
  const rebounds = clamp(row.projectedRebounds * reboundFactor, 0, 18);
  const assists = clamp(row.projectedAssists * assistFactor, 0, 16);
  const threes = clamp(row.projectedThrees * threeFactor, 0, 8);

  return {
    ...row,
    projectedRebounds: round(rebounds),
    projectedAssists: round(assists),
    projectedThrees: round(threes),
    median: {
      ...row.median,
      rebounds: round(rebounds),
      assists: round(assists),
      threes: round(threes)
    },
    floor: {
      ...row.floor,
      rebounds: round(clamp(row.floor.rebounds * reboundFactor, 0, rebounds)),
      assists: round(clamp(row.floor.assists * assistFactor, 0, assists)),
      threes: round(clamp(row.floor.threes * threeFactor, 0, threes))
    },
    ceiling: {
      ...row.ceiling,
      rebounds: round(Math.max(rebounds, row.ceiling.rebounds * reboundFactor)),
      assists: round(Math.max(assists, row.ceiling.assists * assistFactor)),
      threes: round(Math.max(threes, row.ceiling.threes * threeFactor))
    }
  };
}

function calibrateSide(rows: NbaPlayerStatProjection[], side: TeamSide, targets: CalibrationTargets) {
  const sideRows = rows
    .filter((row) => row.teamSide === side)
    .sort((left, right) => playerWeight(right) - playerWeight(left));

  if (!sideRows.length) return [];

  const target = clamp(targetForSide(side, targets), 82, 142);
  const rawTotal = sum(sideRows, (row) => row.projectedPoints);
  const firstPassFactor = rawTotal > 0 ? clamp(target / rawTotal, 0.42, 1.12) : 1;

  const firstPass = sideRows.map((row, index) => {
    const weighted = row.projectedPoints * firstPassFactor;
    const capped = clamp(weighted, minPointsForRank(index), maxPointsForRank(index, target));
    return scalePointFields(row, capped);
  });

  const cappedTotal = sum(firstPass, (row) => row.projectedPoints);
  const residual = target - cappedTotal;
  const adjustable = firstPass.map((row, index) => ({ row, index, room: Math.max(0, maxPointsForRank(index, target) - row.projectedPoints) }));
  const totalRoom = sum(adjustable as any, (entry: any) => entry.room);

  const secondPass = firstPass.map((row, index) => {
    if (Math.abs(residual) < 0.2) return row;
    const room = Math.max(0, maxPointsForRank(index, target) - row.projectedPoints);
    const add = residual > 0 && totalRoom > 0
      ? residual * (room / totalRoom)
      : residual * (row.projectedPoints / Math.max(1, cappedTotal));
    return scalePointFields(row, clamp(row.projectedPoints + add, 0, maxPointsForRank(index, target)));
  });

  const reboundTarget = clamp(42 + (target - 112) * 0.04, 38, 50);
  const assistTarget = clamp(target * 0.235, 18, 33);
  const threeTarget = clamp(target * 0.105, 8, 19);
  const reboundFactor = reboundTarget / Math.max(1, sum(secondPass, (row) => row.projectedRebounds));
  const assistFactor = assistTarget / Math.max(1, sum(secondPass, (row) => row.projectedAssists));
  const threeFactor = threeTarget / Math.max(1, sum(secondPass, (row) => row.projectedThrees));

  return secondPass.map((row) => scaleCountingFields(
    row,
    clamp(reboundFactor, 0.65, 1.25),
    clamp(assistFactor, 0.62, 1.2),
    clamp(threeFactor, 0.55, 1.35)
  ));
}

export function calibrateNbaPlayerBoxScore(
  rows: NbaPlayerStatProjection[],
  targets: CalibrationTargets
): NbaPlayerStatProjection[] {
  const away = calibrateSide(rows, "away", targets);
  const home = calibrateSide(rows, "home", targets);
  const byKey = new Map([...away, ...home].map((row) => [`${row.teamSide}:${row.teamName}:${row.playerName}`, row]));
  return rows.map((row) => byKey.get(`${row.teamSide}:${row.teamName}:${row.playerName}`) ?? row);
}
