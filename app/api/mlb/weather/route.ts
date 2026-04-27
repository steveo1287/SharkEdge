import { NextResponse } from "next/server";
import { getOpenMeteoVenueWeather, getKnownMlbVenueTeams } from "@/services/simulation/mlb-venue-weather-feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const teams = getKnownMlbVenueTeams();
  const results = [];

  for (const team of teams) {
    const weather = await getOpenMeteoVenueWeather(team);
    if (weather) results.push(weather);
  }

  return NextResponse.json({ ok: true, count: results.length, weather: results });
}
