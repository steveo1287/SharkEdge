export function buildCoreSeedData() {
  type EventResultSeed = {
    id: string;
    eventId: string;
    winnerCompetitorId: string | null;
    loserCompetitorId: string | null;
    winningSide: string | null;
    method: string | null;
    period: number | null;
    margin: number | null;
    totalPoints: number | null;
    participantResultsJson: Array<Record<string, unknown>>;
    metadataJson: Record<string, unknown> | null;
    officialAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };

  const timestamps = {
    createdAt: new Date("2026-03-23T00:00:00.000Z"),
    updatedAt: new Date("2026-03-23T00:00:00.000Z")
  };

  const sports = [
    {
      id: "sport_basketball",
      key: "basketball",
      name: "Basketball",
      code: "BASKETBALL",
      category: "team",
      ...timestamps
    },
    {
      id: "sport_baseball",
      key: "baseball",
      name: "Baseball",
      code: "BASEBALL",
      category: "team",
      ...timestamps
    },
    {
      id: "sport_hockey",
      key: "hockey",
      name: "Hockey",
      code: "HOCKEY",
      category: "team",
      ...timestamps
    },
    {
      id: "sport_football",
      key: "football",
      name: "Football",
      code: "FOOTBALL",
      category: "team",
      ...timestamps
    },
    {
      id: "sport_mma",
      key: "mma",
      name: "Mixed Martial Arts",
      code: "MMA",
      category: "combat",
      ...timestamps
    },
    {
      id: "sport_boxing",
      key: "boxing",
      name: "Boxing",
      code: "BOXING",
      category: "combat",
      ...timestamps
    }
  ] as const;

  const leagues = [
    {
      id: "league_mlb",
      key: "MLB",
      name: "Major League Baseball",
      sport: "BASEBALL",
      sportId: "sport_baseball",
      ...timestamps
    },
    {
      id: "league_nhl",
      key: "NHL",
      name: "National Hockey League",
      sport: "HOCKEY",
      sportId: "sport_hockey",
      ...timestamps
    },
    {
      id: "league_nfl",
      key: "NFL",
      name: "National Football League",
      sport: "FOOTBALL",
      sportId: "sport_football",
      ...timestamps
    },
    {
      id: "league_ncaaf",
      key: "NCAAF",
      name: "College Football",
      sport: "FOOTBALL",
      sportId: "sport_football",
      ...timestamps
    },
    {
      id: "league_ufc",
      key: "UFC",
      name: "Ultimate Fighting Championship",
      sport: "MMA",
      sportId: "sport_mma",
      ...timestamps
    },
    {
      id: "league_boxing",
      key: "BOXING",
      name: "Professional Boxing",
      sport: "BOXING",
      sportId: "sport_boxing",
      ...timestamps
    }
  ] as const;

  const competitors = [
    {
      id: "competitor_islam",
      sportId: "sport_mma",
      leagueId: "league_ufc",
      key: "UFC:islam-makhachev",
      type: "FIGHTER",
      name: "Islam Makhachev",
      shortName: "Islam Makhachev",
      abbreviation: "MAKH",
      externalIds: { sharkedge: "islam-makhachev" },
      metadataJson: { weightClass: "Lightweight" },
      ...timestamps
    },
    {
      id: "competitor_arman",
      sportId: "sport_mma",
      leagueId: "league_ufc",
      key: "UFC:arman-tsarukyan",
      type: "FIGHTER",
      name: "Arman Tsarukyan",
      shortName: "Arman Tsarukyan",
      abbreviation: "TSAR",
      externalIds: { sharkedge: "arman-tsarukyan" },
      metadataJson: { weightClass: "Lightweight" },
      ...timestamps
    },
    {
      id: "competitor_alex",
      sportId: "sport_mma",
      leagueId: "league_ufc",
      key: "UFC:alex-pereira",
      type: "FIGHTER",
      name: "Alex Pereira",
      shortName: "Alex Pereira",
      abbreviation: "POAT",
      externalIds: { sharkedge: "alex-pereira" },
      metadataJson: { weightClass: "Light Heavyweight" },
      ...timestamps
    },
    {
      id: "competitor_magomed",
      sportId: "sport_mma",
      leagueId: "league_ufc",
      key: "UFC:magomed-ankalaev",
      type: "FIGHTER",
      name: "Magomed Ankalaev",
      shortName: "Magomed Ankalaev",
      abbreviation: "ANKA",
      externalIds: { sharkedge: "magomed-ankalaev" },
      metadataJson: { weightClass: "Light Heavyweight" },
      ...timestamps
    },
    {
      id: "competitor_canelo",
      sportId: "sport_boxing",
      leagueId: "league_boxing",
      key: "BOXING:canelo-alvarez",
      type: "FIGHTER",
      name: "Canelo Alvarez",
      shortName: "Canelo Alvarez",
      abbreviation: "CANE",
      externalIds: { sharkedge: "canelo-alvarez" },
      metadataJson: { division: "Super Middleweight" },
      ...timestamps
    },
    {
      id: "competitor_benavidez",
      sportId: "sport_boxing",
      leagueId: "league_boxing",
      key: "BOXING:david-benavidez",
      type: "FIGHTER",
      name: "David Benavidez",
      shortName: "David Benavidez",
      abbreviation: "BENA",
      externalIds: { sharkedge: "david-benavidez" },
      metadataJson: { division: "Super Middleweight" },
      ...timestamps
    },
    {
      id: "competitor_crawford",
      sportId: "sport_boxing",
      leagueId: "league_boxing",
      key: "BOXING:terence-crawford",
      type: "FIGHTER",
      name: "Terence Crawford",
      shortName: "Terence Crawford",
      abbreviation: "CRAW",
      externalIds: { sharkedge: "terence-crawford" },
      metadataJson: { division: "Welterweight" },
      ...timestamps
    },
    {
      id: "competitor_ennis",
      sportId: "sport_boxing",
      leagueId: "league_boxing",
      key: "BOXING:jaron-ennis",
      type: "FIGHTER",
      name: "Jaron Ennis",
      shortName: "Jaron Ennis",
      abbreviation: "ENNI",
      externalIds: { sharkedge: "jaron-ennis" },
      metadataJson: { division: "Welterweight" },
      ...timestamps
    }
  ] as const;

  const events = [
    {
      id: "event_ufc_title",
      sportId: "sport_mma",
      leagueId: "league_ufc",
      externalEventId: null,
      providerKey: "seed",
      name: "Islam Makhachev vs Arman Tsarukyan",
      slug: "islam-vs-arman",
      startTime: new Date("2026-04-12T03:00:00.000Z"),
      status: "SCHEDULED",
      resultState: "PENDING",
      eventType: "COMBAT_HEAD_TO_HEAD",
      venue: "T-Mobile Arena",
      scoreJson: null,
      stateJson: null,
      resultJson: null,
      metadataJson: { card: "UFC 318", rounds: 5 },
      syncState: "UNSUPPORTED",
      lastSyncedAt: null,
      createdAt: timestamps.createdAt,
      updatedAt: timestamps.updatedAt
    },
    {
      id: "event_ufc_lhw",
      sportId: "sport_mma",
      leagueId: "league_ufc",
      externalEventId: null,
      providerKey: "seed",
      name: "Alex Pereira vs Magomed Ankalaev",
      slug: "pereira-vs-ankalaev",
      startTime: new Date("2026-04-19T03:00:00.000Z"),
      status: "SCHEDULED",
      resultState: "PENDING",
      eventType: "COMBAT_HEAD_TO_HEAD",
      venue: "Kaseya Center",
      scoreJson: null,
      stateJson: null,
      resultJson: null,
      metadataJson: { card: "UFC 319", rounds: 5 },
      syncState: "UNSUPPORTED",
      lastSyncedAt: null,
      createdAt: timestamps.createdAt,
      updatedAt: timestamps.updatedAt
    },
    {
      id: "event_boxing_canelo",
      sportId: "sport_boxing",
      leagueId: "league_boxing",
      externalEventId: null,
      providerKey: "seed",
      name: "Canelo Alvarez vs David Benavidez",
      slug: "canelo-vs-benavidez",
      startTime: new Date("2026-05-03T03:00:00.000Z"),
      status: "SCHEDULED",
      resultState: "PENDING",
      eventType: "COMBAT_HEAD_TO_HEAD",
      venue: "T-Mobile Arena",
      scoreJson: null,
      stateJson: null,
      resultJson: null,
      metadataJson: { rounds: 12, titleFight: true },
      syncState: "UNSUPPORTED",
      lastSyncedAt: null,
      createdAt: timestamps.createdAt,
      updatedAt: timestamps.updatedAt
    },
    {
      id: "event_boxing_crawford",
      sportId: "sport_boxing",
      leagueId: "league_boxing",
      externalEventId: null,
      providerKey: "seed",
      name: "Terence Crawford vs Jaron Ennis",
      slug: "crawford-vs-ennis",
      startTime: new Date("2026-05-17T03:00:00.000Z"),
      status: "SCHEDULED",
      resultState: "PENDING",
      eventType: "COMBAT_HEAD_TO_HEAD",
      venue: "Madison Square Garden",
      scoreJson: null,
      stateJson: null,
      resultJson: null,
      metadataJson: { rounds: 12, titleFight: true },
      syncState: "UNSUPPORTED",
      lastSyncedAt: null,
      createdAt: timestamps.createdAt,
      updatedAt: timestamps.updatedAt
    }
  ];

  const eventParticipants = [
    {
      eventId: "event_ufc_title",
      competitorId: "competitor_islam",
      role: "COMPETITOR_A",
      sortOrder: 0,
      isHome: null,
      isWinner: null,
      score: null,
      record: "27-1-0",
      metadataJson: { corner: "red" }
    },
    {
      eventId: "event_ufc_title",
      competitorId: "competitor_arman",
      role: "COMPETITOR_B",
      sortOrder: 1,
      isHome: null,
      isWinner: null,
      score: null,
      record: "23-3-0",
      metadataJson: { corner: "blue" }
    },
    {
      eventId: "event_ufc_lhw",
      competitorId: "competitor_alex",
      role: "COMPETITOR_A",
      sortOrder: 0,
      isHome: null,
      isWinner: null,
      score: null,
      record: "12-2-0",
      metadataJson: { corner: "red" }
    },
    {
      eventId: "event_ufc_lhw",
      competitorId: "competitor_magomed",
      role: "COMPETITOR_B",
      sortOrder: 1,
      isHome: null,
      isWinner: null,
      score: null,
      record: "20-1-1",
      metadataJson: { corner: "blue" }
    },
    {
      eventId: "event_boxing_canelo",
      competitorId: "competitor_canelo",
      role: "COMPETITOR_A",
      sortOrder: 0,
      isHome: null,
      isWinner: null,
      score: null,
      record: "61-2-2",
      metadataJson: { corner: "red" }
    },
    {
      eventId: "event_boxing_canelo",
      competitorId: "competitor_benavidez",
      role: "COMPETITOR_B",
      sortOrder: 1,
      isHome: null,
      isWinner: null,
      score: null,
      record: "30-0-0",
      metadataJson: { corner: "blue" }
    },
    {
      eventId: "event_boxing_crawford",
      competitorId: "competitor_crawford",
      role: "COMPETITOR_A",
      sortOrder: 0,
      isHome: null,
      isWinner: null,
      score: null,
      record: "41-0-0",
      metadataJson: { corner: "red" }
    },
    {
      eventId: "event_boxing_crawford",
      competitorId: "competitor_ennis",
      role: "COMPETITOR_B",
      sortOrder: 1,
      isHome: null,
      isWinner: null,
      score: null,
      record: "34-0-0",
      metadataJson: { corner: "blue" }
    }
  ] as const;

  const eventResults: EventResultSeed[] = [];

  return {
    sports,
    leagues,
    competitors,
    events,
    eventParticipants,
    eventResults
  };
}
