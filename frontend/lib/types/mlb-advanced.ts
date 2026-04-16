export type MlbLineupSplit = {
  handedness: "L" | "R" | "S";
  xwoba: number;
  barrelRate: number;
  strikeoutRate: number;
};

export type MlbBullpenContext = {
  quality: number;
  fatigue: number;
  leverageDepth: number;
  recent3DayPitchCounts?: number[];
};

export type MlbParkWeatherContext = {
  parkFactor: number;
  temperatureF: number;
  windOutToCenterMph: number;
  humidityPct: number;
  altitudeFt?: number;
  venueName?: string;
  forecastSource?: string;
  runEnvironmentDelta: number;
};

export type MlbAdvancedGameContext = {
  eventId: string;
  homeStarterFip: number;
  awayStarterFip: number;
  probableHomeStarterHandedness?: "L" | "R" | "S";
  probableAwayStarterHandedness?: "L" | "R" | "S";
  homeLineupVsHandedness: MlbLineupSplit[];
  awayLineupVsHandedness: MlbLineupSplit[];
  homeBullpen: MlbBullpenContext;
  awayBullpen: MlbBullpenContext;
  parkWeather: MlbParkWeatherContext;
};
