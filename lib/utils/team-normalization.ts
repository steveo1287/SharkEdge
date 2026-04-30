type TeamAliasMap = Record<string, string>;

const SHARED_TEAM_ALIASES: TeamAliasMap = {
  "la clippers": "losangelesclippers",
  "los angeles clippers": "losangelesclippers",
  "new jersey nets": "brooklynnets",
  "montreal expos": "washingtonnationals",
  "florida marlins": "miamimarlins",
  "oakland athletics": "sacramentoathletics",
  athletics: "sacramentoathletics",
  dbacks: "arizonadiamondbacks"
};

export function normalizeTeamKey(value: string | null | undefined, aliases: TeamAliasMap = {}) {
  const raw = String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!raw) return "";

  const compact = raw.replace(/\s+/g, "");
  const normalizedAliases: TeamAliasMap = {};
  for (const [alias, target] of Object.entries({ ...SHARED_TEAM_ALIASES, ...aliases })) {
    normalizedAliases[alias.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()] = target;
    normalizedAliases[alias.toLowerCase().replace(/[^a-z0-9]+/g, "")] = target;
  }

  return normalizedAliases[raw] ?? normalizedAliases[compact] ?? compact;
}
