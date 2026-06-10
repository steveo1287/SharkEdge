type TeamSide = "away" | "home";

type HitterRow = {
  playerId: string;
  name: string;
  team: string;
  teamSide: TeamSide;
  battingOrder: number | null;
  plateAppearances: number | null;
  hits: number | null;
  totalBases: number | null;
  homeRuns: number | null;
  runs: number | null;
  rbi: number | null;
  strikeouts: number | null;
  stolenBaseChance: number | null;
  actual: unknown;
};

type PitcherRow = {
  playerId: string | null;
  name: string;
  team: string;
  teamSide: TeamSide;
  innings: number | null;
  outs: number | null;
  strikeouts: number | null;
  earnedRuns: number | null;
  hitsAllowed: number | null;
  walks: number | null;
  homeRuns: number | null;
  actual: unknown;
};

function hash(value: string) {
  let out = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    out ^= value.charCodeAt(index);
    out = Math.imul(out, 16777619);
  }
  return out >>> 0;
}

function unit(seed: string, salt: string) {
  return hash(`${seed}:${salt}`) / 0xffffffff;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function numeric(value: number | null | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function round(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function allocateInteger(total: number, weights: number[]) {
  const target = Math.max(0, Math.round(total));
  if (!weights.length) return [];
  const safeWeights = weights.map((weight) => Math.max(0.001, weight));
  const sum = safeWeights.reduce((acc, value) => acc + value, 0);
  const raw = safeWeights.map((weight) => target * weight / sum);
  const floors = raw.map(Math.floor);
  let remaining = target - floors.reduce((acc, value) => acc + value, 0);
  const order = raw.map((value, index) => ({ index, remainder: value - Math.floor(value) })).sort((a, b) => b.remainder - a.remainder);
  for (let index = 0; index < order.length && remaining > 0; index += 1) {
    floors[order[index].index] += 1;
    remaining -= 1;
  }
  return floors;
}

function targetRuns(projectedRuns: number | null | undefined) {
  return Math.max(0, Math.round(clamp(projectedRuns ?? 4.4, 0, 13)));
}

function targetHits(projectedRuns: number | null | undefined, seed: string) {
  const runs = clamp(projectedRuns ?? 4.4, 0, 13);
  return Math.max(1, Math.round(clamp(3.7 + runs * 1.18 + unit(seed, "team-hits") * 2.4, 3, 18)));
}

function targetHomers(projectedRuns: number | null | undefined, seed: string) {
  const runs = clamp(projectedRuns ?? 4.4, 0, 13);
  return Math.max(0, Math.round(clamp(runs * 0.21 + unit(seed, "team-hr") * 1.15 - 0.25, 0, 5)));
}

function orderWeight(row: HitterRow, index: number) {
  const order = row.battingOrder ?? index + 1;
  const base = [1.08, 1.05, 1.2, 1.28, 1.12, 0.96, 0.86, 0.76, 0.69][order - 1] ?? 0.72;
  const existing = numeric(row.totalBases, 0) * 0.18 + numeric(row.homeRuns, 0) * 0.65 + numeric(row.hits, 0) * 0.28;
  return base + existing + unit(`${row.team}:${row.playerId}:${row.name}`, "weight") * 0.25;
}

export function normalizeMlbFranchiseHitterRows<T extends HitterRow>(rows: T[], projectedRuns: number | null | undefined): T[] {
  const lineup = rows.slice(0, 9);
  if (!lineup.length) return rows;
  const seed = lineup[0]?.team ?? "team";
  const runTarget = targetRuns(projectedRuns);
  const hitTarget = targetHits(projectedRuns, seed);
  const hrTarget = Math.min(targetHomers(projectedRuns, seed), hitTarget);
  const rbiTarget = Math.max(0, runTarget - (runTarget >= 3 && unit(seed, "non-rbi") > 0.72 ? 1 : 0));
  const weights = lineup.map(orderWeight);
  const hits = allocateInteger(hitTarget, weights);
  const homeRuns = allocateInteger(hrTarget, weights.map((weight, index) => weight * (index >= 2 && index <= 5 ? 1.22 : 0.82)));
  const runs = allocateInteger(runTarget, weights.map((weight, index) => weight * (index <= 4 ? 1.12 : 0.84)));
  const rbi = allocateInteger(rbiTarget, weights.map((weight, index) => weight * (index >= 2 && index <= 6 ? 1.18 : 0.78)));
  const teamPas = clamp(34 + hitTarget + runTarget * 0.35 + unit(seed, "pa") * 3, 33, 54);
  const plateAppearances = allocateInteger(teamPas, weights.map((weight, index) => weight * (index <= 1 ? 1.08 : 1)));
  const strikeouts = allocateInteger(clamp(5.2 + unit(seed, "team-k") * 5.4, 3, 14), weights.map((weight) => Math.max(0.1, 1.5 - weight * 0.23)));

  return rows.map((row, index) => {
    if (index >= lineup.length) return row;
    const seedRow = `${row.team}:${row.playerId}:${row.name}`;
    const hr = Math.min(homeRuns[index], hits[index]);
    const singles = Math.max(0, hits[index] - hr);
    const extraBaseHits = Math.min(singles, Math.round(singles * (0.18 + unit(seedRow, "xbh") * 0.24)));
    const totalBases = hits[index] + hr * 3 + extraBaseHits;
    return {
      ...row,
      battingOrder: row.battingOrder ?? index + 1,
      plateAppearances: plateAppearances[index],
      hits: hits[index],
      totalBases,
      homeRuns: hr,
      runs: runs[index],
      rbi: rbi[index],
      strikeouts: strikeouts[index],
      stolenBaseChance: round(clamp(numeric(row.stolenBaseChance, 0.08), 0.01, 0.38), 2)
    };
  }) as T[];
}

function pitcherWeight(row: PitcherRow, index: number) {
  if (index === 0) return 2.25;
  return 1.1 - index * 0.16 + unit(`${row.team}:${row.playerId ?? row.name}`, "pen") * 0.25;
}

function normalizePitcherOuts(rows: PitcherRow[]) {
  if (!rows.length) return [];
  const starterOuts = Math.round(clamp(numeric(rows[0].outs, numeric(rows[0].innings, 5.1) * 3), 9, 21));
  const remaining = Math.max(0, 27 - starterOuts);
  const penWeights = rows.slice(1).map((row, index) => pitcherWeight(row, index + 1));
  const penOuts = allocateInteger(remaining, penWeights);
  return rows.map((row, index) => index === 0 ? starterOuts : penOuts[index - 1] ?? 0);
}

export function normalizeMlbFranchisePitcherRows<T extends PitcherRow>(rows: T[], opponentHitters: HitterRow[], opponentProjectedRuns: number | null | undefined): T[] {
  const staff = rows.slice(0, 4);
  if (!staff.length) return rows;
  const seed = staff[0]?.team ?? "staff";
  const runTarget = Math.max(0, Math.round(sum(opponentHitters, (row) => row.runs) || targetRuns(opponentProjectedRuns)));
  const hitTarget = Math.max(1, Math.round(sum(opponentHitters, (row) => row.hits) || targetHits(opponentProjectedRuns, seed)));
  const hrTarget = Math.max(0, Math.round(sum(opponentHitters, (row) => row.homeRuns) || targetHomers(opponentProjectedRuns, seed)));
  const erTarget = Math.max(0, runTarget - (runTarget >= 4 && unit(seed, "unearned") > 0.78 ? 1 : 0));
  const outs = normalizePitcherOuts(staff);
  const weights = staff.map(pitcherWeight);
  const earnedRuns = allocateInteger(erTarget, weights.map((weight, index) => weight * (index === 0 ? 0.7 : 1.25)));
  const hitsAllowed = allocateInteger(hitTarget, weights);
  const homeRuns = allocateInteger(hrTarget, weights.map((weight, index) => weight * (index === 0 ? 0.9 : 1.15)));
  const strikeouts = allocateInteger(clamp(sum(opponentHitters, (row) => row.strikeouts) || 7.6, 2, 18), weights);
  const walks = allocateInteger(clamp(2.1 + unit(seed, "staff-bb") * 3.2, 1, 8), weights.map((weight, index) => weight * (index === 0 ? 0.75 : 1.15)));

  return rows.map((row, index) => {
    if (index >= staff.length) return row;
    return {
      ...row,
      outs: outs[index],
      innings: round(outs[index] / 3, 2),
      strikeouts: strikeouts[index],
      earnedRuns: earnedRuns[index],
      hitsAllowed: hitsAllowed[index],
      walks: walks[index],
      homeRuns: Math.min(homeRuns[index], hitsAllowed[index])
    };
  }) as T[];
}

function sum<T>(rows: T[], read: (row: T) => number | null | undefined) {
  return rows.reduce((acc, row) => acc + numeric(read(row), 0), 0);
}
