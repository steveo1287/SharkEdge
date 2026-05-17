export type CombatSportsEnrichmentLane =
  | "UFCSTATS"
  | "BOXING"
  | "PFL_BELLATOR_ONE"
  | "MVP_MMA"
  | "REGIONAL_MMA"
  | "UNKNOWN_REVIEW"
  | "IGNORE_NAVIGATION";

export type EnrichmentLaneClassification = {
  lane: CombatSportsEnrichmentLane;
  confidence: number;
  reason: string;
  recommendedSource: string;
};

const IGNORE_NAMES = new Set([
  "ufc", "ufc apex", "find a gym", "find a bar", "skip to main content", "events", "tickets", "watch", "shop",
  "all athletes", "athletes", "betting odds", "connect", "group sales", "hall of fame", "how to watch", "ufc fight club",
  "dana whites contender series", "dana white s contender series", "road to ufc", "ufc fight pass", "newsletter",
  "thorne performance solutions", "ufc collectibles", "ufc podcasts", "ufc strike", "view fight card", "what s new", "zuffa boxing"
]);

const BOXING_NAMES = new Set([
  "amanda serrano", "cheyenne hanson", "holly holm", "stephanie han", "yokasta valle", "lourdes juarez",
  "yesica nery plata", "brook sibrian", "evelin bermudez", "estefany alegria", "oshae jones", "elia carranza",
  "tiara brown", "hannah rapp", "mary spencer", "desley robinson", "miranda reyes", "camilla panatta",
  "albina moldazhanova", "claudia herrera", "alexis chaparro", "edward ulloa", "jocelyn camarillo", "yazmin martinez"
]);

const PFL_BELLATOR_ONE_NAMES = new Set([
  "adriano moraes", "phumi nkuta", "jason jackson", "aline pereira", "jade masson wong", "salahdine parnasse",
  "kenneth cross", "yuneisy duben", "robelis despaigne"
]);

const MVP_MMA_NAMES = new Set([
  "namo fazil", "jake babian", "alexander gueche", "joshua montoya", "jefferson creighton"
]);

const UFCSTATS_LIKELY_NAMES = new Set([
  "song yadong", "sergei pavlovich", "sean o malley", "rafael fiziev", "shara magomedov", "sharabutdin magomedov",
  "aoriqileng", "sumudaerji", "rei tsuruya", "timmy cuamba", "tommy gantt", "tuco tokkos", "victor henry",
  "tom nolan", "steve garcia", "shauna bannon", "ramon taveras", "tallison teixeira", "zhang mingyang", "zhu kangjie",
  "yi sak lee", "luis gurule", "luis felipe dias", "nikolay veretennikov", "khaos williams", "malcolm wellmaker",
  "ketlen vieira", "loma lookboonmee", "polyana viana", "nicolle caliari", "cody brundage", "andre petroski",
  "dooho choi", "daniel santos", "arnold allen", "jacqueline cavalcanti", "ivan erslan", "artur minev"
]);

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function sourceResult(lane: CombatSportsEnrichmentLane, confidence: number, reason: string): EnrichmentLaneClassification {
  const recommendedSource = lane === "UFCSTATS"
    ? "UFCStats profile + historical UFC fight stats"
    : lane === "BOXING"
      ? "BoxRec/Tapology/Wikipedia boxing profile enrichment"
      : lane === "PFL_BELLATOR_ONE"
        ? "Tapology/Sherdog/FightMatrix non-UFC MMA enrichment"
        : lane === "MVP_MMA"
          ? "MVP event feed + Tapology/Sherdog profile enrichment"
          : lane === "REGIONAL_MMA"
            ? "Tapology/Sherdog/regional promotion enrichment"
            : lane === "IGNORE_NAVIGATION"
              ? "ignore/navigation pollution"
              : "manual source review";
  return { lane, confidence, reason, recommendedSource };
}

export function classifyCombatSportsEnrichmentLane(input: {
  fighterName?: string | null;
  opponentName?: string | null;
  eventLabel?: string | null;
  eventName?: string | null;
  sourceKey?: string | null;
  existingPayload?: unknown;
}): EnrichmentLaneClassification {
  const fighter = normalize(input.fighterName);
  const opponent = normalize(input.opponentName);
  const eventLabel = normalize(input.eventLabel);
  const eventName = normalize(input.eventName);
  const sourceKey = normalize(input.sourceKey);
  const combined = [fighter, opponent, eventLabel, eventName, sourceKey].filter(Boolean).join(" | ");

  if (!fighter || IGNORE_NAMES.has(fighter)) return sourceResult("IGNORE_NAVIGATION", 1, "fighter name is navigation/promo text");
  if (IGNORE_NAMES.has(opponent)) return sourceResult("IGNORE_NAVIGATION", 1, "opponent name is navigation/promo text");
  if (containsAny(combined, ["zuffa boxing", "boxing", "boxrec"]) || BOXING_NAMES.has(fighter)) return sourceResult("BOXING", 0.95, "boxing event/name lane");
  if (containsAny(combined, ["pfl", "bellator", "one championship", "one fight night", "one "]) || PFL_BELLATOR_ONE_NAMES.has(fighter)) return sourceResult("PFL_BELLATOR_ONE", 0.9, "PFL/Bellator/ONE-style fighter or event");
  if (containsAny(combined, ["mvp", "most valuable promotions", "paul", "nakisa"]) || MVP_MMA_NAMES.has(fighter)) return sourceResult("MVP_MMA", 0.86, "MVP/event-feed fighter lane");
  if (UFCSTATS_LIKELY_NAMES.has(fighter)) return sourceResult("UFCSTATS", 0.94, "known UFCStats-covered fighter");
  if (sourceKey.includes("ufc") || containsAny(eventName, ["ufc", "fight night", "contender series", "road to ufc"])) return sourceResult("UFCSTATS", 0.82, "UFC source/event signal");
  if (containsAny(combined, ["lfa", "cage warriors", "rizin", "ksw", "cffc", "regional"])) return sourceResult("REGIONAL_MMA", 0.78, "regional MMA event signal");
  return sourceResult("UNKNOWN_REVIEW", 0.45, "no reliable lane signal");
}

export function isUfcStatsLane(input: Parameters<typeof classifyCombatSportsEnrichmentLane>[0]) {
  return classifyCombatSportsEnrichmentLane(input).lane === "UFCSTATS";
}
