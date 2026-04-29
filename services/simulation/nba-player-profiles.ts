import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { getMergedRealPlayerFeed } from "@/services/simulation/nba-real-player-feed";
import { normalizeNbaTeam } from "@/services/simulation/nba-team-analytics";

export type NbaPlayerProfile = {
  playerName: string;
  teamName: string;
  role: "star" | "starter" | "rotation" | "bench" | "unknown";
  status: "available" | "questionable" | "doubtful" | "out" | "unknown";
  projectedMinutes: number;
  usageRate: number;
  offensiveEpm: number;
  defensiveEpm: number;
  netImpact: number;
  onOffNet: number;
  trueShooting: number;
  assistRate: number;
  reboundRate: number;
  turnoverRate: number;
  rimPressure: number;
  threePointGravity: number;
  defensiveVersatility: number;
  pointOfAttackDefense: number;
  rimProtection: number;
  clutchImpact: number;
  fatigueRisk: number;
  source: "real" | "synthetic";
};

export type NbaTeamPlayerProfileSummary = {
  teamName: string;
  source: "real" | "synthetic";
  players: NbaPlayerProfile[];
  starPower: number;
  creationIndex: number;
  spacingIndex: number;
  playmakingIndex: number;
  glassIndex: number;
  defenseIndex: number;
  rimProtectionIndex: number;
  clutchIndex: number;
  fatigueRisk: number;
  availabilityDrag: number;
  rotationReliability: number;
  offensiveProfileBoost: number;
  defensiveProfileBoost: number;
  volatilityBoost: number;
  notes: string[];
};

const CACHE_KEY = "nba:player-profiles:v3";
const CACHE_TTL_SECONDS = 60 * 60 * 3;

