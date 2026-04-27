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

const CACHE_KEY = "nba:player-profiles:v2";
const CACHE_TTL_SECONDS = 60 * 60 * 6;

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

function hashString(value: string) { let hash = 0; for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0; return hash; }
function seedUnit(seed: number) { return (seed % 1000) / 1000; }
function range(seed: number, min: number, max: number) { return Number((min + seedUnit(seed) * (max - min)).toFixed(2)); }
function roleFrom(value: unknown, minutes: number, usage: number): NbaPlayerProfile["role"] { const text = String(value ?? "").toLowerCase(); if (["star", "starter", "rotation", "bench"].includes(text)) return text as NbaPlayerProfile["role"]; if (minutes >= 32 && usage >= 25) return "star"; if (minutes >= 26) return "starter"; if (minutes >= 14) return "rotation"; if (minutes > 0) return "bench"; return "unknown"; }
function availabilityWeight(status: NbaPlayerProfile["status"]) { if (status === "out") return 1; if (status === "doubtful") return 0.75; if (status === "questionable") return 0.42; if (status === "unknown") return 0.15; return 0; }

function fallbackNames(teamName: string) {
  const key = normalizeNbaTeam(teamName);
  const canonical = TEAM_ALIASES[key] ?? key;
  return FALLBACK_ROSTERS[canonical] ?? ["Primary Creator", "Secondary Scorer", "Starting Wing", "Starting Big", "Fifth Starter", "Sixth Man", "Rotation Forward", "Backup Big"];
}

function syntheticPlayers(teamName: string): NbaPlayerProfile[] {
  return fallbackNames(teamName).map((playerName, index) => {
    const seed = hashString(`${teamName}:${playerName}:fallback-profile:${index}`);
    const projectedMinutes = index === 0 ? range(seed, 34, 37) : index < 5 ? range(seed, 25, 34) : range(seed, 17, 26);
    const usageRate = index === 0 ? range(seed >>> 1, 28, 34) : index < 3 ? range(seed >>> 1, 20, 28) : index < 5 ? range(seed >>> 1, 13, 21) : range(seed >>> 1, 9, 18);
    const offensiveEpm = index === 0 ? range(seed >>> 2, 2.6, 7.2) : index < 3 ? range(seed >>> 2, 0.4, 3.8) : range(seed >>> 2, -1.6, 1.8);
    const defensiveEpm = index < 5 ? range(seed >>> 3, -0.8, 2.4) : range(seed >>> 3, -1.3, 1.2);
    return { playerName, teamName, role: roleFrom(null, projectedMinutes, usageRate), status: "available", projectedMinutes, usageRate, offensiveEpm, defensiveEpm, netImpact: Number((offensiveEpm + defensiveEpm).toFixed(2)), onOffNet: range(seed >>> 4, -4, 8), trueShooting: range(seed >>> 5, 53, 64), assistRate: range(seed >>> 6, 6, 32), reboundRate: range(seed >>> 7, 4, 18), turnoverRate: range(seed >>> 8, 6, 16), rimPressure: range(seed >>> 9, 0, 10), threePointGravity: range(seed >>> 10, 0, 10), defensiveVersatility: range(seed >>> 11, 0, 10), pointOfAttackDefense: range(seed >>> 12, 0, 10), rimProtection: range(seed >>> 13, 0, 10), clutchImpact: range(seed >>> 14, -2, 4), fatigueRisk: range(seed >>> 15, 0, 1), source: "synthetic" };
  });
}

