import type { OpportunityView } from "@/lib/types/opportunity";
import type { VenueWeatherJoinView, WeatherExposure, WeatherJoinStatus, WeatherRoofType } from "@/services/weather/provider-types";

type VenueSeed = {
  teamKey: string;
  teamAliases: string[];
  venueKey: string;
  venueName: string;
  stationCode: string;
  stationName: string;
  roofType: WeatherRoofType;
  weatherExposure: WeatherExposure;
  altitudeFeet?: number | null;
  parkFactorNote?: string | null;
  windSensitivity: VenueWeatherJoinView["windSensitivity"];
};

const MLB_VENUES: VenueSeed[] = [
  { teamKey: "arizona diamondbacks", teamAliases: ["diamondbacks", "d-backs", "dbacks", "arizona"], venueKey: "chase-field", venueName: "Chase Field", stationCode: "KPHX", stationName: "Phoenix Sky Harbor", roofType: "RETRACTABLE", weatherExposure: "MIXED", altitudeFeet: 1135, parkFactorNote: "Retractable roof changes carry and heat effects materially.", windSensitivity: "MEDIUM" },
  { teamKey: "atlanta braves", teamAliases: ["braves", "atlanta"], venueKey: "truist-park", venueName: "Truist Park", stationCode: "KFTY", stationName: "Fulton County", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 1040, parkFactorNote: "Open-air park with weather-sensitive carry and humidity effects.", windSensitivity: "HIGH" },
  { teamKey: "baltimore orioles", teamAliases: ["orioles", "baltimore"], venueKey: "camden-yards", venueName: "Oriole Park at Camden Yards", stationCode: "KBWI", stationName: "Baltimore/Washington", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 146, parkFactorNote: "Open-air East Coast park; wind and summer humidity matter.", windSensitivity: "HIGH" },
  { teamKey: "boston red sox", teamAliases: ["red sox", "boston"], venueKey: "fenway-park", venueName: "Fenway Park", stationCode: "KBOS", stationName: "Boston Logan", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 19, parkFactorNote: "Historic open-air park with notable directional wind effects.", windSensitivity: "HIGH" },
  { teamKey: "chicago cubs", teamAliases: ["cubs"], venueKey: "wrigley-field", venueName: "Wrigley Field", stationCode: "KORD", stationName: "Chicago O'Hare", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 672, parkFactorNote: "Wrigley is one of the most weather-sensitive run environments in MLB.", windSensitivity: "HIGH" },
  { teamKey: "chicago white sox", teamAliases: ["white sox"], venueKey: "rate-field", venueName: "Rate Field", stationCode: "KMDW", stationName: "Chicago Midway", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 620, parkFactorNote: "Open-air park where wind and heat can change HR carry.", windSensitivity: "HIGH" },
  { teamKey: "cincinnati reds", teamAliases: ["reds", "cincinnati"], venueKey: "great-american-ball-park", venueName: "Great American Ball Park", stationCode: "KLUK", stationName: "Cincinnati Lunken", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 483, parkFactorNote: "Run-friendly environment that amplifies warm-weather carry.", windSensitivity: "HIGH" },
  { teamKey: "cleveland guardians", teamAliases: ["guardians", "cleveland"], venueKey: "progressive-field", venueName: "Progressive Field", stationCode: "KCLE", stationName: "Cleveland Hopkins", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 791, parkFactorNote: "Open-air park; cold and lake-influenced weather can suppress offense.", windSensitivity: "MEDIUM" },
  { teamKey: "colorado rockies", teamAliases: ["rockies", "colorado"], venueKey: "coors-field", venueName: "Coors Field", stationCode: "KDEN", stationName: "Denver", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 5180, parkFactorNote: "Extreme altitude environment; weather and carry effects are amplified.", windSensitivity: "HIGH" },
  { teamKey: "detroit tigers", teamAliases: ["tigers", "detroit"], venueKey: "comerica-park", venueName: "Comerica Park", stationCode: "KDET", stationName: "Detroit City", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 626, parkFactorNote: "Open-air park; early-season cold can matter.", windSensitivity: "MEDIUM" },
  { teamKey: "houston astros", teamAliases: ["astros", "houston"], venueKey: "daikin-park", venueName: "Daikin Park", stationCode: "KHOU", stationName: "Houston Hobby", roofType: "RETRACTABLE", weatherExposure: "MIXED", altitudeFeet: 46, parkFactorNote: "Retractable roof reduces some weather variance when closed.", windSensitivity: "LOW" },
  { teamKey: "kansas city royals", teamAliases: ["royals", "kansas city"], venueKey: "kauffman-stadium", venueName: "Kauffman Stadium", stationCode: "KMCI", stationName: "Kansas City", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 1026, parkFactorNote: "Open-air park; wind and summer heat can matter.", windSensitivity: "MEDIUM" },
  { teamKey: "los angeles angels", teamAliases: ["angels"], venueKey: "angel-stadium", venueName: "Angel Stadium", stationCode: "KSNA", stationName: "John Wayne", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 56, parkFactorNote: "Open-air Southern California park with moderate weather sensitivity.", windSensitivity: "MEDIUM" },
  { teamKey: "los angeles dodgers", teamAliases: ["dodgers"], venueKey: "dodger-stadium", venueName: "Dodger Stadium", stationCode: "KBUR", stationName: "Burbank", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 620, parkFactorNote: "Open-air park with moderate marine-layer and temperature effects.", windSensitivity: "MEDIUM" },
  { teamKey: "miami marlins", teamAliases: ["marlins", "miami"], venueKey: "loan-depot-park", venueName: "loanDepot park", stationCode: "KMIA", stationName: "Miami", roofType: "RETRACTABLE", weatherExposure: "MIXED", altitudeFeet: 8, parkFactorNote: "Retractable roof moderates weather effects when closed.", windSensitivity: "LOW" },
  { teamKey: "milwaukee brewers", teamAliases: ["brewers", "milwaukee"], venueKey: "american-family-field", venueName: "American Family Field", stationCode: "KMKE", stationName: "Milwaukee", roofType: "RETRACTABLE", weatherExposure: "MIXED", altitudeFeet: 723, parkFactorNote: "Retractable roof sharply changes weather relevance.", windSensitivity: "LOW" },
  { teamKey: "minnesota twins", teamAliases: ["twins", "minnesota"], venueKey: "target-field", venueName: "Target Field", stationCode: "KMSP", stationName: "Minneapolis/St Paul", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 840, parkFactorNote: "Cold early-season weather can materially suppress offense.", windSensitivity: "MEDIUM" },
  { teamKey: "new york mets", teamAliases: ["mets"], venueKey: "citi-field", venueName: "Citi Field", stationCode: "KLGA", stationName: "LaGuardia", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 20, parkFactorNote: "Open-air park with meaningful wind-direction sensitivity.", windSensitivity: "HIGH" },
  { teamKey: "new york yankees", teamAliases: ["yankees"], venueKey: "yankee-stadium", venueName: "Yankee Stadium", stationCode: "KLGA", stationName: "LaGuardia", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 55, parkFactorNote: "Open-air park where warm weather and wind can drive carry.", windSensitivity: "HIGH" },
  { teamKey: "oakland athletics", teamAliases: ["athletics", "a's", "as"], venueKey: "sutter-health-park", venueName: "Sutter Health Park", stationCode: "KSMF", stationName: "Sacramento", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 26, parkFactorNote: "Temporary/relocated open-air context; local wind and heat matter.", windSensitivity: "MEDIUM" },
  { teamKey: "philadelphia phillies", teamAliases: ["phillies", "philadelphia"], venueKey: "citizens-bank-park", venueName: "Citizens Bank Park", stationCode: "KPHL", stationName: "Philadelphia", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 36, parkFactorNote: "Open-air park that can play smaller in warm or windy conditions.", windSensitivity: "HIGH" },
  { teamKey: "pittsburgh pirates", teamAliases: ["pirates", "pittsburgh"], venueKey: "pnc-park", venueName: "PNC Park", stationCode: "KPIT", stationName: "Pittsburgh", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 1187, parkFactorNote: "Open-air riverfront environment with weather sensitivity.", windSensitivity: "MEDIUM" },
  { teamKey: "san diego padres", teamAliases: ["padres", "san diego"], venueKey: "petco-park", venueName: "Petco Park", stationCode: "KSAN", stationName: "San Diego", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 62, parkFactorNote: "Marine-layer and coastal weather can suppress carry.", windSensitivity: "MEDIUM" },
  { teamKey: "san francisco giants", teamAliases: ["giants", "san francisco"], venueKey: "oracle-park", venueName: "Oracle Park", stationCode: "KSFO", stationName: "San Francisco", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 13, parkFactorNote: "One of the most wind-sensitive parks in MLB.", windSensitivity: "HIGH" },
  { teamKey: "seattle mariners", teamAliases: ["mariners", "seattle"], venueKey: "t-mobile-park", venueName: "T-Mobile Park", stationCode: "KSEA", stationName: "Seattle-Tacoma", roofType: "RETRACTABLE", weatherExposure: "MIXED", altitudeFeet: 433, parkFactorNote: "Retractable roof creates split weather relevance.", windSensitivity: "LOW" },
  { teamKey: "st. louis cardinals", teamAliases: ["cardinals", "st louis", "st. louis"], venueKey: "busch-stadium", venueName: "Busch Stadium", stationCode: "KSTL", stationName: "St. Louis", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 618, parkFactorNote: "Open-air park where summer heat can raise offensive conditions.", windSensitivity: "MEDIUM" },
  { teamKey: "tampa bay rays", teamAliases: ["rays", "tampa bay"], venueKey: "steinbrenner-field", venueName: "George M. Steinbrenner Field", stationCode: "KTPA", stationName: "Tampa", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 26, parkFactorNote: "Current open-air setup makes Florida heat and storms relevant.", windSensitivity: "MEDIUM" },
  { teamKey: "texas rangers", teamAliases: ["rangers", "texas"], venueKey: "globe-life-field", venueName: "Globe Life Field", stationCode: "KDFW", stationName: "Dallas/Fort Worth", roofType: "RETRACTABLE", weatherExposure: "MIXED", altitudeFeet: 551, parkFactorNote: "Retractable roof materially changes Texas heat and wind exposure.", windSensitivity: "LOW" },
  { teamKey: "toronto blue jays", teamAliases: ["blue jays", "jays", "toronto"], venueKey: "rogers-centre", venueName: "Rogers Centre", stationCode: "CYYZ", stationName: "Toronto Pearson", roofType: "RETRACTABLE", weatherExposure: "MIXED", altitudeFeet: 569, parkFactorNote: "Roof status matters more than ambient weather when closed.", windSensitivity: "LOW" },
  { teamKey: "washington nationals", teamAliases: ["nationals", "nats", "washington"], venueKey: "nationals-park", venueName: "Nationals Park", stationCode: "KDCA", stationName: "Reagan National", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 15, parkFactorNote: "Open-air park with warm, humid summer effects.", windSensitivity: "MEDIUM" }
];

