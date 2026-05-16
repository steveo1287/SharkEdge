import { prisma } from "@/lib/db/prisma";
import { buildEliteUfcFighterProfiles } from "@/services/ufc/elite-fighter-profile-builder";

type FighterRow = {
  id: string;
  full_name: string;
  payload_json: unknown;
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function safeMax(existing: unknown, value: number) {
  const numeric = typeof existing === "number" && Number.isFinite(existing) ? existing : 0;
  return Math.max(numeric, value);
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

async function loadFighters(limit: number, offset: number) {
  return prisma.$queryRaw<FighterRow[]>`
    SELECT id, full_name, payload_json
    FROM ufc_fighters
    ORDER BY updated_at DESC, full_name
    LIMIT ${limit}
    OFFSET ${offset}
  `;
}

function localTextFromPayload(payload: unknown) {
  const record = asRecord(payload);
  return [
    record.wikimedia,
    record.background,
    record.rawFeature,
    record.rawPayload,
    record.stats,
    record.eliteProfile
  ].map((value) => JSON.stringify(value ?? "")).join(" ");
}

function inferPriors(text: string) {
  const normalized = clean(text);
  const priors: Record<string, number> = {};
  const martialArts: string[] = [];
  const add = (name: string) => martialArts.push(name);

  if (normalized.includes("wrestling") || normalized.includes("ncaa") || normalized.includes("all-american")) {
    add("wrestling");
    priors.takedownsPer15 = 1.9;
    priors.takedownAccuracyPct = 44;
    priors.takedownDefensePct = 70;
    priors.controlTimePct = 26;
    priors.getUpRate = 64;
  }
  if (normalized.includes("boxing") || normalized.includes("boxer")) {
    add("boxing");
    priors.sigStrikesLandedPerMin = 4.1;
    priors.sigStrikeAccuracyPct = 48;
    priors.knockdownsPer15 = 0.4;
    priors.distanceManagementScore = 62;
  }
  if (normalized.includes("kickboxing") || normalized.includes("muay thai") || normalized.includes("karate") || normalized.includes("taekwondo")) {
    add("kickboxing");
    priors.legKicksLandedPer15 = 8;
    priors.bodyKicksLandedPer15 = 4;
    priors.headKicksLandedPer15 = 0.8;
    priors.kickingAccuracyPct = 49;
    priors.kickingDefensePct = 59;
    priors.clinchStrikingScore = normalized.includes("muay thai") ? 68 : 58;
  }
  if (normalized.includes("brazilian jiu-jitsu") || normalized.includes("bjj") || normalized.includes("jiu-jitsu")) {
    add("bjj");
    priors.submissionAttemptsPer15 = 1.05;
    priors.submissionDefensePct = 74;
    priors.controlEscapePct = 62;
    priors.sweepRate = 0.5;
  }
  if (normalized.includes("judo") || normalized.includes("sambo")) {
    add(normalized.includes("sambo") ? "sambo" : "judo");
    priors.takedownsPer15 = Math.max(priors.takedownsPer15 ?? 0, 1.7);
    priors.takedownDefensePct = Math.max(priors.takedownDefensePct ?? 0, 69);
    priors.submissionDefensePct = Math.max(priors.submissionDefensePct ?? 0, 70);
  }
  if (normalized.includes("champion") || normalized.includes("title")) {
    priors.fightIqScore = 60;
    priors.gamePlanScore = 59;
    priors.heartScore = 58;
  }
  return { priors, martialArts: unique(martialArts) };
}

function enrichmentFromPayload(fighter: FighterRow, retrievedAt: string): WikimediaFighterEnrichment {
  const payload = asRecord(fighter.payload_json);
  const existingWiki = asRecord(payload.wikimedia);
  const text = localTextFromPayload(payload);
  const inferred = inferPriors(text);
  const matched = Boolean(existingWiki.pageTitle || inferred.martialArts.length || Object.keys(inferred.priors).length);
  return {
    fighterId: fighter.id,
    fighterName: fighter.full_name,
    matched,
    confidence: existingWiki.confidence === "A" || existingWiki.confidence === "B" || existingWiki.confidence === "C" ? existingWiki.confidence : matched ? "C" : "NONE",
    pageTitle: typeof existingWiki.pageTitle === "string" ? existingWiki.pageTitle : null,
    pageId: typeof existingWiki.pageId === "number" ? existingWiki.pageId : null,
    sourceUrl: typeof existingWiki.sourceUrl === "string" ? existingWiki.sourceUrl : null,
    retrievedAt,
    extracted: {
      combatBase: typeof asRecord(payload.background).combatBase === "string" ? asRecord(payload.background).combatBase as string : null,
      camp: typeof asRecord(payload.background).camp === "string" ? asRecord(payload.background).camp as string : null,
      martialArts: inferred.martialArts,
      amateurSignal: inferred.martialArts.length ? 56 : 50,
      promotionTierSignal: Object.keys(inferred.priors).some((key) => key.includes("fightIq") || key.includes("gamePlan")) ? 58 : 50,
      backgroundPriors: inferred.priors,
      evidence: []
    }
  };
}

function mergePriors(existing: unknown, incoming: Record<string, number>) {
  const current = asRecord(asRecord(asRecord(existing).wikimedia).priors);
  return Object.fromEntries(Object.entries(incoming).map(([key, value]) => [key, safeMax(current[key], value)]));
}

function mergePayload(current: unknown, enrichment: WikimediaFighterEnrichment) {
  const payload = asRecord(current);
  const existingBackground = asRecord(payload.background);
  const existingRawFeature = asRecord(payload.rawFeature);
  const existingPriors = asRecord(payload.backgroundPriors);
  return {
    ...payload,
    wikimedia: { ...asRecord(payload.wikimedia), ...enrichment },
    backgroundPriors: {
      ...existingPriors,
      wikimedia: {
        source: "wikimedia-or-local-profile-background",
        confidence: enrichment.confidence,
        pageTitle: enrichment.pageTitle,
        pageId: enrichment.pageId,
        sourceUrl: enrichment.sourceUrl,
        retrievedAt: enrichment.retrievedAt,
        priors: mergePriors(existingPriors, enrichment.extracted.backgroundPriors),
        evidence: enrichment.extracted.evidence
      }
    },
    background: {
      ...existingBackground,
      camp: existingBackground.camp ?? enrichment.extracted.camp,
      combatBase: existingBackground.combatBase ?? enrichment.extracted.combatBase,
      martialArts: unique([...(Array.isArray(existingBackground.martialArts) ? existingBackground.martialArts.map(String) : []), ...enrichment.extracted.martialArts]),
      amateurSignal: safeMax(existingBackground.amateurSignal, enrichment.extracted.amateurSignal),
      promotionTierSignal: safeMax(existingBackground.promotionTierSignal, enrichment.extracted.promotionTierSignal),
      source: "wikimedia-enrichment"
    },
    rawFeature: {
      ...existingRawFeature,
      combatBase: existingRawFeature.combatBase ?? enrichment.extracted.combatBase,
      camp: existingRawFeature.camp ?? enrichment.extracted.camp,
      amateurSignal: safeMax(existingRawFeature.amateurSignal, enrichment.extracted.amateurSignal),
      promotionTierSignal: safeMax(existingRawFeature.promotionTierSignal, enrichment.extracted.promotionTierSignal),
      wikimediaConfidence: enrichment.confidence
    },
    lastWikimediaEnrichmentAt: enrichment.retrievedAt
  };
}

async function updateFighterPayload(fighter: FighterRow, enrichment: WikimediaFighterEnrichment) {
  if (enrichment.confidence === "NONE" || enrichment.confidence === "REVIEW") return false;
  const payload = mergePayload(fighter.payload_json, enrichment);
  await prisma.$executeRaw`
    UPDATE ufc_fighters
    SET payload_json = ${JSON.stringify(payload)}::jsonb,
        updated_at = now()
    WHERE id = ${fighter.id}
  `;
  return true;
}

export async function runWikimediaFighterEnrichment(options: Options = {}) {
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 50)));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const retrievedAt = new Date().toISOString();
  const fighters = await loadFighters(limit, offset);
  const enrichments: WikimediaFighterEnrichment[] = [];
  let updated = 0;
  let matched = 0;
  const confidenceCounts: Record<string, number> = { A: 0, B: 0, C: 0, REVIEW: 0, NONE: 0 };

  for (const fighter of fighters) {
    const enrichment = enrichmentFromPayload(fighter, retrievedAt);
    enrichments.push(enrichment);
    confidenceCounts[enrichment.confidence] = (confidenceCounts[enrichment.confidence] ?? 0) + 1;
    if (enrichment.matched) matched += 1;
    if (!options.dryRun && await updateFighterPayload(fighter, enrichment)) updated += 1;
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
    review: 0,
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
