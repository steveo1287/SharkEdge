export const RETROSHEET_ATTRIBUTION =
  "The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at www.retrosheet.org.";

const RETROSHEET_SOURCE_KEYS = new Set([
  "retrosheet",
  "retrosheet_event_file",
  "retrosheet_game_log",
  "retrosheet_box_score"
]);

export function requiresRetrosheetAttribution(sourceKeys: string[]) {
  return sourceKeys.some((sourceKey) => RETROSHEET_SOURCE_KEYS.has(sourceKey.trim().toLowerCase()));
}