const FALLBACK_ROSTERS: Record<string, string[]> = {
  bostonceltics: ["Jayson Tatum", "Jaylen Brown", "Derrick White", "Jrue Holiday", "Kristaps Porzingis", "Al Horford", "Payton Pritchard", "Sam Hauser"],
  brooklynnets: ["Cam Thomas", "Nic Claxton", "Cam Johnson", "Dennis Schroder", "Dorian Finney-Smith", "Noah Clowney", "Day'Ron Sharpe", "Trendon Watford"],
  newyorkknicks: ["Jalen Brunson", "Karl-Anthony Towns", "Mikal Bridges", "OG Anunoby", "Josh Hart", "Miles McBride", "Mitchell Robinson", "Precious Achiuwa"],
  philadelphia76ers: ["Joel Embiid", "Tyrese Maxey", "Paul George", "Kelly Oubre Jr.", "Caleb Martin", "Andre Drummond", "Eric Gordon", "Kyle Lowry"],
  torontoraptors: ["Scottie Barnes", "RJ Barrett", "Immanuel Quickley", "Jakob Poeltl", "Gradey Dick", "Bruce Brown", "Kelly Olynyk", "Ochai Agbaji"],
  milwaukeebucks: ["Giannis Antetokounmpo", "Damian Lillard", "Khris Middleton", "Brook Lopez", "Bobby Portis", "Gary Trent Jr.", "Taurean Prince", "AJ Green"],
  clevelandcavaliers: ["Donovan Mitchell", "Darius Garland", "Evan Mobley", "Jarrett Allen", "Max Strus", "Caris LeVert", "Isaac Okoro", "Dean Wade"],
  indianapacers: ["Tyrese Haliburton", "Pascal Siakam", "Myles Turner", "Bennedict Mathurin", "Andrew Nembhard", "Aaron Nesmith", "T.J. McConnell", "Obi Toppin"],
  chicagobulls: ["Zach LaVine", "Coby White", "Nikola Vucevic", "Josh Giddey", "Patrick Williams", "Ayo Dosunmu", "Lonzo Ball", "Matas Buzelis"],
  detroitpistons: ["Cade Cunningham", "Jaden Ivey", "Ausar Thompson", "Tobias Harris", "Jalen Duren", "Ron Holland", "Isaiah Stewart", "Malik Beasley"],
  atlantahawks: ["Trae Young", "Jalen Johnson", "De'Andre Hunter", "Dyson Daniels", "Onyeka Okongwu", "Bogdan Bogdanovic", "Zaccharie Risacher", "Clint Capela"],
  charlottehornets: ["LaMelo Ball", "Brandon Miller", "Miles Bridges", "Mark Williams", "Josh Green", "Grant Williams", "Tre Mann", "Nick Richards"],
  miamiheat: ["Jimmy Butler", "Bam Adebayo", "Tyler Herro", "Terry Rozier", "Duncan Robinson", "Jaime Jaquez Jr.", "Nikola Jovic", "Kevin Love"],
  orlandomagic: ["Paolo Banchero", "Franz Wagner", "Jalen Suggs", "Wendell Carter Jr.", "Cole Anthony", "Kentavious Caldwell-Pope", "Jonathan Isaac", "Anthony Black"],
  washingtonwizards: ["Jordan Poole", "Kyle Kuzma", "Bilal Coulibaly", "Jonas Valanciunas", "Alex Sarr", "Corey Kispert", "Malcolm Brogdon", "Bub Carrington"],
  denvernuggets: ["Nikola Jokic", "Jamal Murray", "Michael Porter Jr.", "Aaron Gordon", "Christian Braun", "Russell Westbrook", "Peyton Watson", "Julian Strawther"],
  minnesotatimberwolves: ["Anthony Edwards", "Julius Randle", "Rudy Gobert", "Jaden McDaniels", "Mike Conley", "Naz Reid", "Donte DiVincenzo", "Nickeil Alexander-Walker"],
  oklahomacitythunder: ["Shai Gilgeous-Alexander", "Jalen Williams", "Chet Holmgren", "Luguentz Dort", "Isaiah Hartenstein", "Cason Wallace", "Aaron Wiggins", "Alex Caruso"],
  portlandtrailblazers: ["Anfernee Simons", "Jerami Grant", "Shaedon Sharpe", "Scoot Henderson", "Deandre Ayton", "Deni Avdija", "Toumani Camara", "Donovan Clingan"],
  utahjazz: ["Lauri Markkanen", "Collin Sexton", "Keyonte George", "Walker Kessler", "John Collins", "Jordan Clarkson", "Taylor Hendricks", "Brice Sensabaugh"],
  dallasmavericks: ["Luka Doncic", "Kyrie Irving", "Klay Thompson", "P.J. Washington", "Daniel Gafford", "Dereck Lively II", "Naji Marshall", "Spencer Dinwiddie"],
  houstonrockets: ["Alperen Sengun", "Jalen Green", "Fred VanVleet", "Amen Thompson", "Jabari Smith Jr.", "Dillon Brooks", "Tari Eason", "Reed Sheppard"],
  memphisgrizzlies: ["Ja Morant", "Jaren Jackson Jr.", "Desmond Bane", "Marcus Smart", "Zach Edey", "Santi Aldama", "Brandon Clarke", "GG Jackson"],
  neworleanspelicans: ["Zion Williamson", "Brandon Ingram", "Dejounte Murray", "CJ McCollum", "Herbert Jones", "Trey Murphy III", "Yves Missi", "Jose Alvarado"],
  sanantoniospurs: ["Victor Wembanyama", "Devin Vassell", "De'Aaron Fox", "Stephon Castle", "Jeremy Sochan", "Keldon Johnson", "Chris Paul", "Harrison Barnes"],
  losangeleslakers: ["LeBron James", "Anthony Davis", "Austin Reaves", "Rui Hachimura", "D'Angelo Russell", "Jarred Vanderbilt", "Gabe Vincent", "Max Christie"],
  phoenixsuns: ["Kevin Durant", "Devin Booker", "Bradley Beal", "Tyus Jones", "Jusuf Nurkic", "Grayson Allen", "Royce O'Neale", "Ryan Dunn"],
  goldenstatewarriors: ["Stephen Curry", "Draymond Green", "Andrew Wiggins", "Jonathan Kuminga", "Brandin Podziemski", "Buddy Hield", "Kevon Looney", "Moses Moody"],
  sacramentokings: ["De'Aaron Fox", "Domantas Sabonis", "DeMar DeRozan", "Keegan Murray", "Malik Monk", "Kevin Huerter", "Keon Ellis", "Trey Lyles"],
  laclippers: ["Kawhi Leonard", "James Harden", "Norman Powell", "Ivica Zubac", "Derrick Jones Jr.", "Terance Mann", "Nicolas Batum", "Kris Dunn"]
};