async function fetchProfiles() {
  const cached = await readHotCache<Record<string, NbaPlayerProfile[]>>(CACHE_KEY);
  if (cached) return cached;
  const merged = await getMergedRealPlayerFeed();
  const grouped: Record<string, NbaPlayerProfile[]> = {};
  for (const record of merged) {
    const profile: NbaPlayerProfile = {
      playerName: record.playerName,
      teamName: record.teamName,
      role: roleFrom(null, record.projectedMinutes, record.usageRate),
      status: record.status,
      projectedMinutes: record.projectedMinutes,
      usageRate: record.usageRate,
      offensiveEpm: record.offensiveEpm,
      defensiveEpm: record.defensiveEpm,
      netImpact: record.netImpact,
      onOffNet: record.onOffNet,
      trueShooting: record.trueShooting,
      assistRate: record.assistRate,
      reboundRate: record.reboundRate,
      turnoverRate: record.turnoverRate,
      rimPressure: record.rimPressure,
      threePointGravity: record.threePointGravity,
      defensiveVersatility: record.defensiveVersatility,
      pointOfAttackDefense: record.pointOfAttackDefense,
      rimProtection: record.rimProtection,
      clutchImpact: record.clutchImpact,
      fatigueRisk: record.fatigueRisk,
      source: "real"
    };
    const key = normalizeNbaTeam(profile.teamName);
    grouped[key] = [...(grouped[key] ?? []), profile];
  }
  if (Object.keys(grouped).length) {
    await writeHotCache(CACHE_KEY, grouped, CACHE_TTL_SECONDS);
    return grouped;
  }
  return null;
}

function weighted(players: NbaPlayerProfile[], selector: (player: NbaPlayerProfile) => number) { const active = players.filter((player) => availabilityWeight(player.status) < 1); const minutes = active.reduce((sum, player) => sum + Math.max(0, player.projectedMinutes), 0); if (!minutes) return 0; return Number((active.reduce((sum, player) => sum + selector(player) * Math.max(0, player.projectedMinutes), 0) / minutes).toFixed(2)); }

export async function getNbaTeamPlayerProfileSummary(teamName: string): Promise<NbaTeamPlayerProfileSummary> {
  const grouped = await fetchProfiles();
  const players = grouped?.[normalizeNbaTeam(teamName)] ?? syntheticPlayers(teamName);
  const source = players.some((player) => player.source === "real") ? "real" : "synthetic";
  const unavailable = players.filter((player) => availabilityWeight(player.status) > 0);
  const availabilityDrag = Number(unavailable.reduce((sum, player) => sum + Math.abs(player.netImpact) * availabilityWeight(player.status), 0).toFixed(2));
  const fatigueRisk = weighted(players, (player) => player.fatigueRisk);
  const starPower = weighted(players, (player) => player.role === "star" ? player.netImpact * 1.25 : player.netImpact);
  const creationIndex = weighted(players, (player) => player.usageRate * 0.18 + player.offensiveEpm + player.rimPressure * 0.25);
  const spacingIndex = weighted(players, (player) => player.trueShooting * 0.08 + player.threePointGravity * 0.7);
  const playmakingIndex = weighted(players, (player) => player.assistRate * 0.18 - player.turnoverRate * 0.12);
  const glassIndex = weighted(players, (player) => player.reboundRate * 0.25);
  const defenseIndex = weighted(players, (player) => player.defensiveEpm + player.defensiveVersatility * 0.25 + player.pointOfAttackDefense * 0.22);
  const rimProtectionIndex = weighted(players, (player) => player.rimProtection * 0.45);
  const clutchIndex = weighted(players, (player) => player.clutchImpact);
  const rotationReliability = Number(Math.max(0, 100 - availabilityDrag * 6 - fatigueRisk * 12).toFixed(2));
  return { teamName, source, players, starPower, creationIndex, spacingIndex, playmakingIndex, glassIndex, defenseIndex, rimProtectionIndex, clutchIndex, fatigueRisk, availabilityDrag, rotationReliability, offensiveProfileBoost: Number((creationIndex * 0.45 + spacingIndex * 0.24 + playmakingIndex * 0.22 + starPower * 0.2 - availabilityDrag * 0.35).toFixed(2)), defensiveProfileBoost: Number((defenseIndex * 0.45 + rimProtectionIndex * 0.28 + glassIndex * 0.14 - availabilityDrag * 0.18).toFixed(2)), volatilityBoost: Number(Math.min(1.6, 1 + availabilityDrag / 18 + fatigueRisk / 10).toFixed(2)), notes: [source === "real" ? "Merged real player feed applied." : "Recognizable fallback roster applied because live player feeds are unavailable.", `Rotation reliability ${rotationReliability}/100.`] };
}
