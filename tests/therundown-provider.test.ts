import assert from "node:assert/strict";

process.env.THERUNDOWN_API_KEY = "test-key";
delete (globalThis as typeof globalThis & { sharkedgeTheRundownEnvLoaded?: boolean })
  .sharkedgeTheRundownEnvLoaded;
delete (globalThis as typeof globalThis & { sharkedgeTheRundownBoardCache?: unknown })
  .sharkedgeTheRundownBoardCache;
delete (globalThis as typeof globalThis & { sharkedgeTheRundownCircuitState?: unknown })
  .sharkedgeTheRundownCircuitState;

const originalFetch = globalThis.fetch;

type MockResponseBody = {
  events?: Array<{
    event_id: string;
    event_date: string;
    teams: Array<{
      name: string;
      mascot?: string;
      is_home?: boolean;
      is_away?: boolean;
    }>;
    markets: Array<{
      market_id: number;
      name: string;
      period_id: number;
      participants: Array<{
        name: string;
        lines: Array<{
          value?: string;
          prices: Record<string, { price: number }>;
        }>;
      }>;
    }>;
  }>;
};

function jsonResponse(body: MockResponseBody): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

async function main() {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);

    if (url.includes("/sports/3/events/")) {
      return jsonResponse({
        events: [
          {
            event_id: "mlb-1",
            event_date: "2026-04-21T18:00:00Z",
            teams: [
              { name: "Boston", mascot: "Red Sox", is_away: true },
              { name: "New York", mascot: "Yankees", is_home: true }
            ],
            markets: [
              {
                market_id: 1,
                name: "moneyline",
                period_id: 0,
                participants: [
                  {
                    name: "Boston Red Sox",
                    lines: [{ prices: { dk: { price: 120 } } }]
                  },
                  {
                    name: "New York Yankees",
                    lines: [{ prices: { dk: { price: -130 } } }]
                  }
                ]
              }
            ]
          }
        ]
      });
    }

    return jsonResponse({ events: [] });
  }) as typeof fetch;

  try {
    const { therundownCurrentOddsProvider } = await import(
      "@/services/current-odds/therundown-provider"
    );

    const payload = await therundownCurrentOddsProvider.fetchBoard();
    assert.ok(payload?.configured, "expected The Rundown payload to be configured");
    assert.equal(payload?.provider, "therundown");
    assert.ok(payload?.sports.length, "expected at least one normalized sport");
    assert.equal(
      payload?.sports[0]?.key,
      "baseball_mlb",
      "The Rundown sports should emit canonical SharkEdge sport keys"
    );
    assert.equal(payload?.sports[0]?.games[0]?.bookmakers_available, 1);

    console.log("therundown-provider tests passed");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
