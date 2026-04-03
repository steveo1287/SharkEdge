import { NextResponse } from "next/server";

import { getPublishedTrendFeed } from "@/lib/trends/publisher";

export async function GET() {
  const payload = await getPublishedTrendFeed({ sample: 5, window: "365d" });
  const section = payload.sections.find((entry) => entry.category === "Most Profitable");
  return NextResponse.json({
    category: "Most Profitable",
    cards: (section?.cards ?? []).filter((card) => card.sampleSize >= 50)
  });
}
