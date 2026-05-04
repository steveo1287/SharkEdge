import { buildGeneratedSystemAttachments } from "./generated-system-attachments";
import { buildMarketIntelligencePayload } from "./market-intelligence";
import { buildTrendVerificationPayload } from "./trend-verification";
import { buildTrendsCenterSnapshot } from "./trends-center";

export type CommandBoardV2Options = { league?: string | "ALL"; market?: string | "ALL"; limit?: number };

export type CommandBoardV2Game = {
  eventId: string;
  eventLabel: string;
  league: string;
  startTime: string;
  status: string;
  href: string;
  commandScore: number;
  commandTier: "action" | "watch" | "research" | "blocked";
  actionGate: string;
  nativeTrend: Record<string, unknown> | null;
  generatedSystem: Record<string, unknown> | null;
  market: Record<string, unknown> | null;
  counts: { native: number; generated: number; blockers: number };
  reasons: string[];
  blockers: string[];
};

export type CommandBoardV2Payload = {
  generatedAt: string;
  sourceNote: string;
  games: CommandBoardV2Game[];
  stats: { games: number; action: number; watch: number; research: number; blocked: number; nativeTrends: number; verifiedGenerated: number; marketSourced: number };
};

function trendScore(trend: any) {
  return Number(trend?.sharkScore ?? trend?.score ?? trend?.strength?.score ?? 0);
}

function proof(item: any) {
  const value = item?.proof ?? item ?? {};
  return {
    record: value.record ?? "TBD",
    sampleSize: value.sampleSize ?? null,
    profitUnits: value.profitUnits ?? null,
    roiPct: value.roiPct ?? null,
    winRatePct: value.winRatePct ?? null,
    clvPct: value.clvPct ?? null
  };
}

function verificationAllows(item: any) {
  return Boolean(item?.verified) && ["A", "B"].includes(String(item.grade)) && item.sourceRisk !== "high" && item.overfitRisk !== "high" && item.hasCurrentAttachment && !(item.blockers ?? []).length;
}

function gate(score: number, blockers: string[], generated: boolean, market: any): CommandBoardV2Game["commandTier"] {
  if (blockers.length >= 3) return "blocked";
  if (score >= 80 && generated && market?.sourceStatus !== "unavailable") return "action";
  if (score >= 60) return "watch";
  return blockers.length ? "blocked" : "research";
}

function gateText(tier: CommandBoardV2Game["commandTier"], blockers: string[]) {
  if (tier === "action") return "Review now: verified generated fit, native trend context, and market context are aligned.";
  if (tier === "watch") return "Watch: signal stack exists, but one confirmation layer is still incomplete.";
  if (tier === "blocked") return `Blocked: ${blockers[0] ?? "quality gate incomplete"}.`;
  return "Research: context exists, but not enough confirmation for promotion.";
}

function verifiedGeneratedForGame(games: Awaited<ReturnType<typeof buildGeneratedSystemAttachments>>["games"], eventId: string, verificationById: Map<string, any>) {
  const game = games.find((item) => item.eventId === eventId);
  if (!game) return [];
  return game.topSystems
    .map((system) => {
      const verified = verificationById.get(system.systemId);
      if (!verificationAllows(verified)) return null;
      return {
        systemId: system.systemId,
        name: system.name,
        market: system.market,
        side: system.side,
        grade: verified.grade,
        verificationScore: verified.verificationScore,
        proof: proof(verified),
        reasons: verified.reasons?.slice(0, 4) ?? [],
        matchedConditions: system.matchedConditions?.slice(0, 4) ?? []
      };
    })
    .filter(Boolean)
    .sort((left: any, right: any) => Number(right.verificationScore ?? 0) - Number(left.verificationScore ?? 0));
}