const TEAM_ALIASES: Record<string, string> = {
  bos: "bostonceltics", bkn: "brooklynnets", bk: "brooklynnets", brk: "brooklynnets", nyk: "newyorkknicks", phi: "philadelphia76ers", phila: "philadelphia76ers", tor: "torontoraptors",
  mil: "milwaukeebucks", cle: "clevelandcavaliers", ind: "indianapacers", chi: "chicagobulls", det: "detroitpistons", atl: "atlantahawks", cha: "charlottehornets", mia: "miamiheat", orl: "orlandomagic", was: "washingtonwizards", wsh: "washingtonwizards",
  den: "denvernuggets", min: "minnesotatimberwolves", okc: "oklahomacitythunder", por: "portlandtrailblazers", uta: "utahjazz", dal: "dallasmavericks", hou: "houstonrockets", mem: "memphisgrizzlies", nop: "neworleanspelicans", no: "neworleanspelicans", sas: "sanantoniospurs", sa: "sanantoniospurs",
  lal: "losangeleslakers", lakers: "losangeleslakers", phx: "phoenixsuns", pho: "phoenixsuns", gsw: "goldenstatewarriors", gs: "goldenstatewarriors", sac: "sacramentokings", lac: "laclippers", clippers: "laclippers"
};

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash;
}

function seedUnit(seed: number) {
  return (seed % 1000) / 1000;
}

