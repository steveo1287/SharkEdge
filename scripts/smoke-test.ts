#!/usr/bin/env node
/**
 * SharkEdge Smoke Test System
 * Verifies critical routes, APIs, and the complete odds pipeline
 *
 * Run with: npx ts-node scripts/smoke-test.ts [--verbose]
 */

import type { NextResponse } from "next/server";

interface TestResult {
  name: string;
  status: "✅" | "⚠️" | "❌";
  message: string;
  details?: string;
}

const results: TestResult[] = [];
const VERBOSE = process.argv.includes("--verbose");

// ─── CONFIGURATION ───────────────────────────────────────────────────────────
const BASE_URL = process.env.SHARKEDGE_BACKEND_URL || "http://localhost:3000";
const API_KEY = process.env.INTERNAL_API_KEY || "test-key";

// ─── PHASE 1: ROUTE VERIFICATION ──────────────────────────────────────────────

async function testRoute(path: string, name: string): Promise<TestResult> {
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "GET",
      redirect: "follow"
    });

    if (response.ok || response.status === 307) {
      return {
        name,
        status: "✅",
        message: `${path} responds`,
        details: `HTTP ${response.status}`
      };
    } else if (response.status === 404) {
      return {
        name,
        status: "❌",
        message: `${path} not found`,
        details: `HTTP ${response.status}`
      };
    } else {
      return {
        name,
        status: "⚠️",
        message: `${path} responds but unexpected status`,
        details: `HTTP ${response.status}`
      };
    }
  } catch (error) {
    return {
      name,
      status: "❌",
      message: `${path} unreachable`,
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

// ─── PHASE 2: ODDS PIPELINE ───────────────────────────────────────────────────

async function testIngestPipeline(): Promise<TestResult[]> {
  const tests: TestResult[] = [];

  // Test ingest endpoint accepts payload
  try {
    const testPayload = {
      sport: "baseball",
      sportKey: "baseball_mlb",
      eventKey: "test_nyyankees_bosredsox",
      homeTeam: "Red Sox",
      awayTeam: "Yankees",
      commenceTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      sourceMeta: { league: "MLB" },
      lines: [
        {
          book: "Test Book",
          awayMoneyline: -110,
          homeMoneyline: 110,
          awaySpread: 1.5,
          homeSpread: -1.5,
          awaySpreadOdds: -110,
          homeSpreadOdds: 110,
          total: 9.5,
          overOdds: -110,
          underOdds: 110
        }
      ]
    };

    const response = await fetch(`${BASE_URL}/api/ingest/odds`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY
      },
      body: JSON.stringify(testPayload)
    });

    if (response.ok) {
      tests.push({
        name: "Ingest POST",
        status: "✅",
        message: "Accepts OddsHarvester payload",
        details: "HTTP 200"
      });
    } else {
      tests.push({
        name: "Ingest POST",
        status: "❌",
        message: `Failed to ingest payload`,
        details: `HTTP ${response.status}`
      });
    }
  } catch (error) {
    tests.push({
      name: "Ingest POST",
      status: "❌",
      message: "Ingest endpoint unreachable",
      details: error instanceof Error ? error.message : String(error)
    });
  }

  // Test board API returns data
  try {
    const response = await fetch(`${BASE_URL}/api/v1/board?league=MLB`);

    if (response.ok) {
      const data = await response.json();
      const gameCount = data.sportSections?.[0]?.games?.length || 0;

      if (gameCount > 0) {
        tests.push({
          name: "Board API",
          status: "✅",
          message: "Returns games with odds",
          details: `${gameCount} games found`
        });
      } else {
        tests.push({
          name: "Board API",
          status: "⚠️",
          message: "Returns empty result (expected if no data ingested)",
          details: "0 games"
        });
      }
    } else {
      tests.push({
        name: "Board API",
        status: "❌",
        message: "Board API unavailable",
        details: `HTTP ${response.status}`
      });
    }
  } catch (error) {
    tests.push({
      name: "Board API",
      status: "❌",
      message: "Board API unreachable",
      details: error instanceof Error ? error.message : String(error)
    });
  }

  // Test diagnostics endpoint
  try {
    const response = await fetch(`${BASE_URL}/api/diagnostics/odds-pipeline`);

    if (response.ok) {
      const data = await response.json();
      const dbReachable = data.diagnostics?.database?.reachable;

      if (dbReachable) {
        tests.push({
          name: "Diagnostics",
          status: "✅",
          message: "Diagnostics running and DB reachable",
          details: `Events: ${data.diagnostics.events.total}`
        });
      } else {
        tests.push({
          name: "Diagnostics",
          status: "❌",
          message: "Database unreachable",
          details: data.diagnostics?.database?.error || "Unknown error"
        });
      }
    } else {
      tests.push({
        name: "Diagnostics",
        status: "❌",
        message: "Diagnostics endpoint unavailable",
        details: `HTTP ${response.status}`
      });
    }
  } catch (error) {
    tests.push({
      name: "Diagnostics",
      status: "❌",
      message: "Diagnostics unreachable",
      details: error instanceof Error ? error.message : String(error)
    });
  }

  return tests;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🚀 SharkEdge Smoke Test\n");
  console.log(`Target: ${BASE_URL}\n`);

  // Phase 1: Route Tests
  console.log("Phase 1: Route Verification");
  console.log("─".repeat(50));

  const routes = [
    ["/", "Home"],
    ["/board", "Board"],
    ["/games", "Games"],
    ["/trends", "Trends"],
    ["/props", "Props"],
    ["/sim", "Simulator"],
    ["/players", "Players"],
    ["/teams", "Teams"],
    ["/performance", "Performance"],
    ["/providers", "Providers"],
    ["/bets", "My Bets"],
    ["/alerts", "Alerts"],
    ["/watchlist", "Watchlist"]
  ] as const;

  for (const [path, name] of routes) {
    const result = await testRoute(path, name);
    results.push(result);
    console.log(`${result.status} ${name.padEnd(15)} ${result.message}`);
    if (VERBOSE && result.details) {
      console.log(`   ${result.details}`);
    }
  }

  // Phase 2: Odds Pipeline Tests
  console.log("\nPhase 2: Odds Ingest Pipeline");
  console.log("─".repeat(50));

  const pipelineTests = await testIngestPipeline();
  for (const result of pipelineTests) {
    results.push(result);
    console.log(`${result.status} ${result.name.padEnd(15)} ${result.message}`);
    if (VERBOSE && result.details) {
      console.log(`   ${result.details}`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  const passed = results.filter((r) => r.status === "✅").length;
  const warned = results.filter((r) => r.status === "⚠️").length;
  const failed = results.filter((r) => r.status === "❌").length;

  console.log(`Results: ${passed} passed, ${warned} warned, ${failed} failed`);

  if (failed > 0) {
    console.log("\n❌ Critical failures detected:");
    results
      .filter((r) => r.status === "❌")
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.message}`);
      });
    process.exit(1);
  }

  if (warned > 0) {
    console.log("\n⚠️ Warnings:");
    results
      .filter((r) => r.status === "⚠️")
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.message}`);
      });
  }

  console.log("\n✅ Smoke test passed!\n");
}

main();