const NFL_VENUES: VenueSeed[] = [
  { teamKey: "arizona cardinals", teamAliases: ["cardinals"], venueKey: "state-farm-stadium", venueName: "State Farm Stadium", stationCode: "KPHX", stationName: "Phoenix Sky Harbor", roofType: "RETRACTABLE", weatherExposure: "MIXED", altitudeFeet: 1135, parkFactorNote: "Retractable roof can sharply reduce weather impact.", windSensitivity: "LOW" },
  { teamKey: "atlanta falcons", teamAliases: ["falcons"], venueKey: "mercedes-benz-stadium", venueName: "Mercedes-Benz Stadium", stationCode: "KATL", stationName: "Atlanta", roofType: "FIXED_DOME", weatherExposure: "INDOOR", altitudeFeet: 1026, parkFactorNote: "Indoor venue largely removes weather effects.", windSensitivity: "NOT_APPLICABLE" },
  { teamKey: "baltimore ravens", teamAliases: ["ravens"], venueKey: "m-and-t-bank-stadium", venueName: "M&T Bank Stadium", stationCode: "KBWI", stationName: "Baltimore/Washington", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 146, parkFactorNote: "Open-air stadium with meaningful wind/cold effects.", windSensitivity: "HIGH" },
  { teamKey: "buffalo bills", teamAliases: ["bills"], venueKey: "highmark-stadium", venueName: "Highmark Stadium", stationCode: "KBUF", stationName: "Buffalo", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 724, parkFactorNote: "One of the highest weather-sensitivity NFL venues.", windSensitivity: "HIGH" },
  { teamKey: "carolina panthers", teamAliases: ["panthers"], venueKey: "bank-of-america-stadium", venueName: "Bank of America Stadium", stationCode: "KCLT", stationName: "Charlotte", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 748, parkFactorNote: "Open-air venue with moderate wind and precipitation effects.", windSensitivity: "MEDIUM" },
  { teamKey: "chicago bears", teamAliases: ["bears"], venueKey: "soldier-field", venueName: "Soldier Field", stationCode: "KORD", stationName: "Chicago O'Hare", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 672, parkFactorNote: "Cold and lake wind can heavily affect scoring and passing.", windSensitivity: "HIGH" },
  { teamKey: "cincinnati bengals", teamAliases: ["bengals"], venueKey: "paycor-stadium", venueName: "Paycor Stadium", stationCode: "KLUK", stationName: "Cincinnati Lunken", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 483, parkFactorNote: "Open-air Ohio River venue; weather can matter late season.", windSensitivity: "MEDIUM" },
  { teamKey: "cleveland browns", teamAliases: ["browns"], venueKey: "huntington-bank-field", venueName: "Huntington Bank Field", stationCode: "KCLE", stationName: "Cleveland Hopkins", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 791, parkFactorNote: "Lake-influenced wind and cold can be major.", windSensitivity: "HIGH" },
  { teamKey: "dallas cowboys", teamAliases: ["cowboys"], venueKey: "at-and-t-stadium", venueName: "AT&T Stadium", stationCode: "KDFW", stationName: "Dallas/Fort Worth", roofType: "RETRACTABLE", weatherExposure: "MIXED", altitudeFeet: 551, parkFactorNote: "Retractable roof reduces weather impact when closed.", windSensitivity: "LOW" },
  { teamKey: "denver broncos", teamAliases: ["broncos"], venueKey: "empower-field", venueName: "Empower Field at Mile High", stationCode: "KDEN", stationName: "Denver", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 5280, parkFactorNote: "Altitude amplifies kick distance and environmental effects.", windSensitivity: "MEDIUM" },
  { teamKey: "detroit lions", teamAliases: ["lions"], venueKey: "ford-field", venueName: "Ford Field", stationCode: "KDTW", stationName: "Detroit Metro", roofType: "FIXED_DOME", weatherExposure: "INDOOR", altitudeFeet: 645, parkFactorNote: "Indoor venue largely removes weather noise.", windSensitivity: "NOT_APPLICABLE" },
  { teamKey: "green bay packers", teamAliases: ["packers"], venueKey: "lambeau-field", venueName: "Lambeau Field", stationCode: "KGRB", stationName: "Green Bay", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 695, parkFactorNote: "Classic cold-weather stadium; weather matters materially.", windSensitivity: "HIGH" },
  { teamKey: "houston texans", teamAliases: ["texans"], venueKey: "nrg-stadium", venueName: "NRG Stadium", stationCode: "KHOU", stationName: "Houston Hobby", roofType: "RETRACTABLE", weatherExposure: "MIXED", altitudeFeet: 46, parkFactorNote: "Retractable roof moderates weather when closed.", windSensitivity: "LOW" },
  { teamKey: "indianapolis colts", teamAliases: ["colts"], venueKey: "lucas-oil-stadium", venueName: "Lucas Oil Stadium", stationCode: "KIND", stationName: "Indianapolis", roofType: "RETRACTABLE", weatherExposure: "MIXED", altitudeFeet: 797, parkFactorNote: "Retractable roof lowers true weather exposure.", windSensitivity: "LOW" },
  { teamKey: "jacksonville jaguars", teamAliases: ["jaguars", "jags"], venueKey: "everbank-stadium", venueName: "EverBank Stadium", stationCode: "KJAX", stationName: "Jacksonville", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 30, parkFactorNote: "Heat and humidity can matter early season.", windSensitivity: "MEDIUM" },
  { teamKey: "kansas city chiefs", teamAliases: ["chiefs"], venueKey: "arrowhead-stadium", venueName: "GEHA Field at Arrowhead Stadium", stationCode: "KMCI", stationName: "Kansas City", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 1026, parkFactorNote: "Open-air Midwest venue with cold/wind sensitivity.", windSensitivity: "HIGH" },
  { teamKey: "las vegas raiders", teamAliases: ["raiders"], venueKey: "allegiant-stadium", venueName: "Allegiant Stadium", stationCode: "KLAS", stationName: "Las Vegas", roofType: "FIXED_DOME", weatherExposure: "INDOOR", altitudeFeet: 2181, parkFactorNote: "Indoor venue largely removes weather effects.", windSensitivity: "NOT_APPLICABLE" },
  { teamKey: "los angeles chargers", teamAliases: ["chargers"], venueKey: "sofi-stadium", venueName: "SoFi Stadium", stationCode: "KLAX", stationName: "Los Angeles", roofType: "FIXED_DOME", weatherExposure: "INDOOR", altitudeFeet: 125, parkFactorNote: "Covered environment substantially reduces weather impact.", windSensitivity: "NOT_APPLICABLE" },
  { teamKey: "los angeles rams", teamAliases: ["rams"], venueKey: "sofi-stadium", venueName: "SoFi Stadium", stationCode: "KLAX", stationName: "Los Angeles", roofType: "FIXED_DOME", weatherExposure: "INDOOR", altitudeFeet: 125, parkFactorNote: "Covered environment substantially reduces weather impact.", windSensitivity: "NOT_APPLICABLE" },
  { teamKey: "miami dolphins", teamAliases: ["dolphins"], venueKey: "hard-rock-stadium", venueName: "Hard Rock Stadium", stationCode: "KMIA", stationName: "Miami", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 8, parkFactorNote: "Heat, humidity, and storm risk matter.", windSensitivity: "MEDIUM" },
  { teamKey: "minnesota vikings", teamAliases: ["vikings"], venueKey: "u-s-bank-stadium", venueName: "U.S. Bank Stadium", stationCode: "KMSP", stationName: "Minneapolis/St Paul", roofType: "FIXED_DOME", weatherExposure: "INDOOR", altitudeFeet: 840, parkFactorNote: "Indoor venue removes most weather variance.", windSensitivity: "NOT_APPLICABLE" },
  { teamKey: "new england patriots", teamAliases: ["patriots", "pats"], venueKey: "gillette-stadium", venueName: "Gillette Stadium", stationCode: "KBOS", stationName: "Boston Logan", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 19, parkFactorNote: "Cold and wind can influence passing and kicking.", windSensitivity: "HIGH" },
  { teamKey: "new orleans saints", teamAliases: ["saints"], venueKey: "caesars-superdome", venueName: "Caesars Superdome", stationCode: "KMSY", stationName: "New Orleans", roofType: "FIXED_DOME", weatherExposure: "INDOOR", altitudeFeet: 4, parkFactorNote: "Indoor venue removes weather impact.", windSensitivity: "NOT_APPLICABLE" },
  { teamKey: "new york giants", teamAliases: ["giants"], venueKey: "metlife-stadium", venueName: "MetLife Stadium", stationCode: "KEWR", stationName: "Newark", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 18, parkFactorNote: "Open-air venue with cold-season weather sensitivity.", windSensitivity: "HIGH" },
  { teamKey: "new york jets", teamAliases: ["jets"], venueKey: "metlife-stadium", venueName: "MetLife Stadium", stationCode: "KEWR", stationName: "Newark", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 18, parkFactorNote: "Open-air venue with cold-season weather sensitivity.", windSensitivity: "HIGH" },
  { teamKey: "philadelphia eagles", teamAliases: ["eagles"], venueKey: "lincoln-financial-field", venueName: "Lincoln Financial Field", stationCode: "KPHL", stationName: "Philadelphia", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 36, parkFactorNote: "Open-air venue; wind can influence passing and kicking.", windSensitivity: "HIGH" },
  { teamKey: "pittsburgh steelers", teamAliases: ["steelers"], venueKey: "acrisure-stadium", venueName: "Acrisure Stadium", stationCode: "KPIT", stationName: "Pittsburgh", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 1187, parkFactorNote: "Cold and riverfront wind can matter.", windSensitivity: "HIGH" },
  { teamKey: "san francisco 49ers", teamAliases: ["49ers", "niners"], venueKey: "levis-stadium", venueName: "Levi's Stadium", stationCode: "KSJC", stationName: "San Jose", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 16, parkFactorNote: "Open-air California venue with modest wind sensitivity.", windSensitivity: "MEDIUM" },
  { teamKey: "seattle seahawks", teamAliases: ["seahawks"], venueKey: "lumen-field", venueName: "Lumen Field", stationCode: "KSEA", stationName: "Seattle-Tacoma", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 433, parkFactorNote: "Open-air Pacific Northwest venue with rain/wind effects.", windSensitivity: "MEDIUM" },
  { teamKey: "tampa bay buccaneers", teamAliases: ["buccaneers", "bucs"], venueKey: "raymond-james-stadium", venueName: "Raymond James Stadium", stationCode: "KTPA", stationName: "Tampa", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 26, parkFactorNote: "Heat, humidity, and storm risk matter.", windSensitivity: "MEDIUM" },
  { teamKey: "tennessee titans", teamAliases: ["titans"], venueKey: "nissan-stadium", venueName: "Nissan Stadium", stationCode: "KBNA", stationName: "Nashville", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 599, parkFactorNote: "Open-air venue with wind and rain relevance.", windSensitivity: "MEDIUM" },
  { teamKey: "washington commanders", teamAliases: ["commanders", "washington"], venueKey: "northwest-stadium", venueName: "Northwest Stadium", stationCode: "KDCA", stationName: "Reagan National", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 15, parkFactorNote: "Open-air East Coast venue with wind/rain sensitivity.", windSensitivity: "MEDIUM" }
];

