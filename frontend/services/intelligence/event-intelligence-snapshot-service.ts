export type EventIntelligenceSnapshot = {
  generatedAt: string;
  stale: {
    weather: boolean;
    combatProfiles: boolean;
    projection: boolean;
  };
  actions: {
    weatherRefreshed: boolean;
    combatProfilesRefreshed: boolean;
    projectionRerun: boolean;
  };
  bundleHash: string;
  projectionSummary: {
    modelKey: string | null;
    winProbHome: number | null;
    projectedTotal: number | null;
  };
};

export function buildEventIntelligenceSnapshot(args: {
  stale: EventIntelligenceSnapshot["stale"];
  actions: EventIntelligenceSnapshot["actions"];
  bundleHash: string;
  projectionSummary: EventIntelligenceSnapshot["projectionSummary"];
}): EventIntelligenceSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    stale: args.stale,
    actions: args.actions,
    bundleHash: args.bundleHash,
    projectionSummary: args.projectionSummary
  };
}