export async function buildCommandBoardV2(options: CommandBoardV2Options = {}): Promise<CommandBoardV2Payload> {
  const league = (options.league ?? "ALL").toUpperCase();
  const marketFilter = (options.market ?? "ALL").toLowerCase();
  const limit = options.limit ?? 40;
  const [snapshot, generated, verification, market] = await Promise.all([
    buildTrendsCenterSnapshot(),
    buildGeneratedSystemAttachments({ league, topSystemsPerGame: 5, includeResearch: false }),
    buildTrendVerificationPayload({ league, market: marketFilter, limit: 500, requireCurrentAttachment: true }),
    buildMarketIntelligencePayload({ league, limitEvents: 200 })
  ]);

  const verificationById = new Map(verification.results.map((item) => [item.systemId, item]));
  const marketByEventId = new Map(market.signals.map((item) => [item.eventId, item]));
  const sourceGames = (snapshot.matchupsByLeague ?? [])
    .filter((group: any) => league === "ALL" || String(group.league ?? "").toUpperCase() === league)
    .flatMap((group: any) => (group.matchups ?? []).map((matchup: any) => ({ ...matchup, league: group.league })));

  const games = sourceGames.map((matchup: any) => {
    const eventId = String(matchup.gameId ?? matchup.eventId ?? matchup.id);
    const nativeTrends = (matchup.allTrends ?? matchup.trends ?? [])
      .filter((trend: any) => marketFilter === "ALL" || String(trend.market ?? "").toLowerCase() === marketFilter)
      .sort((left: any, right: any) => trendScore(right) - trendScore(left));
    const generatedSystems = verifiedGeneratedForGame(generated.games, eventId, verificationById);
    const marketSignal = marketByEventId.get(eventId);
    const blockers: string[] = [];
    const reasons: string[] = [];

    if (nativeTrends.length) reasons.push("Native trend stack attached.");
    else blockers.push("no_native_trend_stack");
    if (generatedSystems.length) reasons.push("Verified generated system attached.");
    else blockers.push("no_verified_generated_system");
    if (marketSignal && marketSignal.sourceStatus !== "unavailable") reasons.push("Market context sourced.");
    else blockers.push("market_context_not_sourced");

    const native = nativeTrends[0] ?? null;
    const generatedTop = generatedSystems[0] ?? null;
    const baseScore = Math.max(trendScore(native), Number((generatedTop as any)?.verificationScore ?? 0));
    const marketBoost = marketSignal?.sourceStatus === "sourced" ? 18 : marketSignal?.sourceStatus === "partial" ? 8 : 0;
    const commandScore = Math.max(0, Math.min(100, Math.round(baseScore + marketBoost - blockers.length * 8)));
    const commandTier = gate(commandScore, blockers, Boolean(generatedTop), marketSignal);

    return {
      eventId,
      eventLabel: matchup.eventLabel,
      league: matchup.league,
      startTime: matchup.startTime,
      status: matchup.status,
      href: matchup.href ?? `/sharktrends/matchup/${encodeURIComponent(matchup.league)}/${encodeURIComponent(eventId)}`,
      commandScore,
      commandTier,
      actionGate: gateText(commandTier, blockers),
      nativeTrend: native ? { id: native.id, systemId: native.systemId, name: native.name, market: native.market, side: native.side, price: native.price, edgePct: native.edgePct, score: trendScore(native), proof: proof(native), action: native.actionLabel ?? native.primaryAction ?? native.actionability, blockers: native.blockers ?? [] } : null,
      generatedSystem: generatedTop,
      market: marketSignal ? { sourceStatus: marketSignal.sourceStatus, lineMovement: marketSignal.lineMovement, clv: marketSignal.clv, bookDisagreement: marketSignal.bookDisagreement, splits: marketSignal.splits, reasons: marketSignal.reasons, blockers: marketSignal.blockers } : null,
      counts: { native: nativeTrends.length, generated: generatedSystems.length, blockers: blockers.length },
      reasons,
      blockers
    };
  }).sort((left: CommandBoardV2Game, right: CommandBoardV2Game) => right.commandScore - left.commandScore || left.startTime.localeCompare(right.startTime)).slice(0, limit);

  return {
    generatedAt: new Date().toISOString(),
    sourceNote: "Command Board v2 composes native trends, verified generated systems, and sourced market context into a game-first view.",
    games,
    stats: {
      games: games.length,
      action: games.filter((game) => game.commandTier === "action").length,
      watch: games.filter((game) => game.commandTier === "watch").length,
      research: games.filter((game) => game.commandTier === "research").length,
      blocked: games.filter((game) => game.commandTier === "blocked").length,
      nativeTrends: games.reduce((total, game) => total + game.counts.native, 0),
      verifiedGenerated: games.reduce((total, game) => total + game.counts.generated, 0),
      marketSourced: games.filter((game) => game.market && String((game.market as any).sourceStatus) !== "unavailable").length
    }
  };
}
