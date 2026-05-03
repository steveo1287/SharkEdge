import { parseUfcStatsEventPage, parseUfcStatsFightDetail, parseUfcStatsFighterProfile } from "@/services/ufc/ufcstats-parser";
import { normalizeUfcStatsSnapshot } from "@/services/ufc/ufcstats-normalizer";

export type UfcStatsFetchOptions = {
  eventUrl: string;
  snapshotAt?: string;
  modelVersion?: string;
  fetchImpl?: typeof fetch;
};

async function getHtml(url: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(url, { headers: { "User-Agent": "SharkEdge-UFCStats-Snapshot/1.0" } });
  if (!response.ok) throw new Error(`UFCStats fetch failed ${response.status} for ${url}`);
  return response.text();
}

export async function fetchUfcStatsSnapshot(options: UfcStatsFetchOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const eventHtml = await getHtml(options.eventUrl, fetchImpl);
  const event = parseUfcStatsEventPage(eventHtml, options.eventUrl);
  const fights = [];
  const fighterUrls = new Set<string>();

  for (const fightLink of event.fights) {
    const fightHtml = await getHtml(fightLink.url, fetchImpl);
    const fight = parseUfcStatsFightDetail(fightHtml, fightLink.url);
    fights.push(fight);
    if (fight.fighterAUrl) fighterUrls.add(fight.fighterAUrl);
    if (fight.fighterBUrl) fighterUrls.add(fight.fighterBUrl);
  }

  const fighters = [];
  for (const fighterUrl of fighterUrls) {
    fighters.push(parseUfcStatsFighterProfile(await getHtml(fighterUrl, fetchImpl), fighterUrl));
  }

  return normalizeUfcStatsSnapshot({
    event,
    fights,
    fighters,
    snapshotAt: options.snapshotAt ?? new Date().toISOString(),
    modelVersion: options.modelVersion
  });
}
