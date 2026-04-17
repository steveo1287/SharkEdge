export type UfcDivisionDefinition = {
  key: string;
  label: string;
  gender: 'men' | 'women';
  weightLimitLbs: number;
  aliases: string[];
};

export const UFC_DIVISIONS: UfcDivisionDefinition[] = [
  { key: 'W115', label: "Women's Strawweight", gender: 'women', weightLimitLbs: 115, aliases: ['strawweight', 'women strawweight', 'womens strawweight', 'wsw', 'w115'] },
  { key: 'W125', label: "Women's Flyweight", gender: 'women', weightLimitLbs: 125, aliases: ['flyweight women', 'women flyweight', 'womens flyweight', 'wflw', 'w125'] },
  { key: 'W135', label: "Women's Bantamweight", gender: 'women', weightLimitLbs: 135, aliases: ['bantamweight women', 'women bantamweight', 'womens bantamweight', 'wbw', 'w135'] },
  { key: 'W145', label: "Women's Featherweight", gender: 'women', weightLimitLbs: 145, aliases: ['featherweight women', 'women featherweight', 'womens featherweight', 'wfw', 'w145'] },
  { key: 'M125', label: 'Flyweight', gender: 'men', weightLimitLbs: 125, aliases: ['flyweight', 'flw', 'm125'] },
  { key: 'M135', label: 'Bantamweight', gender: 'men', weightLimitLbs: 135, aliases: ['bantamweight', 'bw', 'm135'] },
  { key: 'M145', label: 'Featherweight', gender: 'men', weightLimitLbs: 145, aliases: ['featherweight', 'fw', 'm145'] },
  { key: 'M155', label: 'Lightweight', gender: 'men', weightLimitLbs: 155, aliases: ['lightweight', 'lw', 'm155'] },
  { key: 'M170', label: 'Welterweight', gender: 'men', weightLimitLbs: 170, aliases: ['welterweight', 'ww', 'm170'] },
  { key: 'M185', label: 'Middleweight', gender: 'men', weightLimitLbs: 185, aliases: ['middleweight', 'mw', 'm185'] },
  { key: 'M205', label: 'Light Heavyweight', gender: 'men', weightLimitLbs: 205, aliases: ['light heavyweight', 'lhw', 'm205'] },
  { key: 'M265', label: 'Heavyweight', gender: 'men', weightLimitLbs: 265, aliases: ['heavyweight', 'hw', 'm265'] }
];

function normalize(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function normalizeUfcDivisionKey(value: string | null | undefined) {
  const normalized = normalize(value);
  if (!normalized) return null;
  const found = UFC_DIVISIONS.find((division) => division.aliases.some((alias) => normalize(alias) === normalized) || normalize(division.label) === normalized || normalize(division.key) === normalized);
  return found?.key ?? null;
}

export function getUfcDivisionDefinition(value: string | null | undefined) {
  const key = normalizeUfcDivisionKey(value);
  return key ? UFC_DIVISIONS.find((division) => division.key === key) ?? null : null;
}
