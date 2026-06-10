type FranchiseTeamSide = "away" | "home";

type RosterPlayer = {
  id: string;
  name: string;
  position: string | null;
};

type HitterLine = {
  playerId: string;
  name: string;
  team: string;
  teamSide: FranchiseTeamSide;
  battingOrder: number | null;
  plateAppearances: number | null;
  hits: number | null;
  totalBases: number | null;
  homeRuns: number | null;
  runs: number | null;
  rbi: number | null;
  strikeouts: number | null;
  stolenBaseChance: number | null;
  actual: null;
};

type PitcherLine = {
  playerId: string | null;
  name: string;
  team: string;
  teamSide: FranchiseTeamSide;
  innings: number | null;
  outs: number | null;
  strikeouts: number | null;
  earnedRuns: number | null;
  hitsAllowed: number | null;
  walks: number | null;
  homeRuns: number | null;
  actual: null;
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

function round(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function isPitcher(position: string | null | undefined) {
  const normalized = String(position ?? "").toUpperCase();
  return normalized === "P" || normalized.includes("PITCH");
}

function positionBoost(position: string | null | undefined) {
  const pos = String(position ?? "").toUpperCase();
  if (["DH", "1B", "LF", "RF"].includes(pos)) return 1.12;
  if (["3B", "CF", "C"].includes(pos)) return 1.04;
  if (["SS", "2B"].includes(pos)) return 0.96;
  return 1;
}

function orderWeight(order: number) {
  return [1.1, 1.08, 1.18, 1.24, 1.1, 0.96, 0.86, 0.78, 0.7][order - 1] ?? 0.78;
}

function allocateInteger(total: number, weights: number[]) {
  const target = Math.max(0, Math.round(total));
  const sum = weights.reduce((acc, value) => acc + Math.max(0.001, value), 0);
  const raw = weights.map((weight) => target * Math.max(0.001, weight) / sum);
  const floors = raw.map(Math.floor);
  let remaining = target - floors.reduce((acc, value) => acc + value, 0);
  const order = raw.map((value, index) => ({ index, remainder: value - Math.floor(value) })).sort((a, b) => b.remainder - a.remainder);
  for (let index = 0; index < order.length && remaining > 0; index += 1) {
    floors[order[index].index] += 1;
    remaining -= 1;
  }
  return floors;
}

function sortRosterHitters(players: RosterPlayer[]) {
  const positionRank = new Map<string, number>([["CF", 1], ["SS", 2], ["RF", 3], ["1B", 4], ["DH", 5], ["LF", 6], ["3B", 7], ["2B", 8], ["C", 9]]);
  return players
    .filter((player) => !isPitcher(player.position))
    .sort((a, b) => (positionRank.get(String(a.position ?? "").toUpperCase()) ?? 20) - (positionRank.get(String(b.position ?? "").toUpperCase()) ?? 20) || a.name.localeCompare(b.name))
    .slice(0, 9);
}

function sortRosterPitchers(players: RosterPlayer[]) {
  return players.filter((player) => isPitcher(player.position)).sort((a, b) => a.name.localeCompare(b.name));
}

export function buildSimulatedFranchiseHitters(args: {
  players: RosterPlayer[];
  teamName: string;
  teamSide: FranchiseTeamSide;
  projectedRuns: number | null;
}): HitterLine[] {
  const lineup = sortRosterHitters(args.players);
  if (lineup.length < 5) return [];
  const rows = lineup.slice(0, 9);
  const projectedRuns = clamp(args.projectedRuns ?? 4.4, 1.5, 10.5);
  const projectedHits = clamp(projectedRuns * 2.05 + unit(args.teamName, "hits") * 1.4 - 0.7, 4, 18);
  const projectedHomers = clamp(projectedRuns * 0.28 + unit(args.teamName, "hr") * 0.9 - 0.25, 0, 5);
  const weights = rows.map((player, index) => orderWeight(index + 1) * positionBoost(player.position) * (0.88 + unit(`${args.teamName}:${player.id}`, "skill") * 0.28));
  const hits = allocateInteger(projectedHits, weights);
  const homers = allocateInteger(projectedHomers, weights.map((weight, index) => weight * (index >= 2 && index <= 5 ? 1.18 : 0.88)));
  const runs = allocateInteger(projectedRuns, weights.map((weight, index) => weight * (index <= 4 ? 1.08 : 0.9)));
  const rbi = allocateInteger(projectedRuns, weights.map((weight, index) => weight * (index >= 2 && index <= 6 ? 1.12 : 0.82)));

  return rows.map((player, index) => {
    const seed = `${args.teamName}:${player.id}:${player.name}`;
    const plateAppearances = clamp(4.35 - index * 0.08 + unit(seed, "pa") * 0.35, 3.4, 5.2);
    const doublesTriples = Math.max(0, hits[index] - homers[index]) * (0.25 + unit(seed, "xbh") * 0.35);
    const totalBases = hits[index] + homers[index] * 3 + doublesTriples;
    return {
      playerId: player.id,
      name: player.name,
      team: args.teamName,
      teamSide: args.teamSide,
      battingOrder: index + 1,
      plateAppearances: round(plateAppearances, 1),
      hits: hits[index],
      totalBases: round(totalBases, 1),
      homeRuns: homers[index],
      runs: runs[index],
      rbi: rbi[index],
      strikeouts: round(clamp(plateAppearances * (0.15 + unit(seed, "k") * 0.22), 0.2, 3.1), 1),
      stolenBaseChance: round(clamp((index <= 1 ? 0.12 : 0.04) + unit(seed, "sb") * 0.18, 0.01, 0.42), 2),
      actual: null
    };
  });
}

export function buildSimulatedFranchisePitchers(args: {
  players: RosterPlayer[];
  teamName: string;
  teamSide: FranchiseTeamSide;
  starter: PitcherLine | null;
  opponentProjectedRuns: number | null;
  opponentProjectedHits: number | null;
}): PitcherLine[] {
  const staff = sortRosterPitchers(args.players);
  const starter = args.starter ?? null;
  const starterId = starter?.playerId ?? null;
  const bullpenNames = staff.filter((player) => !starterId || player.id !== starterId).slice(0, 3);
  const opponentRuns = clamp(args.opponentProjectedRuns ?? 4.4, 1.5, 10.5);
  const opponentHits = clamp(args.opponentProjectedHits ?? opponentRuns * 2.05, 4, 18);

  const starterLine = starter ? {
    ...starter,
    actual: null,
    hitsAllowed: starter.hitsAllowed ?? round(opponentHits * 0.58, 1),
    earnedRuns: starter.earnedRuns ?? round(opponentRuns * 0.58, 1),
    walks: starter.walks ?? round(1.3 + unit(`${starter.name}:${args.teamName}`, "bb") * 1.4, 1),
    homeRuns: starter.homeRuns ?? round(Math.max(0, opponentRuns * 0.13 + unit(`${starter.name}:${args.teamName}`, "hr") * 0.5), 1)
  } : null;

  const starterOuts = starterLine?.outs ?? 0;
  const bullpenOuts = Math.max(0, 27 - starterOuts);
  const bullpenRuns = Math.max(0, opponentRuns - (starterLine?.earnedRuns ?? 0));
  const bullpenHits = Math.max(0, opponentHits - (starterLine?.hitsAllowed ?? 0));
  const bullpenStrikeouts = Math.max(1, bullpenOuts * 0.24 + unit(args.teamName, "pen-k") * 2.4);
  const penWeights = bullpenNames.map((player, index) => 1 - index * 0.18 + unit(`${args.teamName}:${player.id}`, "usage") * 0.25);
  const penOuts = allocateInteger(bullpenOuts, penWeights);
  const penRuns = allocateInteger(bullpenRuns, penWeights);
  const penHits = allocateInteger(bullpenHits, penWeights);
  const penKs = allocateInteger(bullpenStrikeouts, penWeights);

  const bullpen = bullpenNames.map((player, index) => ({
    playerId: player.id,
    name: player.name,
    team: args.teamName,
    teamSide: args.teamSide,
    innings: round(penOuts[index] / 3, 2),
    outs: penOuts[index],
    strikeouts: penKs[index],
    earnedRuns: penRuns[index],
    hitsAllowed: penHits[index],
    walks: round(clamp(penOuts[index] / 9 + unit(`${player.id}:bb`, args.teamName), 0, 3), 1),
    homeRuns: round(clamp(penRuns[index] * 0.25 + unit(`${player.id}:hr`, args.teamName) * 0.4, 0, 2), 1),
    actual: null
  }));

  return [starterLine, ...bullpen].filter((row): row is PitcherLine => Boolean(row));
}
