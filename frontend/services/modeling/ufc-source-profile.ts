export type UfcSourceProfile = {
  campName: string | null;
  campKey: string | null;
  trainingPartners: string[];
  amateurRecord: string | null;
  wrestlingLevel: string | null;
  bjjLevel: string | null;
  kickboxingRecord: string | null;
  boxingRecord: string | null;
  stance: string | null;
  age: number | null;
  reachInches: number | null;
  heightInches: number | null;
  sourceCompletenessScore: number;
  pedigreeTags: string[];
};

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function normalizeToken(value: string | null | undefined) {
  const cleaned = (value ?? "").trim();
  return cleaned ? cleaned.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getString(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function getStringArray(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry).trim()).filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return value.split(",").map((entry) => entry.trim()).filter(Boolean);
    }
  }
  return [];
}

function getNumber(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = asNumber(metadata?.[key]);
    if (value !== null) return value;
  }
  return null;
}

export function buildUfcSourceProfile(metadata: Record<string, unknown> | null | undefined): UfcSourceProfile {
  const campName = getString(metadata, ["camp", "trainingCamp", "gym", "team"]);
  const trainingPartners = getStringArray(metadata, ["trainingPartners", "notableTrainingPartners", "partners"]);
  const amateurRecord = getString(metadata, ["amateurRecord", "mmaAmateurRecord"]);
  const wrestlingLevel = getString(metadata, ["wrestlingLevel", "wrestlingPedigree"]);
  const bjjLevel = getString(metadata, ["bjjBelt", "grapplingLevel"]);
  const kickboxingRecord = getString(metadata, ["kickboxingRecord", "muayThaiRecord"]);
  const boxingRecord = getString(metadata, ["boxingRecord"]);
  const stance = getString(metadata, ["stance"]);
  const age = getNumber(metadata, ["age"]);
  const reachInches = getNumber(metadata, ["reachInches", "reach"]);
  const heightInches = getNumber(metadata, ["heightInches", "height"]);

  const completenessPoints = [
    campName ? 1.1 : 0,
    trainingPartners.length ? 1 : 0,
    amateurRecord ? 1.2 : 0,
    wrestlingLevel ? 0.9 : 0,
    bjjLevel ? 0.8 : 0,
    kickboxingRecord ? 0.6 : 0,
    boxingRecord ? 0.4 : 0,
    stance ? 0.35 : 0,
    age !== null ? 0.3 : 0,
    reachInches !== null ? 0.35 : 0,
    heightInches !== null ? 0.25 : 0
  ].reduce((sum, value) => sum + value, 0);

  const pedigreeTags = [
    wrestlingLevel ? `wrestling:${normalizeToken(wrestlingLevel)}` : null,
    bjjLevel ? `bjj:${normalizeToken(bjjLevel)}` : null,
    amateurRecord ? "amateur:known" : null,
    kickboxingRecord ? "kickboxing:known" : null,
    boxingRecord ? "boxing:known" : null,
    trainingPartners.length ? "room:known" : null,
    campName ? `camp:${normalizeToken(campName)}` : null
  ].filter((value): value is string => Boolean(value));

  return {
    campName,
    campKey: normalizeToken(campName),
    trainingPartners,
    amateurRecord,
    wrestlingLevel,
    bjjLevel,
    kickboxingRecord,
    boxingRecord,
    stance,
    age,
    reachInches,
    heightInches,
    sourceCompletenessScore: round(Math.min(9.8, 4.2 + completenessPoints * 0.7), 3),
    pedigreeTags
  };
}
