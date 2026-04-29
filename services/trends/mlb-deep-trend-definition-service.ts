import type { MlbTrendDefinition } from "@/lib/types/mlb-trend-feed";

import { getMlbTrendDefinitions } from "./mlb-trend-definition-service";

function deepChecklist(base: string, extra: string[]) {
  return [
    `Core setup: ${base}`,
    "League must be MLB",
    "Game must have a current board match before it can be reviewed live",
    "Historical sample must be graded from finalized games",
    "Closing market must exist for the selected bet side",
    "Pushes are separated from wins/losses",
    "ROI uses closing-price profit units when price is available",
    "Price coverage is shown so weak ROI support is not hidden",
    "Recent history rows must show exact game score and result",
    "Last-10 record is computed from the latest graded history",
    "Streak is computed from the latest non-push result chain",
    "Years covered are displayed from historical seasons",
    "Active games must still fit the same board-side market band",
    "Current price must be checked before any bet is considered",
    "Pitcher, lineup, bullpen, and weather changes can kill the angle",
    "No play if current market moves outside the archived price band",
    "No play if active game lacks the required market type",
    "No play if sample is thin or warnings dominate the card",
    "No play if ROI is pending and hit-rate edge is weak",
    "No play if market is stale or book coverage is dirty",
    ...extra
  ];
}

const DEEP_MLB_TREND_DEFINITIONS: MlbTrendDefinition[] = [
  {
    id: "mlb-series-game-3-recent-struggles-moneyline",
    family: "SITUATIONAL",
    title: "MLB Series Game 3: Teams with Recent Struggles",
    description: "A moneyline system for teams priced in a playable band during series-game spots where the market is not forcing heavy chalk.",
    betSide: "away_ml",
    conditions: [
      { field: "month", op: "between", min: 4, max: 10 },
      { field: "closing_moneyline_away", op: "between", min: -175, max: 145 },
      { field: "closing_total", op: "between", min: 7, max: 10.5 }
    ],
    conditionLabels: deepChecklist("away moneyline in playable MLB price band with total between 7 and 10.5", [
      "Displayed system context: series Game 3 profile",
      "Displayed system context: recent-struggle team angle",
      "Displayed system context: avoid extreme chalk",
      "Displayed system context: avoid dead-total outliers",
      "Displayed system context: active candidates shown with current price"
    ]),
    whyThisMatters: "This is the kind of system users expect: it combines price band, series context, total environment, active games, and a full historical ledger.",
    cautionNote: "Recent-struggle context is only display context until team-form fields are fully normalized; price, total, and active board fit are the hard filters.",
    enabled: true
  },
  {
    id: "mlb-short-road-dog-run-prevention",
    family: "MONEYLINE",
    title: "MLB Short Road Dog: Run Prevention Window",
    description: "Short road underdogs in lower-to-mid total games, designed to find plus-money teams that do not need a shootout to stay live.",
    betSide: "away_ml",
    conditions: [
      { field: "closing_moneyline_away", op: "between", min: 100, max: 150 },
      { field: "closing_total", op: "between", min: 7, max: 8.5 }
    ],
    conditionLabels: deepChecklist("away dog +100 to +150 with closing total from 7 to 8.5", [
      "Displayed system context: road team must be short dog, not long shot",
      "Displayed system context: lower-total game protects dog volatility",
      "Displayed system context: one-run game risk reviewed in history rows",
      "Displayed system context: recent ledger checks whether dog profile is still working"
    ]),
    whyThisMatters: "Short dogs can be mispriced when the game environment is tight enough that one inning swings the result.",
    cautionNote: "Avoid if pitcher gap, bullpen tax, or lineup news justifies the plus-money price.",
    enabled: true
  },
  {
    id: "mlb-low-total-home-favorite-grind",
    family: "SITUATIONAL",
    title: "MLB Low-Total Home Favorite Grind",
    description: "Home favorites in lower-total games where market expectation points toward controlled scoring and reduced comeback volatility.",
    betSide: "home_ml",
    conditions: [
      { field: "closing_moneyline_home", op: "between", min: -170, max: -115 },
      { field: "closing_total", op: "lte", value: 8 }
    ],
    conditionLabels: deepChecklist("home favorite -115 to -170 with closing total 8 or lower", [
      "Displayed system context: home-field run prevention profile",
      "Displayed system context: lower total compresses upset routes",
      "Displayed system context: avoid expensive chalk tax",
      "Displayed system context: current price must not move beyond fair band"
    ]),
    whyThisMatters: "This looks for the cleaner favorite window without paying full heavy-favorite tax.",
    cautionNote: "Low-total favorites still fail if the market has already priced the pitching edge too aggressively.",
    enabled: true
  },
  {
    id: "mlb-high-total-under-pressure",
    family: "TOTALS",
    title: "MLB High-Total Under Pressure System",
    description: "High-total games tracked as under candidates when the market has already inflated run expectation.",
    betSide: "under",
    conditions: [
      { field: "closing_total", op: "gte", value: 9 },
      { field: "month", op: "between", min: 4, max: 10 }
    ],
    conditionLabels: deepChecklist("closing total 9 or higher across regular-season MLB months", [
      "Displayed system context: public run expectation already elevated",
      "Displayed system context: bullpen and weather must be checked before action",
      "Displayed system context: recent history shows whether inflated totals paid off or failed",
      "Displayed system context: active game needs current total still in high band"
    ]),
    whyThisMatters: "Totals that look easy to clear often carry inflated tax; the historical ledger shows whether that tax has actually been beatable.",
    cautionNote: "Do not use if weather, park, lineup strength, or bullpen collapse supports the high number.",
    enabled: true
  }
];

function cloneDefinition(definition: MlbTrendDefinition): MlbTrendDefinition {
  const cloned: MlbTrendDefinition = {
    ...definition,
    conditions: definition.conditions.map((condition) => ({ ...condition }))
  };

  if (definition.conditionLabels?.length) {
    cloned.conditionLabels = [...definition.conditionLabels];
  }

  return cloned;
}

export function getDeepMlbTrendDefinitions(): MlbTrendDefinition[] {
  const byId = new Map<string, MlbTrendDefinition>();
  for (const definition of [...DEEP_MLB_TREND_DEFINITIONS, ...getMlbTrendDefinitions()]) {
    if (!definition.enabled || byId.has(definition.id)) continue;
    byId.set(definition.id, cloneDefinition(definition));
  }
  return Array.from(byId.values());
}
