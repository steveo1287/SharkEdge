import { prisma } from "@/lib/db/prisma";
import { buildEliteUfcFighterProfiles } from "@/services/ufc/elite-fighter-profile-builder";

type FighterRow = {
  id: string;
  full_name: string;
  stance: string | null;
  height_inches: number | null;
  reach_inches: number | null;
  payload_json: unknown;
};

type WikiSearchPage = {
  pageid?: number;
  title?: string;
  snippet?: string;
};

type WikipediaExtract = {
  pageid?: number;
  title?: string;
  extract?: string;
  fullurl?: string;
  canonicalurl?: string;
};

export type WikimediaFighterEnrichment = {
  fighterId: string;
  fighterName: string;
  matched: boolean;
  confidence: "A" | "B" | "C" | "REVIEW" | "NONE";
  pageTitle: string | null;
  pageId: number | null;
  sourceUrl: string | null;
  retrievedAt: string;
  extracted: {
    combatBase: string | null;
    camp: string | null;
    martialArts: string[];
    wrestlingBackground: boolean;
    boxingBackground: boolean;
    kickboxingBackground: boolean;
    muayThaiBackground: boolean;
    karateBackground: boolean;
    taekwondoBackground: boolean;
    bjjBackground: boolean;
    judoBackground: boolean;
    samboBackground: boolean;
    olympicOrNationalTeam: boolean;
    collegeWrestling: boolean;
    championSignal: boolean;
    amateurSignal: number;
    promotionTierSignal: number;
    backgroundPriors: Record<string, number>;
    evidence: string[];
  };
  error?: string;
};

type Options = {
  limit?: number;
  offset?: number;
  dryRun?: boolean;
  rebuildProfiles?: boolean;
  modelVersion?: string;
  horizonDays?: number;
};

const USER_AGENT = "SharkEdge/1.0 fighter profile enrichment (https://sharkedge.vercel.app)";
const WIKI_API = "https://en.wikipedia.org/w/api.php";
const MARTIAL_ART_TERMS = [
  "wrestling", "collegiate wrestling", "freestyle wrestling", "greco-roman wrestling", "boxing", "kickboxing", "muay thai",
  "karate", "taekwondo", "brazilian jiu-jitsu", "bjj", "jiu-jitsu", "judo", "sambo", "combat sambo", "submission wrestling",
  "grappling", "luta livre", "catch wrestling", "sanshou", "sanda"
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function has(text: string, ...needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value.toFixed(2))));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function extractEvidence(raw: string, terms: string[]) {
  const sentences = raw.split(/(?<=[.!?])\s+/).filter((sentence) => terms.some((term) => sentence.toLowerCase().includes(term)));
  return unique(sentences.slice(0, 8).map((sentence) => sentence.replace(/\s+/g, " ").trim()).filter((sentence) => sentence.length <= 300));
}

function confidenceFor(input: { fighterName: string; pageTitle: string | null; normalized: string; extracted: WikimediaFighterEnrichment["extracted"] }): WikimediaFighterEnrichment["confidence"] {
  if (!input.pageTitle) return "NONE";
  const name = normalizeText(input.fighterName);
  const title = normalizeText(input.pageTitle);
  const combatSignals = input.extracted.martialArts.length + (input.extracted.championSignal ? 1 : 0) + (input.extracted.camp ? 1 : 0);
  const nameMatch = title === name || title.includes(name) || name.includes(title);
  const mixedMartialArts = has(input.normalized, "mixed martial artist", "mixed martial arts", "ultimate fighting championship", "ufc");
  if (nameMatch && mixedMartialArts && combatSignals >= 3) return "A";
  if (nameMatch && mixedMartialArts) return "B";
  if (nameMatch && combatSignals >= 2) return "C";
  return "REVIEW";
}

