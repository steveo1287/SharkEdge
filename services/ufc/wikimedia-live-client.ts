export type LiveWikimediaEnrichment = {
  matched: boolean;
  confidence: "A" | "B" | "C" | "REVIEW" | "NONE";
  pageTitle: string | null;
  pageId: number | null;
  wikidataQid: string | null;
  sourceUrl: string | null;
  combatBase: string | null;
  camp: string | null;
  martialArts: string[];
  amateurSignal: number;
  promotionTierSignal: number;
  backgroundPriors: Record<string, number>;
  evidence: string[];
  error?: string;
};

type SearchPage = { title?: string; pageid?: number; snippet?: string };
type WikiPage = { pageid?: number; title?: string; extract?: string; fullurl?: string; canonicalurl?: string; pageprops?: { wikibase_item?: string } };

const API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "SharkEdge/1.0 live fighter enrichment";
const TERMS = ["wrestling", "boxing", "kickboxing", "muay thai", "karate", "taekwondo", "brazilian jiu-jitsu", "bjj", "judo", "sambo", "grappling"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function has(text: string, ...terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function empty(error?: string): LiveWikimediaEnrichment {
  return { matched: false, confidence: "NONE", pageTitle: null, pageId: null, wikidataQid: null, sourceUrl: null, combatBase: null, camp: null, martialArts: [], amateurSignal: 50, promotionTierSignal: 50, backgroundPriors: {}, evidence: [], error };
}

async function fetchJson(url: URL) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
  if (!response.ok) throw new Error(`wikimedia_http_${response.status}`);
  return response.json() as Promise<unknown>;
}

async function searchTitle(name: string) {
  const url = new URL(API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", `${name} mixed martial artist UFC`);
  url.searchParams.set("srlimit", "5");
  url.searchParams.set("origin", "*");
  const data = asRecord(await fetchJson(url));
  const pages = asRecord(data.query).search;
  const list = Array.isArray(pages) ? pages as SearchPage[] : [];
  const wanted = norm(name).split(" ").filter(Boolean);
  return list.find((page) => {
    const title = norm(page.title ?? "");
    return wanted.length >= 2 && wanted.every((piece) => title.includes(piece));
  }) ?? list.find((page) => norm(page.title ?? "").includes(wanted[wanted.length - 1] ?? "")) ?? null;
}

async function fetchPage(title: string) {
  const url = new URL(API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("prop", "extracts|info|pageprops");
  url.searchParams.set("explaintext", "1");
  url.searchParams.set("exintro", "0");
  url.searchParams.set("inprop", "url");
  url.searchParams.set("titles", title);
  url.searchParams.set("redirects", "1");
  url.searchParams.set("origin", "*");
  const data = asRecord(await fetchJson(url));
  const pages = asRecord(asRecord(data.query).pages);
  return asRecord(Object.values(pages)[0]) as WikiPage;
}

function extractCamp(raw: string) {
  const patterns = [
    /(?:trained|trains|training) (?:at|with|under) ([A-Z][A-Za-z0-9&'.\- ]{3,70})(?:[.,;\n]| in | under )/,
    /(?:fighting out of|based out of) ([A-Z][A-Za-z0-9&'.\- ]{3,70})(?:[.,;\n])/
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

function evidence(raw: string) {
  const sentences = raw.split(/(?<=[.!?])\s+/).filter((sentence) => {
    const text = norm(sentence);
    return has(text, "mixed martial", "ufc", "wrestling", "boxing", "kickboxing", "muay thai", "jiu-jitsu", "bjj", "judo", "sambo", "champion", "trained", "training");
  });
  return unique(sentences.map((sentence) => sentence.replace(/\s+/g, " ").trim()).filter((sentence) => sentence.length > 24 && sentence.length <= 260)).slice(0, 8);
}

function derive(text: string) {
  const t = norm(text);
  const martialArts: string[] = [];
  const priors: Record<string, number> = {};
  const wrestling = has(t, "wrestling", "ncaa", "all-american", "olympic wrestler");
  const boxing = has(t, "boxing", "boxer", "golden gloves");
  const kicking = has(t, "kickboxing", "muay thai", "karate", "taekwondo", "sanda", "sanshou");
  const bjj = has(t, "brazilian jiu-jitsu", "jiu-jitsu", "bjj", "black belt");
  const judo = has(t, "judo", "judoka");
  const sambo = has(t, "sambo", "combat sambo");
  const champion = has(t, "champion", "championship", "title holder", "titleholder");
  const eliteAmateur = has(t, "olympic", "national team", "world championship", "pan american", "ncaa", "all-american");

  if (wrestling) {
    martialArts.push("wrestling");
    priors.takedownsPer15 = eliteAmateur ? 2.25 : 1.75;
    priors.takedownAccuracyPct = eliteAmateur ? 49 : 42;
    priors.takedownDefensePct = eliteAmateur ? 75 : 68;
    priors.controlTimePct = eliteAmateur ? 30 : 24;
    priors.getUpRate = 64;
  }
  if (boxing) {
    martialArts.push("boxing");
    priors.sigStrikesLandedPerMin = 4.25;
    priors.sigStrikeAccuracyPct = 49;
    priors.knockdownsPer15 = 0.42;
    priors.distanceManagementScore = 62;
  }
  if (kicking) {
    martialArts.push(has(t, "muay thai") ? "muay thai" : "kickboxing");
    priors.legKicksLandedPer15 = has(t, "muay thai") ? 10 : 8;
    priors.bodyKicksLandedPer15 = 4.5;
    priors.headKicksLandedPer15 = 0.9;
    priors.kickingAccuracyPct = 49;
    priors.kickingDefensePct = 60;
    priors.clinchStrikingScore = has(t, "muay thai") ? 68 : 58;
  }
  if (bjj) {
    martialArts.push("bjj");
    priors.submissionAttemptsPer15 = 1.1;
    priors.submissionDefensePct = 75;
    priors.controlEscapePct = 62;
    priors.sweepRate = 0.52;
  }
  if (judo || sambo) {
    martialArts.push(sambo ? "sambo" : "judo");
    priors.takedownsPer15 = Math.max(priors.takedownsPer15 ?? 0, sambo ? 2.05 : 1.7);
    priors.takedownDefensePct = Math.max(priors.takedownDefensePct ?? 0, 70);
    priors.submissionDefensePct = Math.max(priors.submissionDefensePct ?? 0, 70);
  }
  if (champion) {
    priors.fightIqScore = Math.max(priors.fightIqScore ?? 0, 62);
    priors.gamePlanScore = Math.max(priors.gamePlanScore ?? 0, 60);
    priors.heartScore = Math.max(priors.heartScore ?? 0, 58);
  }
  return { martialArts: unique(martialArts), priors, eliteAmateur, champion };
}

function combatBase(martialArts: string[]) {
  if (martialArts.includes("wrestling") && martialArts.some((item) => ["bjj", "judo", "sambo"].includes(item))) return "wrestling-grappling";
  return martialArts[0] ?? null;
}

function confidence(name: string, page: WikiPage, text: string, arts: string[]) {
  const title = norm(page.title ?? "");
  const pieces = norm(name).split(" ").filter(Boolean);
  const exactishName = pieces.length >= 2 && pieces.every((piece) => title.includes(piece));
  const mmaPage = has(norm(text), "mixed martial artist", "mixed martial arts", "ultimate fighting championship", " ufc ");
  if (exactishName && mmaPage && arts.length >= 2) return "A" as const;
  if (exactishName && mmaPage) return "B" as const;
  if (exactishName && arts.length >= 1) return "C" as const;
  return "REVIEW" as const;
}

export async function fetchLiveWikimediaFighterEnrichment(name: string): Promise<LiveWikimediaEnrichment> {
  try {
    const search = await searchTitle(name);
    if (!search?.title) return empty();
    const page = await fetchPage(search.title);
    const raw = page.extract ?? "";
    if (!raw.trim()) return empty("empty_extract");
    const derived = derive(raw);
    const conf = confidence(name, page, raw, derived.martialArts);
    if (conf === "REVIEW") {
      return { ...empty(), matched: true, confidence: conf, pageTitle: page.title ?? null, pageId: page.pageid ?? null, wikidataQid: page.pageprops?.wikibase_item ?? null, sourceUrl: page.fullurl ?? page.canonicalurl ?? null, evidence: evidence(raw) };
    }
    return {
      matched: true,
      confidence: conf,
      pageTitle: page.title ?? null,
      pageId: page.pageid ?? null,
      wikidataQid: page.pageprops?.wikibase_item ?? null,
      sourceUrl: page.fullurl ?? page.canonicalurl ?? null,
      combatBase: combatBase(derived.martialArts),
      camp: extractCamp(raw),
      martialArts: derived.martialArts,
      amateurSignal: derived.eliteAmateur ? 66 : derived.martialArts.length ? 56 : 50,
      promotionTierSignal: derived.champion ? 62 : has(norm(raw), "ultimate fighting championship", " ufc ") ? 58 : 50,
      backgroundPriors: derived.priors,
      evidence: evidence(raw)
    };
  } catch (error) {
    return empty(error instanceof Error ? error.message : String(error));
  }
}
