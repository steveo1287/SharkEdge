import assert from "node:assert/strict";

import {
  simulateNflSeason,
  type NflSeasonGameInput,
  type NflSeasonTeamInput
} from "../services/nfl/season-projection-engine";

const teams: NflSeasonTeamInput[] = [];
for (const conference of ["AFC", "NFC"] as const) {
  for (let index = 0; index < 8; index += 1) {
    teams.push({
      id: `${conference}-${index + 1}`,
      name: `${conference} Team ${index + 1}`,
      conference,
      division: `${conference}-${String.fromCharCode(65 + Math.floor(index / 2))}`,
      powerRating: 0.82 - index * 0.065,
      quarterback: {
        starterProbability: index === 0 ? 0.82 : 0.95,
        starterAdjustment: 20,
        backupAdjustment: -100
      }
    });
  }
}

const games: NflSeasonGameInput[] = [];
for (const conference of ["AFC", "NFC"] as const) {
  const conferenceTeams = teams.filter((team) => team.conference === conference);
  for (let left = 0; left < conferenceTeams.length; left += 1) {
    for (let right = left + 1; right < conferenceTeams.length; right += 1) {
      games.push({
        id: `${conference}-${left + 1}-${right + 1}`,
        week: right,
        homeTeamId: conferenceTeams[left].id,
        awayTeamId: conferenceTeams[right].id,
        tieProbability: 0
      });
    }
  }
}

const input = {
  teams,
  games,
  iterations: 750,
  seed: 424242,
  homeFieldRating: 55
};

const first = simulateNflSeason(input);
const second = simulateNflSeason(input);

assert.deepEqual(
  first.teams.map((team) => ({
    teamId: team.teamId,
    meanWins: team.meanWins,
    playoffOddsPct: team.playoffOddsPct,
    superBowlOddsPct: team.superBowlOddsPct
  })),
  second.teams.map((team) => ({
    teamId: team.teamId,
    meanWins: team.meanWins,
    playoffOddsPct: team.playoffOddsPct,
    superBowlOddsPct: team.superBowlOddsPct
  }))
);

assert.equal(first.audit.scheduleGames, games.length);
assert.equal(first.audit.totalGameSimulations, games.length * input.iterations);
assert.equal(first.audit.expectedTeamGamesTarget, games.length * 2);
assert.ok(first.audit.scheduleBalanceDelta <= 0.01);
assert.ok(
  Math.abs(first.audit.expectedLeagueWins - first.audit.expectedLeagueLosses) <= 0.01
);

for (const conference of ["AFC", "NFC"] as const) {
  const conferenceRows = first.teams.filter((team) => team.conference === conference);
  const playoffTotal = conferenceRows.reduce(
    (sum, team) => sum + team.playoffOddsPct,
    0
  );
  assert.ok(Math.abs(playoffTotal - 700) <= 0.2);

  for (let seed = 1; seed <= 7; seed += 1) {
    const seedTotal = conferenceRows.reduce(
      (sum, team) => sum + team.seedOddsPct[String(seed) as keyof typeof team.seedOddsPct],
      0
    );
    assert.ok(Math.abs(seedTotal - 100) <= 0.2);
  }
}

const topAfc = first.teams
  .filter((team) => team.conference === "AFC")
  .sort((left, right) => right.meanWins - left.meanWins)[0];
const bottomAfc = first.teams
  .filter((team) => team.conference === "AFC")
  .sort((left, right) => left.meanWins - right.meanWins)[0];
assert.ok(topAfc.meanWins > bottomAfc.meanWins);
assert.ok(topAfc.playoffOddsPct >= bottomAfc.playoffOddsPct);

const completedSchedule = [...games];
completedSchedule[0] = {
  id: "completed-1",
  week: 1,
  homeTeamId: "AFC-1",
  awayTeamId: "AFC-2",
  completedResult: { homeScore: 31, awayScore: 17 }
};
const completedProjection = simulateNflSeason({
  teams,
  games: completedSchedule,
  iterations: 1,
  seed: 7
});
const completedWinner = completedProjection.teams.find(
  (team) => team.teamId === "AFC-1"
);
assert.ok(completedWinner);
assert.ok((completedWinner?.meanWins ?? 0) >= 1);

console.log("nfl season projection engine tests passed");