const NCAAF_VENUE_HINTS: VenueSeed[] = [
  { teamKey: "notre dame", teamAliases: ["notre dame"], venueKey: "notre-dame-stadium", venueName: "Notre Dame Stadium", stationCode: "KSBN", stationName: "South Bend", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 799, parkFactorNote: "Open-air college venue; wind and cold matter late season.", windSensitivity: "HIGH" },
  { teamKey: "michigan", teamAliases: ["michigan wolverines", "wolverines"], venueKey: "michigan-stadium", venueName: "Michigan Stadium", stationCode: "KDTW", stationName: "Detroit Metro", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 839, parkFactorNote: "Open-air college venue with weather sensitivity.", windSensitivity: "MEDIUM" },
  { teamKey: "ohio state", teamAliases: ["ohio state", "buckeyes"], venueKey: "ohio-stadium", venueName: "Ohio Stadium", stationCode: "KCMH", stationName: "Columbus", roofType: "OPEN_AIR", weatherExposure: "OUTDOOR", altitudeFeet: 815, parkFactorNote: "Open-air college venue with cold/wind relevance.", windSensitivity: "MEDIUM" }
];

const VENUE_ALIAS_OVERRIDES: Record<string, VenueSeed> = Object.fromEntries(
  [...MLB_VENUES, ...NFL_VENUES, ...NCAAF_VENUE_HINTS].flatMap((seed) => {
    const aliases = [seed.venueName, seed.venueKey, ...seed.teamAliases, seed.teamKey].map((item) =>
      normalize(item)
    );
    return aliases.map((alias) => [alias, seed]);
  })
);

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[.'&]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(items: Array<string | null | undefined>) {
  return items.filter((item): item is string => Boolean(item && item.trim()));
}