function range(seed: number, min: number, max: number) {
  return Number((min + seedUnit(seed) * (max - min)).toFixed(2));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roleFrom(value: unknown, minutes: number, usage: number): NbaPlayerProfile["role"] {
  const text = String(value ?? "").toLowerCase();
  if (["star", "starter", "rotation", "bench"].includes(text)) return text as NbaPlayerProfile["role"];
  if (minutes >= 32 && usage >= 25) return "star";
  if (minutes >= 26) return "starter";
  if (minutes >= 14) return "rotation";
  if (minutes > 0) return "bench";
  return "unknown";
}

function availabilityWeight(status: NbaPlayerProfile["status"]) {
  if (status === "out") return 1;
  if (status === "doubtful") return 0.75;
  if (status === "questionable") return 0.42;
  if (status === "unknown") return 0.15;
  return 0;
}

function fallbackNames(teamName: string) {
  const key = normalizeNbaTeam(teamName);
  const canonical = TEAM_ALIASES[key] ?? key;
  return FALLBACK_ROSTERS[canonical] ?? ["Primary Creator", "Secondary Scorer", "Starting Wing", "Starting Big", "Fifth Starter", "Sixth Man", "Rotation Forward", "Backup Big"];
}

function syntheticMinutes(seed: number, index: number) {
  if (index === 0) return range(seed, 31, 35);
  if (index === 1) return range(seed, 29, 33.5);
  if (index < 5) return range(seed, 23.5, 30.5);
  if (index < 8) return range(seed, 14, 23.5);
  return range(seed, 6, 13.5);
}

function syntheticUsage(seed: number, index: number) {
  if (index === 0) return range(seed, 23, 29);
  if (index === 1) return range(seed, 18.5, 24.5);
  if (index < 5) return range(seed, 11.5, 18.5);
  if (index < 8) return range(seed, 7.5, 14.5);
  return range(seed, 4.5, 9.5);
}

function syntheticOffense(seed: number, index: number) {
  if (index === 0) return range(seed, 1.0, 4.8);
  if (index === 1) return range(seed, 0.0, 3.0);
  if (index < 5) return range(seed, -1.6, 1.4);
  return range(seed, -2.8, 0.6);
}

function syntheticPlayers(teamName: string): NbaPlayerProfile[] {
  return fallbackNames(teamName).map((playerName, index) => {
    const seed = hashString(`${teamName}:${playerName}:conservative-profile:${index}`);
    const projectedMinutes = syntheticMinutes(seed, index);
    const usageRate = syntheticUsage(seed >>> 1, index);
    const offensiveEpm = syntheticOffense(seed >>> 2, index);
    const defensiveEpm = index < 5 ? range(seed >>> 3, -1.2, 1.6) : range(seed >>> 3, -1.8, 0.8);
    const assistRate = index === 0 ? range(seed >>> 6, 10, 26) : index < 3 ? range(seed >>> 6, 7, 19) : range(seed >>> 6, 3, 11);
    const reboundRate = index < 5 ? range(seed >>> 7, 4, 13) : range(seed >>> 7, 3, 10.5);
    const trueShooting = range(seed >>> 5, 52, 60.5);

    return {
      playerName,
      teamName,
      role: roleFrom(null, projectedMinutes, usageRate),
      status: "available",
      projectedMinutes,
      usageRate,
      offensiveEpm,
      defensiveEpm,
      netImpact: Number((offensiveEpm + defensiveEpm).toFixed(2)),
      onOffNet: range(seed >>> 4, -4, 5),
      trueShooting,
      assistRate,
      reboundRate,
      turnoverRate: range(seed >>> 8, 7, 15),
      rimPressure: range(seed >>> 9, 0, 7),
      threePointGravity: range(seed >>> 10, 0, 7),
      defensiveVersatility: range(seed >>> 11, 0, 8),
      pointOfAttackDefense: range(seed >>> 12, 0, 8),
      rimProtection: range(seed >>> 13, 0, 8),
      clutchImpact: range(seed >>> 14, -1.5, 2.5),
      fatigueRisk: range(seed >>> 15, 0.05, 0.65),
      source: "synthetic"
    };
  });
}

function sanitizeRealProfile(record: any): NbaPlayerProfile | null {
  if (!record?.playerName || !record?.teamName) return null;
  const projectedMinutes = clamp(Number(record.projectedMinutes ?? 0), 0, 38.5);
  const usageRate = clamp(Number(record.usageRate ?? 0), 3, 36);
  const offensiveEpm = clamp(Number(record.offensiveEpm ?? 0), -6, 8);
  const defensiveEpm = clamp(Number(record.defensiveEpm ?? 0), -5, 6);
  return {
    playerName: record.playerName,
    teamName: record.teamName,
    role: roleFrom(record.role, projectedMinutes, usageRate),
    status: record.status ?? "unknown",
    projectedMinutes,
    usageRate,
    offensiveEpm,
    defensiveEpm,
    netImpact: clamp(Number(record.netImpact ?? offensiveEpm + defensiveEpm), -8, 12),
    onOffNet: clamp(Number(record.onOffNet ?? 0), -16, 16),
    trueShooting: clamp(Number(record.trueShooting ?? 56), 43, 70),
    assistRate: clamp(Number(record.assistRate ?? 8), 0, 48),
    reboundRate: clamp(Number(record.reboundRate ?? 8), 0, 28),
    turnoverRate: clamp(Number(record.turnoverRate ?? 10), 0, 26),
    rimPressure: clamp(Number(record.rimPressure ?? 3), 0, 10),
    threePointGravity: clamp(Number(record.threePointGravity ?? 3), 0, 10),
    defensiveVersatility: clamp(Number(record.defensiveVersatility ?? 3), 0, 10),
    pointOfAttackDefense: clamp(Number(record.pointOfAttackDefense ?? 3), 0, 10),
    rimProtection: clamp(Number(record.rimProtection ?? 2), 0, 10),
    clutchImpact: clamp(Number(record.clutchImpact ?? 0), -5, 5),
    fatigueRisk: clamp(Number(record.fatigueRisk ?? 0.25), 0, 1),
    source: "real"
  };
}

async function fetchProfiles() {
  const cached = await readHotCache<Record<string, NbaPlayerProfile[]>>(CACHE_KEY);
  if (cached) return cached;

  const merged = await getMergedRealPlayerFeed();
  const grouped: Record<string, NbaPlayerProfile[]> = {};
  for (const record of merged) {
    const profile = sanitizeRealProfile(record);
    if (!profile) continue;
    const key = normalizeNbaTeam(profile.teamName);
    grouped[key] = [...(grouped[key] ?? []), profile];
  }

  if (Object.keys(grouped).length) {
    await writeHotCache(CACHE_KEY, grouped, CACHE_TTL_SECONDS);
    return grouped;
  }
  return null;
}

function weighted(players: NbaPlayerProfile[], selector: (player: NbaPlayerProfile) => number) {
  const active = players.filter((player) => availabilityWeight(player.status) < 1);
  const minutes = active.reduce((sum, player) => sum + Math.max(0, player.projectedMinutes), 0);
  if (!minutes) return 0;
  return Number((active.reduce((sum, player) => sum + selector(player) * Math.max(0, player.projectedMinutes), 0) / minutes).toFixed(2));
}

function normalizeRotation(players: NbaPlayerProfile[], source: "real" | "synthetic") {
  const active = [...players].filter((player) => availabilityWeight(player.status) < 1).sort((a, b) => b.projectedMinutes + b.usageRate * 0.15 - (a.projectedMinutes + a.usageRate * 0.15));
  if (source === "real") return active;
  return active.map((player, index) => ({
    ...player,
    projectedMinutes: Math.min(player.projectedMinutes, index === 0 ? 35 : index === 1 ? 33.5 : index < 5 ? 30.5 : index < 8 ? 23.5 : 13.5),
    usageRate: Math.min(player.usageRate, index === 0 ? 29 : index === 1 ? 24.5 : index < 5 ? 18.5 : index < 8 ? 14.5 : 9.5),
    role: roleFrom(player.role, player.projectedMinutes, player.usageRate)
  }));
}

export async function getNbaTeamPlayerProfileSummary(teamName: string): Promise<NbaTeamPlayerProfileSummary> {
  const grouped = await fetchProfiles();
  const key = normalizeNbaTeam(teamName);
  const realPlayers = grouped?.[key];
  const source: "real" | "synthetic" = realPlayers?.length ? "real" : "synthetic";
  const players = normalizeRotation(realPlayers?.length ? realPlayers : syntheticPlayers(teamName), source);
  const unavailable = players.filter((player) => availabilityWeight(player.status) > 0);
  const availabilityDrag = Number(unavailable.reduce((sum, player) => sum + Math.abs(player.netImpact) * availabilityWeight(player.status), 0).toFixed(2));
  const fatigueRisk = weighted(players, (player) => player.fatigueRisk);
  const starPower = weighted(players, (player) => player.role === "star" ? player.netImpact * 1.22 : player.netImpact);
  const creationIndex = weighted(players, (player) => player.usageRate * 0.16 + player.offensiveEpm + player.rimPressure * 0.18);
  const spacingIndex = weighted(players, (player) => player.trueShooting * 0.06 + player.threePointGravity * 0.48);
  const playmakingIndex = weighted(players, (player) => player.assistRate * 0.16 - player.turnoverRate * 0.1);
  const glassIndex = weighted(players, (player) => player.reboundRate * 0.22);
  const defenseIndex = weighted(players, (player) => player.defensiveEpm + player.defensiveVersatility * 0.22 + player.pointOfAttackDefense * 0.18);
  const rimProtectionIndex = weighted(players, (player) => player.rimProtection * 0.4);
  const clutchIndex = weighted(players, (player) => player.clutchImpact);
  const rotationReliability = Number(Math.max(0, 100 - availabilityDrag * 6 - fatigueRisk * 12).toFixed(2));

  return {
    teamName,
    source,
    players,
    starPower,
    creationIndex,
    spacingIndex,
    playmakingIndex,
    glassIndex,
    defenseIndex,
    rimProtectionIndex,
    clutchIndex,
    fatigueRisk,
    availabilityDrag,
    rotationReliability,
    offensiveProfileBoost: Number((creationIndex * 0.42 + spacingIndex * 0.18 + playmakingIndex * 0.2 + starPower * 0.18 - availabilityDrag * 0.35).toFixed(2)),
    defensiveProfileBoost: Number((defenseIndex * 0.43 + rimProtectionIndex * 0.26 + glassIndex * 0.12 - availabilityDrag * 0.18).toFixed(2)),
    volatilityBoost: Number(Math.min(1.55, 1 + availabilityDrag / 18 + fatigueRisk / 11 + (source === "synthetic" ? 0.08 : 0)).toFixed(2)),
    notes: [
      source === "real" ? "Merged real player feed applied with bounds on minutes, usage, efficiency, and fatigue." : "Conservative fallback roster applied; player prop confidence is capped until a real player feed or prop market line is available.",
      `Rotation reliability ${rotationReliability}/100.`
    ]
  };
}
