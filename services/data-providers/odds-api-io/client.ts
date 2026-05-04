const BASE_URL = "https://api.odds-api.io/v3";

export type OddsApiIoRequestMeta = {
  url: string;
  status: number;
  rateLimit: {
    limit: string | null;
    remaining: string | null;
    reset: string | null;
  };
};

export type OddsApiIoClientOptions = {
  apiKey?: string;
  baseUrl?: string;
};

export type OddsApiIoEventsParams = {
  sport: string;
  league?: string;
  status?: string;
  from?: string;
  to?: string;
  bookmaker?: string;
};

export class OddsApiIoError extends Error {
  status: number;
  meta: OddsApiIoRequestMeta;

  constructor(message: string, status: number, meta: OddsApiIoRequestMeta) {
    super(message);
    this.name = "OddsApiIoError";
    this.status = status;
    this.meta = meta;
  }
}

function apiKeyFromEnv() {
  return process.env.ODDS_API_IO_KEY ?? process.env.ODDS_API_KEY ?? "";
}

function cleanParams(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") search.set(key, String(value));
  }
  return search;
}

export class OddsApiIoClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: OddsApiIoClientOptions = {}) {
    this.apiKey = options.apiKey ?? apiKeyFromEnv();
    this.baseUrl = options.baseUrl ?? BASE_URL;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  private async get(path: string, params: Record<string, string | number | undefined> = {}) {
    if (!this.apiKey) throw new Error("ODDS_API_IO_KEY is not configured.");
    const url = new URL(`${this.baseUrl}${path}`);
    const search = cleanParams({ apiKey: this.apiKey, ...params });
    url.search = search.toString();

    const response = await fetch(url.toString(), { cache: "no-store" });
    const meta: OddsApiIoRequestMeta = {
      url: `${url.origin}${url.pathname}`,
      status: response.status,
      rateLimit: {
        limit: response.headers.get("x-ratelimit-limit"),
        remaining: response.headers.get("x-ratelimit-remaining"),
        reset: response.headers.get("x-ratelimit-reset")
      }
    };

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new OddsApiIoError(typeof data?.error === "string" ? data.error : `Odds-API.io request failed with status ${response.status}.`, response.status, meta);
    }
    return { data, meta };
  }

  async getEvents(params: OddsApiIoEventsParams) {
    return this.get("/events", params);
  }

  async getEventOdds(eventId: string | number, bookmakers: string) {
    return this.get("/odds", { eventId, bookmakers });
  }

  async getMultiOdds(eventIds: Array<string | number>, bookmakers: string) {
    return this.get("/odds/multi", { eventIds: eventIds.join(","), bookmakers });
  }

  async getOddsMovements(params: { eventId: string | number; bookmaker: string; market?: string; hdp?: string }) {
    return this.get("/odds/movements", { eventId: params.eventId, bookmaker: params.bookmaker, market: params.market, hdp: params.hdp });
  }
}

export function defaultOddsApiIoBookmakers() {
  return process.env.ODDS_API_IO_BOOKMAKERS ?? "Bet365,Unibet";
}