function skillPriors(normalized: string) {
  const wrestling = has(normalized, "collegiate wrestling", "ncaa", "all-american wrestler", "freestyle wrestling", "greco-roman", "wrestling");
  const collegeWrestling = has(normalized, "ncaa", "collegiate wrestling", "college wrestling", "all-american");
  const boxing = has(normalized, "boxing", "golden gloves", "boxer");
  const kickboxing = has(normalized, "kickboxing", "glory", "k-1", "sanda", "sanshou");
  const muayThai = has(normalized, "muay thai", "thaiboxing");
  const karate = has(normalized, "karate", "kyokushin");
  const taekwondo = has(normalized, "taekwondo");
  const bjj = has(normalized, "brazilian jiu-jitsu", "bjj", "jiu-jitsu black belt", "jiu jitsu black belt", "gracie barra");
  const judo = has(normalized, "judo", "judoka");
  const sambo = has(normalized, "sambo", "combat sambo");
  const olympicOrNationalTeam = has(normalized, "olympic", "olympian", "national team", "world championships", "pan american games");
  const championSignal = has(normalized, "champion", "championship", "title holder", "titleholder", "belt holder");

  const priors: Record<string, number> = {};
  if (wrestling) {
    priors.takedownsPer15 = collegeWrestling || olympicOrNationalTeam ? 2.2 : 1.7;
    priors.takedownAccuracyPct = collegeWrestling || olympicOrNationalTeam ? 48 : 42;
    priors.takedownDefensePct = collegeWrestling || olympicOrNationalTeam ? 74 : 68;
    priors.controlTimePct = collegeWrestling || olympicOrNationalTeam ? 29 : 24;
    priors.getUpRate = 64;
    priors.reversalsPer15 = 0.35;
  }
  if (boxing) {
    priors.sigStrikesLandedPerMin = Math.max(priors.sigStrikesLandedPerMin ?? 0, 4.3);
    priors.sigStrikeAccuracyPct = Math.max(priors.sigStrikeAccuracyPct ?? 0, 49);
    priors.strikingDifferential = Math.max(priors.strikingDifferential ?? -99, 0.55);
    priors.knockdownsPer15 = Math.max(priors.knockdownsPer15 ?? 0, 0.42);
    priors.distanceManagementScore = Math.max(priors.distanceManagementScore ?? 0, 62);
  }
  if (kickboxing || muayThai) {
    priors.legKicksLandedPer15 = Math.max(priors.legKicksLandedPer15 ?? 0, muayThai ? 10 : 8);
    priors.bodyKicksLandedPer15 = Math.max(priors.bodyKicksLandedPer15 ?? 0, 4.5);
    priors.headKicksLandedPer15 = Math.max(priors.headKicksLandedPer15 ?? 0, 0.9);
    priors.kickingAccuracyPct = Math.max(priors.kickingAccuracyPct ?? 0, 49);
    priors.kickingDefensePct = Math.max(priors.kickingDefensePct ?? 0, 60);
    priors.clinchStrikingScore = Math.max(priors.clinchStrikingScore ?? 0, muayThai ? 68 : 58);
  }
  if (karate || taekwondo) {
    priors.headKicksLandedPer15 = Math.max(priors.headKicksLandedPer15 ?? 0, 1.05);
    priors.distanceManagementScore = Math.max(priors.distanceManagementScore ?? 0, 65);
    priors.kickingAccuracyPct = Math.max(priors.kickingAccuracyPct ?? 0, 50);
    priors.kickingDefensePct = Math.max(priors.kickingDefensePct ?? 0, 58);
  }
  if (bjj) {
    priors.submissionAttemptsPer15 = Math.max(priors.submissionAttemptsPer15 ?? 0, 1.15);
    priors.submissionDefensePct = Math.max(priors.submissionDefensePct ?? 0, 76);
    priors.controlEscapePct = Math.max(priors.controlEscapePct ?? 0, 62);
    priors.sweepRate = Math.max(priors.sweepRate ?? 0, 0.55);
    priors.reversalsPer15 = Math.max(priors.reversalsPer15 ?? 0, 0.42);
  }
  if (judo || sambo) {
    priors.takedownsPer15 = Math.max(priors.takedownsPer15 ?? 0, sambo ? 2.05 : 1.7);
    priors.takedownDefensePct = Math.max(priors.takedownDefensePct ?? 0, 70);
    priors.clinchStrikingScore = Math.max(priors.clinchStrikingScore ?? 0, 58);
    priors.submissionDefensePct = Math.max(priors.submissionDefensePct ?? 0, 70);
  }
  if (championSignal) {
    priors.fightIqScore = Math.max(priors.fightIqScore ?? 0, 62);
    priors.gamePlanScore = Math.max(priors.gamePlanScore ?? 0, 60);
    priors.heartScore = Math.max(priors.heartScore ?? 0, 58);
  }
  if (olympicOrNationalTeam) {
    priors.opponentAdjustedStrength = Math.max(priors.opponentAdjustedStrength ?? 0, 62);
    priors.promotionTierSignal = Math.max(priors.promotionTierSignal ?? 0, 66);
  }
  return {
    wrestling, collegeWrestling, boxing, kickboxing, muayThai, karate, taekwondo, bjj, judo, sambo, olympicOrNationalTeam, championSignal, priors
  };
}

