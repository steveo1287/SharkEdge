import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { NamedUfcFighterEraPrior } from "@/services/ufc/named-fighter-era-priors";

type Row = {
  fighter_id: string;
  full_name: string;
  nickname: string | null;
  payload_json: unknown;
  has_upcoming_ufc_fight: boolean | null;
  has_recent_ufc_fight: boolean | null;
  recent_ufc_fight_date: Date | string | null;
};

const DB_KEY_MAP: Record<string, string> = {
  sigStrikesLandedPerMin: "sig_strikes_landed_per_min",
  sigStrikesAbsorbedPerMin: "sig_strikes_absorbed_per_min",
  strikingDifferential: "striking_differential",
  takedownsPer15: "takedowns_per_15",
  takedownAccuracyPct: "takedown_accuracy_pct",
  takedownDefensePct: "takedown_defense_pct",
  submissionAttemptsPer15: "submission_attempts_per_15",
  controlTimePct: "control_time_pct",
  opponentAdjustedStrength: "opponent_adjusted_strength"
};

function slug(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function boolish(value: unknown) {
  return typeof value === "boolean" ? value : typeof value === "string" && ["true", "yes", "active", "current", "1"].includes(value.toLowerCase());
}

function activeSignals(row: Row) {
  const payload = asRecord(row.payload_json);
  const roster = asRecord(payload.roster);
  const contract = asRecord(payload.contract);
  const signals: string[] = [];
  if (row.has_upcoming_ufc_fight) signals.push("upcoming_ufc_fight");
  if (row.has_recent_ufc_fight) signals.push("recent_ufc_fight_24mo");
  if (row.recent_ufc_fight_date) signals.push(`last_ufc_fight:${new Date(row.recent_ufc_fight_date).toISOString().slice(0, 10)}`);
  if (boolish(payload.activeUfcFighter) || boolish(payload.active) || boolish(payload.ufcActive)) signals.push("payload_active_flag");
  if (boolish(roster.active) || boolish(roster.current) || boolish(roster.underContract)) signals.push("roster_active_flag");
  if (boolish(contract.active) || boolish(contract.underContract)) signals.push("contract_active_flag");
  return [...new Set(signals)];
}

function isActive(row: Row) {
  const signals = activeSignals(row);
  return signals.includes("upcoming_ufc_fight") || signals.includes("recent_ufc_fight_24mo") || signals.includes("payload_active_flag") || signals.includes("roster_active_flag") || signals.includes("contract_active_flag");
}

function findPrior(row: Row, priors: NamedUfcFighterEraPrior[], only: string | null) {
  const tokens = [row.fighter_id, row.full_name, row.nickname, asRecord(row.payload_json).slug, asRecord(row.payload_json).fighterSlug]
    .map((value) => slug(typeof value === "string" ? value : null))
    .filter(Boolean);
  return priors.find((prior) => {
    if (only && prior.id !== only && !prior.aliases.includes(slug(only))) return false;
    return prior.aliases.some((alias) => tokens.includes(slug(alias)));
  }) ?? null;
}

function payloadFor(prior: NamedUfcFighterEraPrior, signals: string[], batch: string) {
  const tendencyPrior = prior.metadata.tendencyPrior;
  const generatedAt = new Date().toISOString();
  const tendencies = Object.fromEntries(Object.entries(tendencyPrior).filter(([, value]) => typeof value === "number"));
  return {
    namedFighterPriors: { [prior.id]: { id: prior.id, label: prior.label, scope: "active_ufc_only", activeSignals: signals, profile: prior.profile, metadata: prior.metadata, appliedAt: generatedAt } },
    fighterTendencies: {
      version: "ufc-fighter-tendencies-v1",
      generatedAt,
      source: `active-ufc-named-fighter-era-prior-${batch.toLowerCase()}`,
      namedPriorIds: [prior.id],
      archetype: { primary: String(tendencyPrior.archetype ?? prior.metadata.styleOverride), secondary: [], confidence: 0.94 },
      tendencies,
      tacticalRules: {
        preferredWinConditions: Array.isArray(tendencyPrior.preferredWinConditions) ? tendencyPrior.preferredWinConditions : [],
        dangerZones: Array.isArray(tendencyPrior.dangerZones) ? tendencyPrior.dangerZones : [],
        opponentTriggers: Array.isArray(tendencyPrior.opponentTriggers) ? tendencyPrior.opponentTriggers : [],
        simModifiers: { namedPriorBoost: 0.3 }
      },
      evidence: { sourceQuality: "A", statsUsed: [`active UFC named fighter era prior:${prior.id}`], activeSignals: signals, missingSignals: [], fallbackUsed: false }
    },
    tendencyProfile: { source: `active-ufc-named-fighter-era-prior-${batch.toLowerCase()}`, generatedAt, archetype: String(tendencyPrior.archetype ?? prior.metadata.styleOverride), confidence: 0.94, sourceQuality: "A", fallbackUsed: false, missingSignals: [], namedPriorIds: [prior.id], activeSignals: signals },
    canonicalEraPriors: { [prior.id]: { id: prior.id, label: prior.label, scope: "active_ufc_only", activeSignals: signals, profile: prior.profile, metadata: prior.metadata, evidence: prior.evidence, appliedAt: generatedAt } }
  };
}

function featurePayload(prior: NamedUfcFighterEraPrior, signals: string[], batch: string) {
  return {
    ...prior.profile,
    combatBase: prior.metadata.combatBase,
    weightClass: prior.metadata.projectedWeightClass,
    namedFighterPrior: { id: prior.id, label: prior.label, scope: "active_ufc_only", activeSignals: signals, confidence: prior.confidence, sourceUrl: prior.sourceUrl, evidence: prior.evidence, metadata: prior.metadata, appliedAt: new Date().toISOString() },
    eliteCombatCredentialPrior: { source: `active-ufc-named-fighter-era-prior-${batch.toLowerCase()}`, confidence: prior.confidence, sourceUrl: prior.sourceUrl, appliedPriors: [{ id: prior.id, confidence: prior.confidence, changedKeys: Object.keys(prior.profile), activeSignals: signals }], evidence: prior.evidence }
  };
}

async function queryRows(limit: number, only: string | null) {
  const q = slug(only ?? "");
  return prisma.$queryRaw<Row[]>`
    WITH participation AS (
      SELECT fighter_a_id AS fighter_id, fight_date, status FROM ufc_fights
      UNION ALL
      SELECT fighter_b_id AS fighter_id, fight_date, status FROM ufc_fights
    ), activity AS (
      SELECT fighter_id,
        BOOL_OR(fight_date >= now() - interval '12 hours' AND COALESCE(status, '') NOT IN ('CANCELED', 'VOID')) AS has_upcoming_ufc_fight,
        BOOL_OR(fight_date >= now() - interval '24 months' AND fight_date < now() AND COALESCE(status, '') NOT IN ('CANCELED', 'VOID')) AS has_recent_ufc_fight,
        MAX(CASE WHEN fight_date < now() AND COALESCE(status, '') NOT IN ('CANCELED', 'VOID') THEN fight_date ELSE NULL END) AS recent_ufc_fight_date
      FROM participation
      GROUP BY fighter_id
    )
    SELECT f.id AS fighter_id, f.full_name, f.nickname, f.payload_json,
      COALESCE(a.has_upcoming_ufc_fight, false) AS has_upcoming_ufc_fight,
      COALESCE(a.has_recent_ufc_fight, false) AS has_recent_ufc_fight,
      a.recent_ufc_fight_date
    FROM ufc_fighters f
    LEFT JOIN activity a ON a.fighter_id = f.id
    WHERE ${q}::text = ''
      OR lower(regexp_replace(f.full_name, '[^a-zA-Z0-9]+', '-', 'g')) = ${q}
      OR lower(regexp_replace(COALESCE(f.nickname, ''), '[^a-zA-Z0-9]+', '-', 'g')) = ${q}
      OR f.id = ${q}
    ORDER BY f.full_name ASC
    LIMIT ${Math.max(1, Math.min(5000, limit))}
  `;
}

async function applyPrior(row: Row, prior: NamedUfcFighterEraPrior, modelVersion: string, signals: string[], batch: string) {
  const db = Object.fromEntries(Object.entries(prior.profile).filter(([key]) => DB_KEY_MAP[key]).map(([key, value]) => [DB_KEY_MAP[key], value]));
  await prisma.$executeRaw`UPDATE ufc_fighters SET payload_json = COALESCE(payload_json, '{}'::jsonb) || ${JSON.stringify(payloadFor(prior, signals, batch))}::jsonb, updated_at = now() WHERE id = ${row.fighter_id}`;
  await prisma.$executeRaw`
    UPDATE ufc_model_features SET feature_json = COALESCE(feature_json, '{}'::jsonb) || ${JSON.stringify(featurePayload(prior, signals, batch))}::jsonb,
      sig_strikes_landed_per_min = COALESCE(${db.sig_strikes_landed_per_min ?? null}, sig_strikes_landed_per_min),
      sig_strikes_absorbed_per_min = COALESCE(${db.sig_strikes_absorbed_per_min ?? null}, sig_strikes_absorbed_per_min),
      striking_differential = COALESCE(${db.striking_differential ?? null}, striking_differential),
      takedowns_per_15 = COALESCE(${db.takedowns_per_15 ?? null}, takedowns_per_15),
      takedown_accuracy_pct = COALESCE(${db.takedown_accuracy_pct ?? null}, takedown_accuracy_pct),
      takedown_defense_pct = COALESCE(${db.takedown_defense_pct ?? null}, takedown_defense_pct),
      submission_attempts_per_15 = COALESCE(${db.submission_attempts_per_15 ?? null}, submission_attempts_per_15),
      control_time_pct = COALESCE(${db.control_time_pct ?? null}, control_time_pct),
      opponent_adjusted_strength = COALESCE(${db.opponent_adjusted_strength ?? null}, opponent_adjusted_strength),
      cold_start_active = false,
      updated_at = now()
    WHERE fighter_id = ${row.fighter_id} AND model_version = ${modelVersion}
  `;
}

export async function applyActiveNamedPriorBatch(options: { batch: string; priors: NamedUfcFighterEraPrior[]; modelVersion?: string; limit?: number; dryRun?: boolean; activeOnly?: boolean; only?: string | null }) {
  const batch = options.batch;
  const modelVersion = options.modelVersion ?? "ufc-fight-iq-v1";
  const limit = Math.max(1, Math.min(5000, Math.round(options.limit ?? 500)));
  const dryRun = options.dryRun !== false;
  const activeOnly = options.activeOnly !== false;
  if (!hasUsableServerDatabaseUrl()) return { ok: false, batch, dryRun, activeOnly, scanned: 0, matched: 0, applied: 0, skippedInactive: 0, priorsApplied: [], skipped: [], errors: ["No usable server database URL configured."] };
  const rows = await queryRows(limit, options.only ?? null);
  const priorsApplied: unknown[] = [];
  const skipped: unknown[] = [];
  const errors: string[] = [];
  let matched = 0;
  for (const row of rows) {
    const prior = findPrior(row, options.priors, options.only ?? null);
    if (!prior) continue;
    matched += 1;
    const signals = activeSignals(row);
    if (activeOnly && !isActive(row)) { skipped.push({ fighterId: row.fighter_id, fighterName: row.full_name, priorId: prior.id, reason: "inactive_or_unproven_active_ufc_contract", activeSignals: signals }); continue; }
    try {
      if (!dryRun) await applyPrior(row, prior, modelVersion, signals, batch);
      priorsApplied.push({ fighterId: row.fighter_id, fighterName: row.full_name, priorId: prior.id, changedKeys: Object.keys(prior.profile), activeSignals: signals });
    } catch (error) { errors.push(`${row.full_name}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return { ok: errors.length === 0, batch, dryRun, activeOnly, scanned: rows.length, matched, applied: priorsApplied.length, skippedInactive: skipped.length, priorsApplied, skipped, errors };
}
