import type { BoardSupportStatus, EdgeBand } from "@/lib/types/domain";
import type {
  LedgerBetType,
  LedgerMarketType,
  SupportedLeagueKey,
  SupportedSportCode
} from "@/lib/types/ledger";

export type BetActionSourcePage = "board" | "props" | "matchup" | "top_plays";

export type BetConfidenceTier = "A" | "B" | "C";

export type BetSignalContext = {
  sourcePage: BetActionSourcePage;
  sourceLabel: string;
  sourcePath: string;
  eventLabel: string;
  matchupHref?: string | null;
  externalEventId?: string | null;
  sportsbookKey?: string | null;
  sportsbookName?: string | null;
  supportStatus?: BoardSupportStatus | null;
  supportNote?: string | null;
  marketDeltaAmerican?: number | null;
  expectedValuePct?: number | null;
  edgeScore?: number | null;
  edgeLabel?: EdgeBand | null;
  confidenceTier?: BetConfidenceTier | null;
  valueFlag?: "BEST_PRICE" | "MARKET_PLUS" | "STEAM" | "NONE" | null;
  capturedAt: string;
};

export type BetIntentLeg = {
  eventId?: string | null;
  externalEventId?: string | null;
  sportsbookKey?: string | null;
  sportsbookName?: string | null;
  marketType: LedgerMarketType;
  marketLabel: string;
  selection: string;
  side?: string | null;
  line?: number | null;
  oddsAmerican: number;
  notes?: string;
  context?: BetSignalContext | null;
};

export type BetIntent = {
  betType: LedgerBetType;
  sport: SupportedSportCode;
  league: SupportedLeagueKey;
  eventLabel: string;
  eventId?: string | null;
  externalEventId?: string | null;
  matchupHref?: string | null;
  sportsbookKey?: string | null;
  sportsbookName?: string | null;
  source: "MANUAL";
  isLive: boolean;
  tags?: string[];
  notes?: string;
  context?: BetSignalContext | null;
  legs: BetIntentLeg[];
};

export type BetSlipEntry = {
  id: string;
  createdAt: string;
  intent: BetIntent;
};

export type LeakSignal = {
  id: string;
  title: string;
  detail: string;
  sampleSize: number;
  severity: "danger" | "premium" | "muted";
};

export type PremiumGateKey =
  | "deep_edge_breakdown"
  | "leak_detector_detail"
  | "top_play_explanations";
