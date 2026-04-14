import assert from "node:assert/strict";

import { buildLeagueStoryPackage } from "@/services/content/story-writer-service";

async function run(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function main() {
  await run("box score recaps produce a real story package", async () => {
    const story = await buildLeagueStoryPackage({
      league: "MLB",
      title: "White Sox beat Marlins in a low-scoring finish",
      summary: "Chicago scratched out enough late offense to close the series opener.",
      category: "Recap",
      eventLabel: "Chicago White Sox @ Miami Marlins",
      supportingFacts: ["Series opener", "Late offense", "Bullpen held the lead"],
      boxscore: {
        awayTeam: "Chicago White Sox",
        homeTeam: "Miami Marlins",
        awayScore: 4,
        homeScore: 2
      }
    });

    assert.equal(story.eyebrow, "MLB recap");
    assert.equal(story.sections.length, 3);
    assert.ok(story.boxscoreSummary?.includes("4-2"));
    assert.ok(story.bettingImpact.includes("price") || story.bettingImpact.includes("spread"));
  });

  await run("availability stories still render betting context without a box score", async () => {
    const story = await buildLeagueStoryPackage({
      league: "NBA",
      title: "Jayson Tatum questionable for tonight",
      summary: "Boston will carry major usage questions into the final injury report.",
      category: "Injury report",
      supportingFacts: ["Usage swing", "Rotation impact"]
    });

    assert.equal(story.eyebrow, "NBA availability watch");
    assert.equal(story.sections.length, 3);
    assert.equal(story.boxscoreSummary, null);
    assert.ok(story.takeaways[0]?.includes("availability"));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
