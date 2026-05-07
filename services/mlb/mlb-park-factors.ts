import { normalizeMlbTeam } from "@/services/simulation/mlb-team-analytics";

// Multi-year (2022-2024) run park factors from Baseball Reference.
// Values expressed as multipliers: 1.0 = league-neutral, 1.10 = 10% more runs scored.
const PARK_FACTORS: Record<string, number> = {
  coloradorockies:       1.15,
  cincinnatiredss:       1.08,  // Great American Ball Park
  philadelphiaphillies:  1.06,
  texasrangers:          1.05,  // Globe Life Field (retractable, often open)
  bostonredsox:          1.04,
  newyorkyankees:        1.04,
  torontobluejays:       1.03,
  baltimoreorioles:      1.03,
  chicagocubs:           1.02,  // Wrigley varies; multi-year avg near here
  arizonadiamondbacks:   1.02,
  milwaukeebrewers:      1.02,
  houstonastroas:        1.01,  // Minute Maid Park
  newyorkmets:           1.01,
  clevelandguardians:    1.01,
  atlantabraves:         1.00,
  losangelesangels:      1.00,
  minnesotatwins:        1.00,
  washingtonnationals:   0.99,
  kansascityroyals:      0.98,
  stlouiscardinals:      0.98,
  oaklandathletics:      0.98,  // Sutter Health Park (2025, estimated)
  losangelesdodgers:     0.97,
  detroittigers:         0.97,
  pittsburghpirates:     0.97,
  chicagowhitesox:       0.97,
  miamimarlins:          0.96,
  tampabayarys:          0.96,  // Tropicana Field (dome)
  seattlemariners:       0.95,
  sandiegopadres:        0.95,
  sanfranciscogaints:    0.94,  // Oracle Park — classic pitcher's park
};

export function getMlbParkFactor(teamName: string): number {
  const key = normalizeMlbTeam(teamName);
  return PARK_FACTORS[key] ?? 1.0;
}
