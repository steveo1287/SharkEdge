import Link from "next/link";
import { notFound } from "next/navigation";

import { BetSlipBoundary } from "@/components/bets/bet-slip-boundary";
import { MatchupDecisionModule } from "@/components/game/matchup-decision-module";
import { MatchupPanel } from "@/components/game/matchup-panel";
import { OddsTable } from "@/components/game/odds-table";
import { OverviewPanel } from "@/components/game/overview-panel";
import { PropList } from "@/components/game/prop-list";
import { OpportunityActionBadge } from "@/components/intelligence/opportunity-badges";
import { OpportunitySpotlightCard } from "@/components/intelligence/opportunity-spotlight-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { formatGameDateTime } from "@/lib/formatters/date";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
import {
  buildGameHubKalshiCards,
  buildGameHubMetrics,
  buildGameHubMovementCards,
  buildGameHubSplitsCards,
  buildGameHubTabs
} from "@/services/matchups/game-ui-adapter";
import { buildGameHubPresentation } from "@/services/matchups/game-hub-presenter";

import {
  DeskCard,
  getProviderHealthTone,
  getStatusTone,
  getSupportTone,
  HubTab,
  MetricTile,
  QuickJump
} from "./_components/game-hub-primitives";