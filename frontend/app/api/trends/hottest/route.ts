import { NextResponse } from "next/server";

import { getPublishedTrendFeed } from "@/lib/trends/publisher";

export async function GET() {
  const payload = await getPublishedTrendFeed({ sample: 5, window: "365d" });
  const section = payload.sections.find((entry) => entry.category === "Hottest");
  return NextResponse.json({
    category: "Hottest",
    cards: section?.cards ?? []
  });
}
