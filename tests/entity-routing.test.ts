import { getLeagueForSportKey } from "@/services/odds/live-reference";
import { matchEventToGame } from "@/services/events/live-score-service";
import type { ProviderEvent } from "@/services/events/provider-types";
import {
  getPlayerHeadshotUrl,
  getScopedEventExternalIdCandidates,
  getTeamLogoUrl,
  resolveMatchupHref,
  scopeEventExternalId
} from "@/lib/utils/entity-routing";
import type { GameCardView } from "@/lib/types/domain";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function testScopedEventIdentityIsDeterministic() {
  assert(
    scopeEventExternalId("NBA", "401123") === "NBA:401123",
    "expected league-scoped event id"
  );
  assert(
    scopeEventExternalId("NBA", "NBA:401123") === "NBA:401123",
    "expected already scoped id to remain stable"
  );

  const nbaCandidates = getScopedEventExternalIdCandidates("NBA", "401123");
  const mlbCandidates = getScopedEventExternalIdCandidates("MLB", "401123");

  assert(
    nbaCandidates.includes("NBA:401123") && nbaCandidates.includes("401123"),
    "expected candidate lookup to include scoped and legacy ids"
  );
  assert(
    !nbaCandidates.some((candidate) => mlbCandidates.includes(candidate) && candidate !== "401123"),
    "expected scoped candidate sets to stay league-specific"
  );
}

function testMatchupHrefUsesScopedLeagueContext() {
  assert(
    resolveMatchupHref({
      leagueKey: "NBA",
      externalEventId: "401123"
    }) === "/game/NBA__401123",
    "expected canonical matchup href"
  );
}

function testUnsupportedSportsStayOutOfBoardMapping() {
  assert(getLeagueForSportKey("basketball_nba") === "NBA", "expected supported mapping");
  assert(getLeagueForSportKey("soccer_epl") === null, "expected unsupported soccer mapping to stay out");
}

function testMediaSelectorsStayDeterministicAndSafe() {
  assert(
    getTeamLogoUrl("NBA", { externalIds: { espn: "2" } })?.includes("/nba/500/2.png"),
    "expected nba logo seam to resolve espn logos"
  );
  assert(
    getTeamLogoUrl("UFC", { externalIds: { espn: "2" } }) === null,
    "expected unsupported team logo contexts to stay null"
  );
  assert(
    getPlayerHeadshotUrl("NBA", { externalIds: { espn: "4065648" } })?.includes("/nba/players/full/4065648.png"),
    "expected nba headshot seam to resolve"
  );
}

function testMismatchedEventsDoNotJoinAcrossWindows() {
  const game: GameCardView = {
    id: "nba-live-1",
    externalEventId: "nba-live-1",
    leagueKey: "NBA",
    awayTeam: {
      id: "away",
      leagueId: "nba",
      name: "Los Angeles Lakers",
      abbreviation: "LAL",
      externalIds: {}
    },
    homeTeam: {
      id: "home",
      leagueId: "nba",
      name: "Boston Celtics",
      abbreviation: "BOS",
      externalIds: {}
    },
    startTime: "2026-04-04T00:00:00.000Z",
    status: "PREGAME",
    venue: "TD Garden",
    selectedBook: null,
    bestBookCount: 4,
    spread: { label: "LAL +4.5", lineLabel: "LAL +4.5", bestBook: "DraftKings", bestOdds: -110, movement: 0 },
    moneyline: { label: "LAL ML", lineLabel: "LAL ML", bestBook: "DraftKings", bestOdds: 140, movement: 0 },
    total: { label: "O/U 229.5", lineLabel: "O/U 229.5", bestBook: "DraftKings", bestOdds: -108, movement: 0 },
    edgeScore: { score: 70, label: "Strong" },
    detailHref: "/game/NBA__nba-live-1"
  };

  const mismatchedEvent: ProviderEvent = {
    externalEventId: "espn-1",
    providerKey: "espn",
    sportCode: "BASKETBALL",
    leagueKey: "NBA",
    name: "Lakers at Celtics",
    startTime: "2026-04-08T00:00:00.000Z",
    status: "SCHEDULED",
    resultState: "PENDING",
    eventType: "TEAM_HEAD_TO_HEAD",
    venue: "TD Garden",
    scoreJson: null,
    stateJson: null,
    resultJson: null,
    metadataJson: null,
    participants: [
      {
        externalCompetitorId: "lal",
        role: "AWAY",
        sortOrder: 0,
        name: "Los Angeles Lakers",
        abbreviation: "LAL",
        type: "TEAM",
        score: null,
        record: null,
        isWinner: null,
        metadata: {}
      },
      {
        externalCompetitorId: "bos",
        role: "HOME",
        sortOrder: 1,
        name: "Boston Celtics",
        abbreviation: "BOS",
        type: "TEAM",
        score: null,
        record: null,
        isWinner: null,
        metadata: {}
      }
    ]
  };

  assert(
    matchEventToGame(game, [mismatchedEvent]) === null,
    "expected same-name teams outside the event window to stay unmatched"
  );
}

function run() {
  testScopedEventIdentityIsDeterministic();
  testMatchupHrefUsesScopedLeagueContext();
  testUnsupportedSportsStayOutOfBoardMapping();
  testMediaSelectorsStayDeterministicAndSafe();
  testMismatchedEventsDoNotJoinAcrossWindows();
  console.log("entity-routing.test.ts: ok");
}

run();
