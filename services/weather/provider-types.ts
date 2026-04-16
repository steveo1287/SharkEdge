export type WeatherProviderKey = "METAR" | "NWS" | "HRRR" | "WINDY";

export type WeatherProviderRole =
  | "OBSERVATION"
  | "FORECAST"
  | "VISUALIZATION"
  | "SETTLEMENT";

export type WeatherJoinStatus =
  | "JOINED"
  | "PAYLOAD_ONLY"
  | "MISSING"
  | "NOT_APPLICABLE";

export type WeatherRoofType =
  | "OPEN_AIR"
  | "RETRACTABLE"
  | "FIXED_DOME"
  | "UNKNOWN";

export type WeatherExposure =
  | "OUTDOOR"
  | "MIXED"
  | "INDOOR"
  | "UNKNOWN";

export type WeatherSensitivity =
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "NOT_APPLICABLE";

export type WeatherWindSensitivity =
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "NOT_APPLICABLE";

export type WeatherProviderDefinition = {
  key: WeatherProviderKey;
  label: string;
  roles: WeatherProviderRole[];
  priority: number;
  note: string;
};

export type VenueWeatherJoinView = {
  league: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  venueKey: string | null;
  venueName: string | null;
  stationCode: string | null;
  stationName: string | null;
  roofType: WeatherRoofType | null;
  weatherExposure: WeatherExposure;
  altitudeFeet: number | null;
  parkFactorNote: string | null;
  windSensitivity: WeatherWindSensitivity;
  joinMethod: "TEAM_HOME_MAP" | "VENUE_ALIAS_MAP" | "PAYLOAD_ONLY" | "NONE";
  venueJoinStatus: WeatherJoinStatus;
  stationJoinStatus: WeatherJoinStatus;
  notes: string[];
};

export type WeatherSourcePlanView = {
  applicable: boolean;
  sensitivity: WeatherSensitivity;
  primaryObservationProvider: WeatherProviderKey | null;
  primaryForecastProvider: WeatherProviderKey | null;
  visualizationProvider: WeatherProviderKey | null;
  settlementProvider: WeatherProviderKey | null;
  stationJoinStatus: WeatherJoinStatus;
  venueJoinStatus: WeatherJoinStatus;
  sourceConfidence: number;
  summary: string;
  providerNotes: string[];
  venueName?: string | null;
  venueKey?: string | null;
  stationCode?: string | null;
  stationName?: string | null;
  roofType?: WeatherRoofType | null;
  weatherExposure?: WeatherExposure;
  altitudeFeet?: number | null;
  parkFactorNote?: string | null;
  windSensitivity?: WeatherWindSensitivity;
  homeTeam?: string | null;
  awayTeam?: string | null;
  joinMethod?: VenueWeatherJoinView["joinMethod"];
};
