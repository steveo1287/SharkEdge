export type AdvancedStatSeed = Record<string, number>;

export type SportStatAdapterResult = {
  sport: string;
  source: string;
  metrics: AdvancedStatSeed;
  notes: string[];
};

export type SportStatAdapterInput = {
  eventId: string;
  sport: string;
  homeTeam?: string | null;
  awayTeam?: string | null;
};
