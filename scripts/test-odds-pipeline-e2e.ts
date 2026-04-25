#!/usr/bin/env node
/**
 * End-to-end test for the odds pipeline
 * Tests: OddsHarvester ingest → DB → diagnostics → board API → board page
 */

const BASE_URL = process.env.SHARKEDGE_BACKEND_URL || "http://localhost:3000";
const API_KEY = process.env.INTERNAL_API_KEY || "test-key";

interface OddsHarvesterPayload {
  sport: string;
  sportKey: string;
  eventKey: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  sourceMeta: {
    league: string;
  };
  lines: {
    moneyline?: {
      home: number;
      away: number;
    };
    spread?: {
      home: number;
      away: number;
    };
    total?: {
      over: number;
      under: number;
    };
  };
}

function buildTestPayload(): OddsHarvesterPayload {
  const now = new Date();
  const startTime = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();

  return {
    sport: "baseball",
    sportKey: "baseball_mlb",
    eventKey: "nyyankees_bosredsox_20260425_test",
    homeTeam: "Red Sox",
    awayTeam: "Yankees",
    commenceTime: startTime,
    sourceMeta: {
      league: "MLB"
    },
    lines: {
      moneyline: {
        home: -110,
        away: -110
      },
      spread: {
        home: -1.5,
        away: 1.5
      },
      total: {
        over: 9.5,
        under: 9.5
      }
    }
  };
}

async function postToIngest(payload: OddsHarvesterPayload): Promise<any> {
  console.log("\n📤 Posting OddsHarvester payload to /api/ingest/odds...");

  try {
    const response = await fetch(`${BASE_URL}/api/ingest/odds`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("✅ Ingest successful:", JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error("❌ Ingest failed:", error);
    throw error;
  }
}

async function checkDiagnostics(): Promise<any> {
  console.log("\n🔍 Calling /api/diagnostics/odds-pipeline...");

  try {
    const response = await fetch(`${BASE_URL}/api/diagnostics/odds-pipeline`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Print key diagnostics
    console.log("\n📊 Database Status:");
    console.log(`  Database Reachable: ${data.diagnostics.database.reachable}`);

    console.log("\n📚 Leagues:");
    console.log(`  Total: ${data.diagnostics.leagues.total}`);
    if (data.diagnostics.leagues.byKey) {
      console.log(`  Keys: ${data.diagnostics.leagues.byKey.map((l: any) => l.key).join(", ")}`);
    }

    console.log("\n🎮 Events (7-day window):");
    console.log(`  Total: ${data.diagnostics.events.total}`);
    if (data.diagnostics.events.recent?.length > 0) {
      console.log(`  Recent (first 5):`);
      data.diagnostics.events.recent.slice(0, 5).forEach((e: any) => {
        console.log(`    - ${e.name} (${e.league?.key}) from ${e.providerKey}`);
      });
    }

    console.log("\n💰 Event Markets (24h):");
    console.log(`  Total: ${data.diagnostics.eventMarkets.total24h}`);
    if (data.diagnostics.eventMarkets.bySource) {
      console.log(`  By Source:`);
      data.diagnostics.eventMarkets.bySource.forEach((source: any) => {
        console.log(`    - ${source.sourceKey}: ${source._count}`);
      });
    }

    console.log("\n⚽ OddsHarvester Data:");
    console.log(`  Events: ${data.diagnostics.oddsharvester.eventCount}`);
    console.log(`  Markets: ${data.diagnostics.oddsharvester.marketCount}`);
    if (data.diagnostics.oddsharvester.recentMarkets?.length > 0) {
      console.log(`  Recent Markets (first 3):`);
      data.diagnostics.oddsharvester.recentMarkets.slice(0, 3).forEach((m: any) => {
        console.log(`    - ${m.event?.name} (${m.marketType}) @ ${m.event?.league?.key}`);
      });
    }

    return data;
  } catch (error) {
    console.error("❌ Diagnostics fetch failed:", error);
    throw error;
  }
}

async function checkBoardAPI(league: string): Promise<any> {
  console.log(`\n📡 Calling /api/v1/board?league=${league}...`);

  try {
    const response = await fetch(`${BASE_URL}/api/v1/board?league=${league}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.sportSections?.length === 0) {
      console.log(`⚠️  No games found for ${league}`);
      return data;
    }

    console.log(`✅ Found ${data.sportSections.length} league section(s)`);

    data.sportSections.forEach((section: any) => {
      console.log(`\n  ${section.leagueLabel}:`);
      console.log(`    Games: ${section.games.length}`);
      section.games.slice(0, 3).forEach((game: any) => {
        const away = game.awayTeam?.name || "Away";
        const home = game.homeTeam?.name || "Home";
        const ml = game.moneyline?.bestOdds || "—";
        console.log(`      ${away} @ ${home} (ML: ${ml})`);
      });
    });

    return data;
  } catch (error) {
    console.error("❌ Board API fetch failed:", error);
    throw error;
  }
}

async function main() {
  console.log("🚀 Starting odds pipeline end-to-end test");
  console.log(`   Backend URL: ${BASE_URL}`);
  console.log(`   API Key: ${API_KEY.slice(0, 5)}...`);

  try {
    // Step 1: Post sample data
    const payload = buildTestPayload();
    const ingestResult = await postToIngest(payload);

    // Step 2: Wait a moment for data to persist
    console.log("\n⏳ Waiting 2s for data to persist...");
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 3: Check diagnostics
    const diagnostics = await checkDiagnostics();

    // Step 4: Check board API
    const boardData = await checkBoardAPI("MLB");

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("✅ PIPELINE TEST COMPLETE");
    console.log("=".repeat(60));
    console.log("\n📋 Summary:");
    console.log(`  Database:        ${diagnostics.diagnostics.database.reachable ? "✅" : "❌"}`);
    console.log(`  Leagues:         ${diagnostics.diagnostics.leagues.total} total`);
    console.log(`  Events (7d):     ${diagnostics.diagnostics.events.total} total`);
    console.log(`  Markets (24h):   ${diagnostics.diagnostics.eventMarkets.total24h} total`);
    console.log(`  OddsHarvester:   ${diagnostics.diagnostics.oddsharvester.eventCount} events, ${diagnostics.diagnostics.oddsharvester.marketCount} markets`);
    console.log(`  Board API:       ${boardData.sportSections?.length || 0} sport section(s)`);

    console.log("\n✨ Next: Check https://<your-domain>/board to see games rendered");

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();
