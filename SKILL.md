export type ProviderHealth = "healthy" | "degraded" | "down";

export type SourceFreshness = {
  observedAt: string;
  maxAgeSeconds: number;
  stale: boolean;
};

export type ProviderErrorKind =
  | "network"
  | "rate_limit"
  | "auth"
  | "parse"
  | "schema_drift"
  | "upstream"
  | "configuration";

export type ProviderError = {
  kind: ProviderErrorKind;
  message: string;
  retryable: boolean;
  provider: string;
  observedAt: string;
  details?: Record<string, unknown>;
};

export type ProviderResult<T> = {
  provider: string;
  health: ProviderHealth;
  freshness: SourceFreshness;
  data: T;
  warnings: string[];
  errors: ProviderError[];
};

export type SourceRecord<T> = {
  provider: string;
  externalId: string;
  payload: T;
  raw?: unknown;
  observedAt: string;
};
