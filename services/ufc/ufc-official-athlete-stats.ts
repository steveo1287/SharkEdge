export type UfcOfficialAthleteStats = {
  source: "ufc.com";
  athleteUrl: string;
  fetchedAt: string;
  fighterName: string | null;
  record: string | null;
  division: string | null;
  status: string | null;
  age: number | null;
  heightInches: number | null;
  weightLbs: number | null;
  sigStrikesLanded: number | null;
  sigStrikesAttempted: number | null;
  sigStrikesLandedPerMin: number | null;
  sigStrikesAbsorbedPerMin: number | null;
  sigStrikeAccuracyPct: number | null;
  sigStrikeDefensePct: number | null;
  takedownsLanded: number | null;
  takedownsAttempted: number | null;
  takedownsPer15: number | null;
  takedownAccuracyPct: number | null;
  takedownDefensePct: number | null;
  submissionAttemptsPer15: number | null;
  knockdownsPer15: number | null;
  averageFightTimeSeconds: number | null;
  standingSigStrikePct: number | null;
  clinchSigStrikePct: number | null;
  groundSigStrikePct: number | null;
  koTkoWins: number | null;
  decisionWins: number | null;
  submissionWins: number | null;
  parsedFields: string[];
};

function cleanText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function numberAfter(text: string, label: RegExp) {
  const match = text.match(new RegExp(`${label.source}\\s*([0-9]+(?:\\.[0-9]+)?)`, "i"));
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function percentAfter(text: string, label: RegExp) {
  const value = numberAfter(text, label);
  return value == null ? null : Math.max(0, Math.min(100, value));
}

function parseTimeSeconds(value: string | null) {
  if (!value) return null;
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function ratioPct(made: number | null, attempted: number | null) {
  if (made == null || attempted == null || attempted <= 0) return null;
  return Math.max(0, Math.min(100, (made / attempted) * 100));
}

function positionPct(text: string, label: "Standing" | "Clinch" | "Ground") {
  const match = text.match(new RegExp(`${label}\\s+[0-9]+\\s*\\(([0-9]+)%\\)`, "i"));
  return match ? Number(match[1]) : null;
}

function winMethodCount(text: string, label: "KO/TKO" | "DEC" | "SUB") {
  const escaped = label.replace("/", "\\/");
  const match = text.match(new RegExp(`${escaped}\\s+([0-9]+)\\s*\\(`, "i"));
  return match ? Number(match[1]) : null;
}

export function parseUfcOfficialAthleteStats(html: string, athleteUrl: string): UfcOfficialAthleteStats {
  const text = cleanText(html);
  const fighterName = text.match(/(?:Active|Released|Not Fighting)?\s*#?\s*([A-Z][A-Za-zÀ-ÖØ-öø-ÿ' .-]{2,60})\s+(?:[A-Za-z]+weight Division|Stats|Stats & Records)/)?.[1]?.trim() ?? null;
  const record = text.match(/(\d+-\d+(?:-\d+)?)\s*\(W-L-D\)/i)?.[1] ?? null;
  const division = text.match(/([A-Za-z]+weight Division)/i)?.[1] ?? null;
  const status = text.match(/Status\s+(Active|Released|Not Fighting)/i)?.[1] ?? null;
  const age = numberAfter(text, /Age/);
  const heightInches = numberAfter(text, /Height/);
  const weightLbs = numberAfter(text, /Weight/);

  const sigStrikesLanded = numberAfter(text, /Sig\. Strikes Landed/);
  const sigStrikesAttempted = numberAfter(text, /Sig\. Strikes Attempted/);
  const takedownsLanded = numberAfter(text, /Takedowns Landed/);
  const takedownsAttempted = numberAfter(text, /Takedowns Attempted/);

  const perMinuteMatches = [...text.matchAll(/([0-9]+(?:\.[0-9]+)?)\s+Sig\. Str\. (Landed|Absorbed)\s+Per Min/gi)];
  const landedPerMin = perMinuteMatches.find((m) => /Landed/i.test(m[2]));
  const absorbedPerMin = perMinuteMatches.find((m) => /Absorbed/i.test(m[2]));

  const tdAvg = text.match(/([0-9]+(?:\.[0-9]+)?)\s+Takedown avg\s+Per 15 Min/i);
  const subAvg = text.match(/([0-9]+(?:\.[0-9]+)?)\s+Submission avg\s+Per 15 Min/i);
  const kdAvg = text.match(/([0-9]+(?:\.[0-9]+)?)\s+Knockdown Avg/i);
  const avgFightTime = text.match(/([0-9]{1,2}:[0-9]{2})\s+Average fight time/i)?.[1] ?? null;

  const sigStrikeAccuracyPct = ratioPct(sigStrikesLanded, sigStrikesAttempted);
  const takedownAccuracyPct = ratioPct(takedownsLanded, takedownsAttempted);

  const result: UfcOfficialAthleteStats = {
    source: "ufc.com",
    athleteUrl,
    fetchedAt: new Date().toISOString(),
    fighterName,
    record,
    division,
    status,
    age,
    heightInches,
    weightLbs,
    sigStrikesLanded,
    sigStrikesAttempted,
    sigStrikesLandedPerMin: landedPerMin ? Number(landedPerMin[1]) : null,
    sigStrikesAbsorbedPerMin: absorbedPerMin ? Number(absorbedPerMin[1]) : null,
    sigStrikeAccuracyPct,
    sigStrikeDefensePct: percentAfter(text, /Sig\. Str\. Defense/),
    takedownsLanded,
    takedownsAttempted,
    takedownsPer15: tdAvg ? Number(tdAvg[1]) : null,
    takedownAccuracyPct,
    takedownDefensePct: percentAfter(text, /Takedown Defense/),
    submissionAttemptsPer15: subAvg ? Number(subAvg[1]) : null,
    knockdownsPer15: kdAvg ? Number(kdAvg[1]) : null,
    averageFightTimeSeconds: parseTimeSeconds(avgFightTime),
    standingSigStrikePct: positionPct(text, "Standing"),
    clinchSigStrikePct: positionPct(text, "Clinch"),
    groundSigStrikePct: positionPct(text, "Ground"),
    koTkoWins: winMethodCount(text, "KO/TKO"),
    decisionWins: winMethodCount(text, "DEC"),
    submissionWins: winMethodCount(text, "SUB"),
    parsedFields: []
  };

  result.parsedFields = Object.entries(result)
    .filter(([key, value]) => !["source", "athleteUrl", "fetchedAt", "parsedFields"].includes(key) && value != null)
    .map(([key]) => key);

  return result;
}

export async function fetchUfcOfficialAthleteStats(athleteUrl: string): Promise<UfcOfficialAthleteStats | null> {
  if (!/^https:\/\/(www\.)?ufc\.com\/athlete\//i.test(athleteUrl)) return null;

  const response = await fetch(athleteUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 SharkEdge/1.0",
      Accept: "text/html,application/xhtml+xml"
    },
    cache: "no-store"
  });

  if (!response.ok) return null;
  return parseUfcOfficialAthleteStats(await response.text(), athleteUrl);
}