function pickSeeds(league: OpportunityView["league"]) {
  if (league === "MLB") return MLB_VENUES;
  if (league === "NFL") return NFL_VENUES;
  if (league === "NCAAF") return NCAAF_VENUE_HINTS;
  return [];
}

function parseTeamsFromEventLabel(label: string) {
  const normalized = label
    .replace(/\bvs\.?\b/gi, "@")
    .replace(/\bat\b/gi, "@")
    .replace(/\bv\b/gi, "@");
  const parts = normalized.split("@").map((item) => item.trim()).filter(Boolean);

  if (parts.length >= 2) {
    return {
      awayTeam: parts[0],
      homeTeam: parts[1]
    };
  }

  const dashParts = label.split(" - ").map((item) => item.trim()).filter(Boolean);
  if (dashParts.length >= 2) {
    return {
      awayTeam: dashParts[0],
      homeTeam: dashParts[1]
    };
  }

  return {
    awayTeam: null,
    homeTeam: null
  };
}

function findSeedByTeam(league: OpportunityView["league"], text: string) {
  const seeds = pickSeeds(league);
  const normalizedText = normalize(text);

  const scored = seeds.map((seed) => {
    const aliases = [seed.teamKey, ...seed.teamAliases].map((alias) => normalize(alias));
    const score = aliases.reduce((best, alias) => {
      if (!alias) return best;
      if (normalizedText === alias) return Math.max(best, 100);
      if (normalizedText.includes(alias)) return Math.max(best, 85);
      if (alias.includes(normalizedText) && normalizedText.length >= 4) return Math.max(best, 70);
      return best;
    }, 0);
    return { seed, score };
  });

  const best = scored.sort((a, b) => b.score - a.score)[0];
  return best && best.score >= 70 ? best.seed : null;
}

