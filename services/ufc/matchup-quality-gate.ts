export type UfcMatchupQualityInput = {
  sourceKey?: string | null;
  sourceName?: string | null;
  eventName?: string | null;
  eventLabel?: string | null;
  fighterAName?: string | null;
  fighterBName?: string | null;
  combatSport?: string | null;
  sourceStatus?: string | null;
};

export type UfcMatchupQualityStatus = "VALID" | "QUESTIONABLE" | "FAKE_NAVIGATION";

export type UfcMatchupQualityResult = {
  status: UfcMatchupQualityStatus;
  score: number;
  valid: boolean;
  questionable: boolean;
  fakeNavigation: boolean;
  reasons: string[];
};

const NAVIGATION_TERMS = new Set([
  "all athletes",
  "athletes",
  "betting odds",
  "connect",
  "dana white's contender series",
  "espn",
  "events",
  "fightcenter",
  "fighters",
  "fight pass",
  "find a bar",
  "find a gym",
  "group sales",
  "hall of fame",
  "home",
  "how to watch",
  "main content",
  "more",
  "baseball",
  "basketball",
  "boxing",
  "football",
  "golf",
  "mlb",
  "mma",
  "nba",
  "ncaab",
  "ncaaf",
  "nfl",
  "nhl",
  "soccer",
  "tennis",
  "wnba",
  "news",
  "newsletter",
  "past",
  "pound for pound",
  "pound-for-pound",
  "rankings",
  "record book",
  "divisional rankings",
  "results",
  "road to ufc",
  "schedule",
  "shop",
  "skip to main content",
  "tickets",
  "ufc",
  "ufc apex",
  "ufc bjj",
  "ufc collectibles",
  "ufc fight club",
  "ufc fight pass",
  "ufc podcasts",
  "ufc strike",
  "ufc travel deals",
  "ufc video archive",
  "venum",
  "view fight card",
  "vip experiences",
  "watch",
  "what's new",
  "zuffa boxing"
]);

const TRUSTED_MATCHUP_SOURCES = new Set(["ufcstats", "mvp", "tapology", "espn", "fightmatrix", "manual"]);
const WEAK_SCRAPE_SOURCES = new Set(["ufc.com", "ufc"]);

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ");
}

function compact(value: string | null | undefined) {
  return normalize(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function hasTwoNameParts(value: string | null | undefined) {
  const name = compact(value);
  const parts = name.split(" ").filter(Boolean);
  return parts.length >= 2 && parts.every((part) => /^[a-z][a-z.'-]*$/.test(part));
}

function isLikelyBrandOrMenu(value: string | null | undefined) {
  const name = normalize(value);
  if (!name) return true;
  if (NAVIGATION_TERMS.has(name)) return true;
  if (name.includes("newsletter") || name.includes("podcast") || name.includes("collectibles")) return true;
  if (name.includes("fight pass") || name.includes("travel deals") || name.includes("view fight card")) return true;
  if (name.includes("performance solutions")) return true;
  return false;
}

function sameOrMissing(left: string | null | undefined, right: string | null | undefined) {
  const a = normalize(left);
  const b = normalize(right);
  return !a || !b || a === b;
}

function eventLooksLikeMenu(value: string | null | undefined) {
  const eventName = normalize(value);
  return !eventName || eventName === "events" || eventName === "ufc" || eventName === "watch" || eventName === "shop";
}

export function evaluateUfcMatchupQuality(input: UfcMatchupQualityInput): UfcMatchupQualityResult {
  const source = normalize(input.sourceKey ?? input.sourceName);
  const reasons: string[] = [];
  let score = 100;

  const fighterABad = isLikelyBrandOrMenu(input.fighterAName);
  const fighterBBad = isLikelyBrandOrMenu(input.fighterBName);
  const fighterAHasName = hasTwoNameParts(input.fighterAName);
  const fighterBHasName = hasTwoNameParts(input.fighterBName);

  if (fighterABad) { score -= 55; reasons.push("fighter_a_navigation_or_brand_text"); }
  if (fighterBBad) { score -= 55; reasons.push("fighter_b_navigation_or_brand_text"); }
  if (!fighterAHasName) { score -= 18; reasons.push("fighter_a_not_person_name_shape"); }
  if (!fighterBHasName) { score -= 18; reasons.push("fighter_b_not_person_name_shape"); }
  if (sameOrMissing(input.fighterAName, input.fighterBName)) { score -= 40; reasons.push("same_or_missing_fighters"); }
  if (eventLooksLikeMenu(input.eventName)) { score -= 25; reasons.push("event_name_navigation_text"); }
  if (eventLooksLikeMenu(input.eventLabel)) { score -= 20; reasons.push("event_label_navigation_text"); }

  if (WEAK_SCRAPE_SOURCES.has(source)) { score -= 15; reasons.push("weak_scrape_source_requires_strict_validation"); }
  if (TRUSTED_MATCHUP_SOURCES.has(source)) score += 10;

  const sport = normalize(input.combatSport);
  if (sport && sport !== "mma" && sport !== "boxing") { score -= 8; reasons.push("unsupported_combat_sport"); }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const fakeNavigation = score < 55 || fighterABad || fighterBBad;
  const questionable = !fakeNavigation && score < 76;
  const status: UfcMatchupQualityStatus = fakeNavigation ? "FAKE_NAVIGATION" : questionable ? "QUESTIONABLE" : "VALID";

  return { status, score, valid: status === "VALID", questionable, fakeNavigation, reasons };
}

export function shouldIngestUfcMatchup(input: UfcMatchupQualityInput) {
  const result = evaluateUfcMatchupQuality(input);
  return result.valid || result.questionable;
}

export function matchupQualityPayload(input: UfcMatchupQualityInput) {
  const result = evaluateUfcMatchupQuality(input);
  return {
    matchupQuality: result.status,
    matchupQualityScore: result.score,
    matchupQualityReasons: result.reasons,
    matchupQualityGateVersion: "ufc-matchup-quality-v1"
  };
}
