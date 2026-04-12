
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

export type WeatherProviderDefinition = {
  key: WeatherProviderKey;
  label: string;
  roles: WeatherProviderRole[];
  priority: number;
  note: string;
};

export type WeatherSourcePlanView = {
  applicable: boolean;
  sensitivity: "HIGH" | "MEDIUM" | "LOW" | "NOT_APPLICABLE";
  primaryObservationProvider: WeatherProviderKey | null;
  primaryForecastProvider: WeatherProviderKey | null;
  visualizationProvider: WeatherProviderKey | null;
  settlementProvider: WeatherProviderKey | null;
  stationJoinStatus: WeatherJoinStatus;
  venueJoinStatus: WeatherJoinStatus;
  sourceConfidence: number;
  summary: string;
  providerNotes: string[];
};