function findSeedByAnyAlias(texts: string[]) {
  for (const text of texts) {
    const normalizedText = normalize(text);
    for (const [alias, seed] of Object.entries(VENUE_ALIAS_OVERRIDES)) {
      if (normalizedText.includes(alias)) {
        return seed;
      }
    }
  }
  return null;
}

function joinStatusFromValue(value: string | null, fallbackPayloadSignal: boolean): WeatherJoinStatus {
  if (value) return "JOINED";
  return fallbackPayloadSignal ? "PAYLOAD_ONLY" : "MISSING";
}

export function inferVenueWeatherJoin(opportunity: OpportunityView): VenueWeatherJoinView {
  const teamHints = parseTeamsFromEventLabel(opportunity.eventLabel);
  return inferVenueWeatherJoinFromContext({
    league: opportunity.league,
    eventLabel: opportunity.eventLabel,
    homeTeam: teamHints.homeTeam,
    awayTeam: teamHints.awayTeam,
    searchTexts: compact([
      opportunity.reasonSummary,
      opportunity.sourceNote,
      opportunity.triggerSummary,
      opportunity.killSummary,
      ...opportunity.whyItShows,
      ...opportunity.whatCouldKillIt
    ])
  });
}


export function inferVenueWeatherJoinFromContext(input: {
  league: OpportunityView["league"];
  eventLabel?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  venue?: string | null;
  searchTexts?: string[];
}): VenueWeatherJoinView {
  const searchTexts = compact([
    input.eventLabel ?? null,
    input.homeTeam ?? null,
    input.awayTeam ?? null,
    input.venue ?? null,
    ...(input.searchTexts ?? [])
  ]);

  const payloadMentionsVenue = searchTexts.some((text) =>
    /stadium|field|park|dome|roof|ballpark|venue|airport|station|metar/i.test(text)
  );

  const homeSeed =
    (input.homeTeam ? findSeedByTeam(input.league, input.homeTeam) : null) ??
    findSeedByAnyAlias(searchTexts);

  const homeTeam = input.homeTeam ?? homeSeed?.teamKey ?? null;
  const awayTeam = input.awayTeam ?? null;

  if (!homeSeed) {
    return {
      league: input.league,
      homeTeam,
      awayTeam,
      venueKey: null,
      venueName: input.venue ?? null,
      stationCode: null,
      stationName: null,
      roofType: input.league === "NBA" ? "FIXED_DOME" : "UNKNOWN",
      weatherExposure: input.league === "NBA" ? "INDOOR" : "UNKNOWN",
      altitudeFeet: null,
      parkFactorNote: null,
      windSensitivity: input.league === "NBA" ? "NOT_APPLICABLE" : "LOW",
      joinMethod: payloadMentionsVenue ? "PAYLOAD_ONLY" : "NONE",
      venueJoinStatus: payloadMentionsVenue ? "PAYLOAD_ONLY" : "MISSING",
      stationJoinStatus: payloadMentionsVenue ? "PAYLOAD_ONLY" : "MISSING",
      notes: payloadMentionsVenue
        ? ["Venue/weather hints were found in payload text, but no structured venue mapping matched yet."]
        : ["No structured venue or station join matched this event context yet."]
    };
  }

  return {
    league: input.league,
    homeTeam,
    awayTeam,
    venueKey: homeSeed.venueKey,
    venueName: homeSeed.venueName,
    stationCode: homeSeed.stationCode,
    stationName: homeSeed.stationName,
    roofType: homeSeed.roofType,
    weatherExposure: homeSeed.weatherExposure,
    altitudeFeet: homeSeed.altitudeFeet ?? null,
    parkFactorNote: homeSeed.parkFactorNote ?? null,
    windSensitivity: homeSeed.windSensitivity,
    joinMethod: input.homeTeam ? "TEAM_HOME_MAP" : "VENUE_ALIAS_MAP",
    venueJoinStatus: joinStatusFromValue(homeSeed.venueName, payloadMentionsVenue),
    stationJoinStatus: joinStatusFromValue(homeSeed.stationCode, payloadMentionsVenue),
    notes: compact([
      `Mapped venue from home-team context${input.homeTeam ? ` (${input.homeTeam})` : ""}.`,
      homeSeed.parkFactorNote ?? null,
      homeSeed.roofType === "RETRACTABLE" ? "Roof state should be joined later when game-day status is available." : null
    ])
  };
}

