export type UfcStatsFighterProfile = {
  sourceId: string;
  name: string;
  heightInches?: number | null;
  reachInches?: number | null;
  stance?: string | null;
  slpm?: number | null;
  sapm?: number | null;
  strikeAccuracyPct?: number | null;
  strikeDefensePct?: number | null;
  takedownsPer15?: number | null;
  takedownAccuracyPct?: number | null;
  takedownDefensePct?: number | null;
  submissionAttemptsPer15?: number | null;
  feature?: Record<string, unknown>;
};

export type UfcStatsEventPage = {
  sourceEventId: string;
  eventName: string;
  eventDate: string;
  location?: string | null;
  fights: Array<{ sourceFightId: string; url: string; fighterAName?: string | null; fighterBName?: string | null; weightClass?: string | null }>;
};

export type UfcStatsFightDetail = {
  sourceFightId: string;
  url: string;
  fighterAName: string;
  fighterBName: string;
  fighterAUrl?: string | null;
  fighterBUrl?: string | null;
  weightClass?: string | null;
  scheduledRounds?: number | null;
  method?: string | null;
  round?: number | null;
  time?: string | null;
};

const strip = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const number = (value?: string | null) => Number(String(value ?? "").match(/-?\d+(\.\d+)?/)?.[0] ?? NaN);
const maybeNumber = (value?: string | null) => Number.isFinite(number(value)) ? number(value) : null;
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const idFrom = (prefix: string, value: string, marker: string) => `${prefix}-${value.match(new RegExp(`${marker}/([a-z0-9]+)`, "i"))?.[1] ?? slug(value)}`;

function title(html: string) {
  return strip(html.match(/b-content__title-highlight[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "");
}

function valueAfter(html: string, label: string) {
  const plain = strip(html);
  const match = plain.match(new RegExp(`${label}:?\\s*([^:]+?)(?=HEIGHT:|WEIGHT:|REACH:|STANCE:|DOB:|SLpM:|Str. Acc:|SApM:|Str. Def:|TD Avg:|TD Acc:|TD Def:|Sub. Avg:|$)`, "i"));
  return match?.[1]?.trim() ?? null;
}

function inches(height?: string | null) {
  const match = String(height ?? "").match(/(\d+)\s*'\s*(\d+)/);
  return match ? Number(match[1]) * 12 + Number(match[2]) : null;
}

export function parseUfcStatsFighterProfile(html: string, url = ""): UfcStatsFighterProfile {
  const name = title(html);
  if (!name) throw new Error("UFCStats fighter page missing fighter name.");
  return {
    sourceId: idFrom("ufcstats", url || name, "fighter-details"),
    name,
    heightInches: inches(valueAfter(html, "HEIGHT")),
    reachInches: maybeNumber(valueAfter(html, "REACH")),
    stance: valueAfter(html, "STANCE"),
    slpm: maybeNumber(valueAfter(html, "SLpM")),
    strikeAccuracyPct: maybeNumber(valueAfter(html, "Str. Acc")),
    sapm: maybeNumber(valueAfter(html, "SApM")),
    strikeDefensePct: maybeNumber(valueAfter(html, "Str. Def")),
    takedownsPer15: maybeNumber(valueAfter(html, "TD Avg")),
    takedownAccuracyPct: maybeNumber(valueAfter(html, "TD Acc")),
    takedownDefensePct: maybeNumber(valueAfter(html, "TD Def")),
    submissionAttemptsPer15: maybeNumber(valueAfter(html, "Sub. Avg")),
    feature: { ufcstatsUrl: url || null, dateOfBirth: valueAfter(html, "DOB") }
  };
}

export function parseUfcStatsEventPage(html: string, eventUrl = ""): UfcStatsEventPage {
  const rows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
  const fights = rows.flatMap((row) => {
    const url = row.match(/data-link=["']([^"']+)/i)?.[1] ?? row.match(/href=["']([^"']*fight-details[^"']+)/i)?.[1];
    if (!url) return [];
    const names = [...row.matchAll(/fighter-details[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => strip(m[1])).filter(Boolean);
    return [{ sourceFightId: idFrom("ufcstats", url, "fight-details"), url, fighterAName: names[0] ?? null, fighterBName: names[1] ?? null, weightClass: null }];
  });
  return { sourceEventId: idFrom("ufcstats", eventUrl || title(html) || "event", "event-details"), eventName: title(html) || "UFC Event", eventDate: valueAfter(html, "DATE") ?? new Date().toISOString(), location: valueAfter(html, "LOCATION"), fights };
}

export function parseUfcStatsFightDetail(html: string, url = ""): UfcStatsFightDetail {
  const links = [...html.matchAll(/href=["']([^"']*fighter-details[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ url: m[1], name: strip(m[2]) })).filter((x, i, a) => x.name && a.findIndex((y) => y.name === x.name) === i).slice(0, 2);
  if (links.length < 2) throw new Error("UFCStats fight detail missing two fighter links.");
  return { sourceFightId: idFrom("ufcstats", url || "fight", "fight-details"), url, fighterAName: links[0].name, fighterBName: links[1].name, fighterAUrl: links[0].url, fighterBUrl: links[1].url, scheduledRounds: null, method: valueAfter(html, "METHOD"), round: maybeNumber(valueAfter(html, "ROUND")), time: valueAfter(html, "TIME") };
}