function extractCamp(raw: string) {
  const patterns = [
    /(?:trained|trains|training) (?:at|with|under) ([A-Z][A-Za-z0-9&'.\- ]{3,70})(?:[.,;\n]| in | under )/,
    /(?:fighting out of|based out of) ([A-Z][A-Za-z0-9&'.\- ]{3,70})(?:[.,;\n])/,
    /(?:team|gym|camp)[:\s]+([A-Z][A-Za-z0-9&'.\- ]{3,70})(?:[.,;\n])/
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

function combatBaseFromFlags(flags: ReturnType<typeof skillPriors>) {
  if (flags.wrestling && (flags.bjj || flags.sambo || flags.judo)) return "wrestling-grappling";
  if (flags.wrestling) return "wrestling";
  if (flags.bjj) return "bjj";
  if (flags.sambo) return "sambo";
  if (flags.judo) return "judo";
  if (flags.muayThai) return "muay-thai";
  if (flags.kickboxing) return "kickboxing";
  if (flags.boxing) return "boxing";
  if (flags.karate) return "karate";
  if (flags.taekwondo) return "taekwondo";
  return null;
}

async function fetchJson(url: URL) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" }, next: { revalidate: 86_400 } });
  if (!response.ok) throw new Error(`Wikimedia request failed ${response.status}`);
  return response.json() as Promise<unknown>;
}

async function searchWikipediaTitle(name: string) {
  const url = new URL(WIKI_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", `${name} mixed martial artist`);
  url.searchParams.set("srlimit", "3");
  url.searchParams.set("origin", "*");
  const data = asRecord(await fetchJson(url));
  const search = asRecord(data.query).search;
  const pages = Array.isArray(search) ? search as WikiSearchPage[] : [];
  return pages.find((page) => page.title && normalizeText(page.title).includes(normalizeText(name).split(" ").slice(-1)[0] ?? "")) ?? pages[0] ?? null;
}

async function fetchWikipediaExtract(title: string) {
  const url = new URL(WIKI_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("prop", "extracts|info");
  url.searchParams.set("explaintext", "1");
  url.searchParams.set("exsectionformat", "plain");
  url.searchParams.set("inprop", "url");
  url.searchParams.set("titles", title);
  url.searchParams.set("redirects", "1");
  url.searchParams.set("origin", "*");
  const data = asRecord(await fetchJson(url));
  const pages = asRecord(asRecord(data.query).pages);
  const first = Object.values(pages)[0];
  return asRecord(first) as WikipediaExtract;
}

function parseExtract(input: { fighter: FighterRow; page: WikipediaExtract; retrievedAt: string }): WikimediaFighterEnrichment {
  const raw = input.page.extract ?? "";
  const normalized = normalizeText(raw);
  const flags = skillPriors(normalized);
  const martialArts = MARTIAL_ART_TERMS.filter((term) => normalized.includes(term));
  const camp = extractCamp(raw);
  const combatBase = combatBaseFromFlags(flags);
  const amateurSignal = clamp(50 + (flags.collegeWrestling ? 12 : 0) + (flags.olympicOrNationalTeam ? 10 : 0) + (flags.bjj ? 8 : 0) + (flags.sambo ? 8 : 0) + (flags.judo ? 5 : 0));
  const promotionTierSignal = clamp(50 + (flags.championSignal ? 8 : 0) + (flags.olympicOrNationalTeam ? 8 : 0) + (has(normalized, "ufc", "ultimate fighting championship") ? 8 : 0));
  const extracted = {
    combatBase,
    camp,
    martialArts: unique(martialArts),
    wrestlingBackground: flags.wrestling,
    boxingBackground: flags.boxing,
    kickboxingBackground: flags.kickboxing,
    muayThaiBackground: flags.muayThai,
    karateBackground: flags.karate,
    taekwondoBackground: flags.taekwondo,
    bjjBackground: flags.bjj,
    judoBackground: flags.judo,
    samboBackground: flags.sambo,
    olympicOrNationalTeam: flags.olympicOrNationalTeam,
    collegeWrestling: flags.collegeWrestling,
    championSignal: flags.championSignal,
    amateurSignal,
    promotionTierSignal,
    backgroundPriors: flags.priors,
    evidence: extractEvidence(raw, [...MARTIAL_ART_TERMS, "ufc", "champion", "wrestling", "black belt", "olympic", "national team", "trains", "training"])
  };
  return {
    fighterId: input.fighter.id,
    fighterName: input.fighter.full_name,
    matched: true,
    confidence: confidenceFor({ fighterName: input.fighter.full_name, pageTitle: input.page.title ?? null, normalized, extracted }),
    pageTitle: input.page.title ?? null,
    pageId: input.page.pageid ?? null,
    sourceUrl: input.page.fullurl ?? input.page.canonicalurl ?? null,
    retrievedAt: input.retrievedAt,
    extracted
  };
}

async function enrichOne(fighter: FighterRow, retrievedAt: string): Promise<WikimediaFighterEnrichment> {
  try {
    const page = await searchWikipediaTitle(fighter.full_name);
    if (!page?.title) {
      return {
        fighterId: fighter.id,
        fighterName: fighter.full_name,
        matched: false,
        confidence: "NONE",
        pageTitle: null,
        pageId: null,
        sourceUrl: null,
        retrievedAt,
        extracted: { combatBase: null, camp: null, martialArts: [], wrestlingBackground: false, boxingBackground: false, kickboxingBackground: false, muayThaiBackground: false, karateBackground: false, taekwondoBackground: false, bjjBackground: false, judoBackground: false, samboBackground: false, olympicOrNationalTeam: false, collegeWrestling: false, championSignal: false, amateurSignal: 50, promotionTierSignal: 50, backgroundPriors: {}, evidence: [] }
      };
    }
    const extract = await fetchWikipediaExtract(page.title);
    return parseExtract({ fighter, page: extract, retrievedAt });
  } catch (error) {
    return {
      fighterId: fighter.id,
      fighterName: fighter.full_name,
      matched: false,
      confidence: "NONE",
      pageTitle: null,
      pageId: null,
      sourceUrl: null,
      retrievedAt,
      extracted: { combatBase: null, camp: null, martialArts: [], wrestlingBackground: false, boxingBackground: false, kickboxingBackground: false, muayThaiBackground: false, karateBackground: false, taekwondoBackground: false, bjjBackground: false, judoBackground: false, samboBackground: false, olympicOrNationalTeam: false, collegeWrestling: false, championSignal: false, amateurSignal: 50, promotionTierSignal: 50, backgroundPriors: {}, evidence: [] },
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function loadFighters(limit: number, offset: number) {
  return prisma.$queryRaw<FighterRow[]>`
    SELECT id, full_name, stance, height_inches, reach_inches, payload_json
    FROM ufc_fighters
    ORDER BY updated_at DESC, full_name
    LIMIT ${limit}
    OFFSET ${offset}
  `;
}

function mergePayload(current: unknown, enrichment: WikimediaFighterEnrichment) {
  const payload = asRecord(current);
  const existingBackground = asRecord(payload.background);
  const existingRawFeature = asRecord(payload.rawFeature);
  const backgroundPriors = enrichment.extracted.backgroundPriors;
  return {
    ...payload,
    wikimedia: enrichment,
    background: {
      ...existingBackground,
      camp: existingBackground.camp ?? enrichment.extracted.camp,
      combatBase: existingBackground.combatBase ?? enrichment.extracted.combatBase,
      martialArts: unique([...(Array.isArray(existingBackground.martialArts) ? existingBackground.martialArts.map(String) : []), ...enrichment.extracted.martialArts]),
      amateurSignal: Math.max(Number(existingBackground.amateurSignal ?? 0), enrichment.extracted.amateurSignal),
      promotionTierSignal: Math.max(Number(existingBackground.promotionTierSignal ?? 0), enrichment.extracted.promotionTierSignal),
      source: "wikimedia-enrichment"
    },
    rawFeature: {
      ...existingRawFeature,
      ...Object.fromEntries(Object.entries(backgroundPriors).map(([key, value]) => [key, Math.max(Number(existingRawFeature[key] ?? 0), value)])),
      combatBase: existingRawFeature.combatBase ?? enrichment.extracted.combatBase,
      camp: existingRawFeature.camp ?? enrichment.extracted.camp,
      amateurSignal: Math.max(Number(existingRawFeature.amateurSignal ?? 0), enrichment.extracted.amateurSignal),
      promotionTierSignal: Math.max(Number(existingRawFeature.promotionTierSignal ?? 0), enrichment.extracted.promotionTierSignal),
      wikimediaConfidence: enrichment.confidence
    },
    lastWikimediaEnrichmentAt: enrichment.retrievedAt
  };
}

async function updateFighterPayload(fighter: FighterRow, enrichment: WikimediaFighterEnrichment) {
  if (enrichment.confidence === "REVIEW" || enrichment.confidence === "NONE") return { updated: false, reason: "low-confidence" };
  const payload = mergePayload(fighter.payload_json, enrichment);
  await prisma.$executeRaw`
    UPDATE ufc_fighters
    SET payload_json = ${JSON.stringify(payload)}::jsonb,
        combat_base = COALESCE(combat_base, ${enrichment.extracted.combatBase}),
        updated_at = now()
    WHERE id = ${fighter.id}
  `;
  return { updated: true, reason: "merged" };
}

export async function runWikimediaFighterEnrichment(options: Options = {}) {
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 50)));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const retrievedAt = new Date().toISOString();
  const fighters = await loadFighters(limit, offset);
  const enrichments: WikimediaFighterEnrichment[] = [];
  let updated = 0;
  let review = 0;
  let matched = 0;
  const confidenceCounts: Record<string, number> = { A: 0, B: 0, C: 0, REVIEW: 0, NONE: 0 };

  for (const fighter of fighters) {
    const enrichment = await enrichOne(fighter, retrievedAt);
    enrichments.push(enrichment);
    confidenceCounts[enrichment.confidence] = (confidenceCounts[enrichment.confidence] ?? 0) + 1;
    if (enrichment.matched) matched += 1;
    if (enrichment.confidence === "REVIEW") review += 1;
    if (!options.dryRun) {
      const result = await updateFighterPayload(fighter, enrichment);
      if (result.updated) updated += 1;
    }
  }

  const rebuild = options.rebuildProfiles && !options.dryRun
    ? await buildEliteUfcFighterProfiles({ modelVersion: options.modelVersion, horizonDays: options.horizonDays, limit: Math.max(limit, 250) })
    : null;

  return {
    ok: true,
    mode: options.dryRun ? "dry-run" : "enrich",
    retrievedAt,
    limit,
    offset,
    checked: fighters.length,
    matched,
    updated,
    review,
    confidenceCounts,
    rebuild,
    samples: enrichments.slice(0, 12).map((item) => ({
      fighterId: item.fighterId,
      fighterName: item.fighterName,
      confidence: item.confidence,
      pageTitle: item.pageTitle,
      combatBase: item.extracted.combatBase,
      camp: item.extracted.camp,
      martialArts: item.extracted.martialArts,
      priors: item.extracted.backgroundPriors,
      evidence: item.extracted.evidence.slice(0, 3),
      error: item.error
    }))
  };
}
