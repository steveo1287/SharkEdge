export type StoryDeckInput = {
  leagueKey: string;
  id: string;
  title: string;
  summary?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  publishedAt?: string | null;
  sourceUrl?: string | null;
  eventId?: string | null;
  eventHref?: string | null;
  eventLabel?: string | null;
  awayTeam?: string | null;
  homeTeam?: string | null;
  awayScore?: number | null;
  homeScore?: number | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildInternalStoryHref(input: StoryDeckInput) {
  const params = new URLSearchParams();
  params.set("title", input.title);
  if (input.summary) params.set("summary", input.summary);
  if (input.category) params.set("category", input.category);
  if (input.imageUrl) params.set("image", input.imageUrl);
  if (input.publishedAt) params.set("publishedAt", input.publishedAt);
  if (input.sourceUrl) params.set("source", input.sourceUrl);
  if (input.eventId) params.set("eventId", input.eventId);
  if (input.eventHref) params.set("eventHref", input.eventHref);
  if (input.eventLabel) params.set("eventLabel", input.eventLabel);
  if (input.awayTeam) params.set("awayTeam", input.awayTeam);
  if (input.homeTeam) params.set("homeTeam", input.homeTeam);
  if (typeof input.awayScore === "number") params.set("awayScore", String(input.awayScore));
  if (typeof input.homeScore === "number") params.set("homeScore", String(input.homeScore));

  return `/stories/${encodeURIComponent(input.leagueKey.toLowerCase())}/${encodeURIComponent(
    slugify(input.id || input.title)
  )}?${params.toString()}`;
}

export function buildStoryIntel(leagueKey: string, title: string, summary?: string | null) {
  const text = `${title} ${summary ?? ""}`.toLowerCase();
  const bullets: string[] = [];

  if (/(injury|out|questionable|doubtful|inactive|return)/.test(text)) {
    bullets.push("Availability shifts usually move minutes, usage, and same-game pricing faster than public reaction.");
  }
  if (/(trade|sign|waive|release|portal|free agent|booking|replacement)/.test(text)) {
    bullets.push("Roster and opponent changes tend to create early model gaps before markets settle.");
  }
  if (/(streak|surge|slump|winning|losing|bounce back)/.test(text)) {
    bullets.push("Recent-form moves matter most when they align with pace, role, or market movement instead of narrative alone.");
  }
  if (/(lineup|starter|rotation|camp|coach|scheme)/.test(text)) {
    bullets.push("Role and scheme changes matter because prop baselines usually lag until the sample becomes obvious.");
  }

  if (!bullets.length) {
    bullets.push("This update matters if it changes role certainty, matchup context, or the market’s closing assumptions.");
  }

  const leaguePrompt =
    leagueKey.toUpperCase() === "NFL" || leagueKey.toUpperCase() === "NCAAF"
      ? "Watch injury reports, depth-chart movement, and futures repricing first."
      : leagueKey.toUpperCase() === "MLB"
        ? "Pitching, lineup order, and bullpen usage are usually the first betting angles to move."
        : leagueKey.toUpperCase() === "NHL"
          ? "Goalie confirmation, line combinations, and travel spots usually matter more than headline heat."
          : "Look for pace, usage, lineup, and opponent-adjusted changes before betting into the move.";

  const takeaways = [
    "Why it matters",
    bullets[0],
    leaguePrompt
  ];

  return {
    dek:
      summary ??
      "SharkEdge rewrites this update into betting-relevant context so you can stay inside the product instead of bouncing out to a generic news site.",
    takeaways
  };
}
