import type { MlbTrendDefinition } from "@/lib/types/mlb-trend-feed";

const MLB_TREND_DEFINITIONS: MlbTrendDefinition[] = [
  {
    id: "mlb-high-total-under",
    family: "TOTALS",
    title: "High-total under band",
    description: "Games closing in the higher MLB total band are tracked as under candidates.",
    betSide: "under",
    conditions: [{ field: "closing_total", op: "gte", value: 9 }],
    whyThisMatters: "Higher totals already price in offense, so late value often depends on restraint more than raw scoring upside.",
    cautionNote: "Wind, weather, and bullpen freshness still matter more than the band by itself.",
    enabled: true
  },
  {
    id: "mlb-low-total-over",
    family: "TOTALS",
    title: "Low-total over band",
    description: "Very low MLB totals are tracked as over candidates when the market is already compressing run expectation.",
    betSide: "over",
    conditions: [{ field: "closing_total", op: "lte", value: 7.5 }],
    whyThisMatters: "When totals open low, a single inning swing matters more and marginal offense can push the game over a compressed number.",
    cautionNote: "Do not force this into elite pitching or severe weather spots without live-board confirmation.",
    enabled: true
  },
  {
    id: "mlb-april-low-total-over",
    family: "SITUATIONAL",
    title: "Early-season low-total over",
    description: "April and May totals in the low band are tracked as overs when the number stays compressed.",
    betSide: "over",
    conditions: [
      { field: "month", op: "between", min: 4, max: 5 },
      { field: "closing_total", op: "lte", value: 7.5 }
    ],
    whyThisMatters: "Early-season run environments can shift quickly while books keep hanging conservative low totals.",
    cautionNote: "Cold-weather lineups and confirmed ace matchups can still keep these games quiet.",
    enabled: true
  },
  {
    id: "mlb-home-short-favorite-ml",
    family: "MONEYLINE",
    title: "Home short favorite moneyline",
    description: "Moderate home favorites are tracked in a band that stays actionable without drifting into expensive chalk.",
    betSide: "home_ml",
    conditions: [{ field: "closing_moneyline_home", op: "between", min: -165, max: -120 }],
    whyThisMatters: "This is the cleaner home-favorite range where price still matters and full chalk tax has not taken over.",
    cautionNote: "If the price climbs late, the value case can disappear even when the historical bucket still matches.",
    enabled: true
  },
  {
    id: "mlb-away-short-dog-ml",
    family: "MONEYLINE",
    title: "Short road dog moneyline",
    description: "Road underdogs in a contained plus-money band are tracked as upset candidates.",
    betSide: "away_ml",
    conditions: [{ field: "closing_moneyline_away", op: "between", min: 100, max: 145 }],
    whyThisMatters: "Short dogs still get paid like underdogs without needing the game to be wildly mispriced.",
    cautionNote: "Travel, bullpen strain, and lineup gaps can turn a short dog into a justified dog quickly.",
    enabled: true
  },
  {
    id: "mlb-away-favorite-low-total-ml",
    family: "SITUATIONAL",
    title: "Road favorite in a low-total game",
    description: "Away favorites in lower-total MLB games are tracked as a controlled moneyline spot.",
    betSide: "away_ml",
    conditions: [
      { field: "closing_moneyline_away", op: "between", min: -150, max: -110 },
      { field: "closing_total", op: "lte", value: 8 }
    ],
    whyThisMatters: "In tighter total environments, a better team can win without needing a loose scoring game.",
    cautionNote: "Thin totals make one crooked inning costly, so this should stay a measured angle rather than automatic chalk.",
    enabled: true
  },
  {
    id: "mlb-home-big-favorite-runline",
    family: "RUNLINE",
    title: "Home big favorite runline",
    description: "Larger home favorites are tracked on the runline when the market already expects separation.",
    betSide: "home_runline",
    conditions: [
      { field: "closing_moneyline_home", op: "lte", value: -180 },
      { field: "closing_runline_home", op: "lte", value: -1.5 }
    ],
    whyThisMatters: "If a team is already laying real moneyline tax, the runline is often the sharper way to express the edge.",
    cautionNote: "Late bullpen usage and one-run MLB endings still make runline favorites volatile.",
    enabled: true
  },
  {
    id: "mlb-away-dog-runline-cushion",
    family: "RUNLINE",
    title: "Road dog plus-runline cushion",
    description: "Road underdogs with the standard +1.5 run cushion are tracked when the moneyline still stays in a workable band.",
    betSide: "away_runline",
    conditions: [
      { field: "closing_moneyline_away", op: "between", min: 110, max: 170 },
      { field: "closing_runline_away", op: "gte", value: 1.5 }
    ],
    whyThisMatters: "MLB underdogs can stay inside one run more often than a raw moneyline read suggests.",
    cautionNote: "This angle gets thinner when the dog is overmatched at starting pitcher or heavily taxed in the bullpen.",
    enabled: true
  },
  {
    id: "mlb-home-dog-runline-cushion",
    family: "RUNLINE",
    title: "Home dog plus-runline cushion",
    description: "Home underdogs with +1.5 are tracked as a protection-oriented runline angle.",
    betSide: "home_runline",
    conditions: [
      { field: "closing_moneyline_home", op: "between", min: 100, max: 170 },
      { field: "closing_runline_home", op: "gte", value: 1.5 }
    ],
    whyThisMatters: "Home dogs often keep full-game scorelines tighter than the moneyline alone implies.",
    cautionNote: "If the home dog is only getting the runline because of a severe pitching gap, the cushion can be misleading.",
    enabled: true
  },
  {
    id: "mlb-april-high-total-under",
    family: "SITUATIONAL",
    title: "Early-season high-total under",
    description: "April and May games closing high are tracked as under spots while the market is still calibrating conditions.",
    betSide: "under",
    conditions: [
      { field: "month", op: "between", min: 4, max: 5 },
      { field: "closing_total", op: "gte", value: 8.5 }
    ],
    whyThisMatters: "Early-season totals can stay inflated while run environments and lineup timing are still settling in.",
    cautionNote: "Strong hitting weather or poor starting depth can erase the early-season under case fast.",
    enabled: true
  }
];

export function getMlbTrendDefinitions(): MlbTrendDefinition[] {
  return MLB_TREND_DEFINITIONS.filter((definition) => definition.enabled).map((definition) => ({
    ...definition,
    conditions: definition.conditions.map((condition) => ({ ...condition }))
  }));
}

export function getMlbTrendDefinitionById(id: string): MlbTrendDefinition | null {
  const definition = MLB_TREND_DEFINITIONS.find((entry) => entry.id === id && entry.enabled);
  if (!definition) {
    return null;
  }

  return {
    ...definition,
    conditions: definition.conditions.map((condition) => ({ ...condition }))
  };
}
