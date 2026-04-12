import { NextResponse } from "next/server";

import { getPublishedTrendFeed, type PublishedTrendCard } from "@/lib/trends/publisher";

export async function GET() {
  try {
    const payload = await getPublishedTrendFeed({ sample: 5, window: "365d" });
    const section = payload.sections.find((entry) => entry.category === "Most Profitable");
    return NextResponse.json({
      category: "Most Profitable",
      cards: (section?.cards ?? []).filter((card: PublishedTrendCard) => card.sampleSize >= 50)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load most profitable trends.";
    return NextResponse.json(
      {
        category: "Most Profitable",
        cards: [],
        error: message
      },
      { status: 200 }
    );
  }
}
