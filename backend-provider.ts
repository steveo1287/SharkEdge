import type { LeagueKey } from "@/lib/types/domain";

type StoryWriterProvider = "native" | "veera_research_writer";
type StoryMode = "recap" | "availability" | "roster" | "futures" | "preview" | "news";

export type StoryDraftInput = {
  league: LeagueKey;
  title: string;
  summary?: string | null;
  category?: string | null;
  publishedAt?: string | null;
  sourceUrl?: string | null;
  eventId?: string | null;
  eventHref?: string | null;
  eventLabel?: string | null;
  supportingFacts?: string[];
  boxscore?: {
    awayTeam?: string | null;
    homeTeam?: string | null;
    awayScore?: number | null;
    homeScore?: number | null;
  } | null;
};

export type StoryArticlePackage = {
  eyebrow: string;
  dek: string;
  sections: Array<{
    title: string;
    body: string;
  }>;
  takeaways: string[];
  bettingImpact: string;
  boxscoreSummary: string | null;
};

const STORY_WRITER_PROVIDER = (
  process.env.SHARKEDGE_STORY_WRITER_PROVIDER?.trim().toLowerCase() === "veera_research_writer"
    ? "veera_research_writer"
    : "native"
) satisfies StoryWriterProvider;

function compactSentence(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return null;
  }

  return cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
}

function compactClause(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/\s+/g, " ").trim().replace(/[.]+$/g, "");
  return cleaned || null;
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function inferStoryMode(input: StoryDraftInput): StoryMode {
  const source = `${input.title} ${input.category ?? ""} ${input.summary ?? ""}`.toLowerCase();
  const hasBoxscore =
    typeof input.boxscore?.awayScore === "number" &&
    typeof input.boxscore?.homeScore === "number" &&
    Boolean(input.boxscore?.awayTeam) &&
    Boolean(input.boxscore?.homeTeam);

  if (hasBoxscore && /(final|beats|beat|defeat|win|wins|loss|falls|recap|result)/.test(source)) {
    return "recap";
  }

  if (/(injur|questionable|out|active|inactive|return|starter)/.test(source)) {
    return "availability";
  }

  if (/(trade|sign|waive|release|contract|portal|replacement|booking)/.test(source)) {
    return "roster";
  }

  if (/(futures|title|award|playoff|seed|tournament|race)/.test(source)) {
    return "futures";
  }

  if (/(preview|tonight|tomorrow|matchup|opener|expects|faces|visit|hosts)/.test(source)) {
    return "preview";
  }

  return hasBoxscore ? "recap" : "news";
}

function buildBoxscoreSummary(boxscore: StoryDraftInput["boxscore"]) {
  if (
    !boxscore ||
    !boxscore.awayTeam ||
    !boxscore.homeTeam ||
    typeof boxscore.awayScore !== "number" ||
    typeof boxscore.homeScore !== "number"
  ) {
    return null;
  }

  const margin = Math.abs(boxscore.awayScore - boxscore.homeScore);
  const winner =
    boxscore.awayScore === boxscore.homeScore
      ? null
      : boxscore.awayScore > boxscore.homeScore
        ? boxscore.awayTeam
        : boxscore.homeTeam;

  if (!winner) {
    return `${boxscore.awayTeam} and ${boxscore.homeTeam} finished level at ${boxscore.awayScore}-${boxscore.homeScore}.`;
  }

  return `${winner} closed the game at ${boxscore.awayScore}-${boxscore.homeScore}, a ${margin}-point scoreboard edge that gives SharkEdge a real anchor for the recap.`;
}

function buildSupportSentence(facts: string[]) {
  const cleaned = facts
    .map((fact) => compactClause(fact))
    .filter((fact): fact is string => Boolean(fact))
    .slice(0, 4);

  if (!cleaned.length) {
    return null;
  }

  if (cleaned.length === 1) {
    return `${titleCase(cleaned[0])} is the extra context that still matters after the headline cools off.`;
  }

  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned.slice(-1)[0]} are the details worth carrying into the next betting window.`;
}

function buildWhyItMatters(mode: StoryMode, league: LeagueKey) {
  switch (mode) {
    case "recap":
      return `The desk should treat this as a result-driven reset for ${league}: performance, rotation stability, and late-game execution are now part of the next price cycle.`;
    case "availability":
      return `${league} availability changes usually move minutes, usage, and same-game pricing faster than the public catches up.`;
    case "roster":
      return `Roster movement matters because role concentration and rotation certainty usually reprice before the public narrative settles.`;
    case "futures":
      return `This is futures-relevant context because the market will reprice longer-range expectations before broad sentiment does.`;
    case "preview":
      return `Use it as pregame context: role clarity, matchup shape, and market timing matter more than headline heat.`;
    default:
      return `This matters because it changes how the ${league} desk should frame price, usage, or matchup context next.`;
  }
}

function buildEyebrow(mode: StoryMode, league: LeagueKey) {
  switch (mode) {
    case "recap":
      return `${league} recap`;
    case "availability":
      return `${league} availability watch`;
    case "roster":
      return `${league} roster shift`;
    case "futures":
      return `${league} futures context`;
    case "preview":
      return `${league} matchup context`;
    default:
      return `${league} desk update`;
  }
}

function buildNativePackage(input: StoryDraftInput): StoryArticlePackage {
  const mode = inferStoryMode(input);
  const sourceSummary = compactSentence(input.summary);
  const boxscoreSummary = buildBoxscoreSummary(input.boxscore);
  const supportingSentence = buildSupportSentence(input.supportingFacts ?? []);
  const whyItMatters = compactSentence(buildWhyItMatters(mode, input.league))!;
  const eventContext = compactSentence(
    input.eventLabel
      ? `${input.eventLabel} is the live matchup context tied to this story inside SharkEdge.`
      : null
  );

  const dek =
    sourceSummary ??
    compactSentence(
      `${input.title} is one of the sharper ${input.league} storylines on the board right now`
    )!;

  const sections = [
    {
      title: mode === "recap" ? "Game reset" : "Desk read",
      body:
        compactSentence(
          mode === "recap" && boxscoreSummary
            ? `${dek.replace(/[.]+$/g, "")} ${boxscoreSummary.replace(/[.]+$/g, "")}`
            : dek
        ) ?? dek
    },
    {
      title: "Why SharkEdge cares",
      body: whyItMatters
    },
    {
      title: "Carry-forward context",
      body:
        supportingSentence ??
        eventContext ??
        "This story stays in the product because SharkEdge rewrites the signal into betting context instead of sending you out to generic coverage."
    }
  ];

  const takeaways = [
    whyItMatters,
    boxscoreSummary ?? "No final box score is attached yet, so this story is riding headline and matchup context only.",
    supportingSentence ?? "Watch the next market cycle for confirmation before overreacting to one headline."
  ].slice(0, 3);

  return {
    eyebrow: buildEyebrow(mode, input.league),
    dek,
    sections,
    takeaways,
    bettingImpact:
      compactSentence(
        mode === "recap"
          ? "Use the result to recalibrate form, rotation trust, and where the next spread or total should live."
          : mode === "availability"
            ? "Treat this as a role and minutes alert before trusting props or side prices."
            : mode === "futures"
              ? "Track whether futures prices move faster than the true underlying change."
              : "Carry this into the next board update and check whether price, role, or usage actually moved."
      ) ?? whyItMatters,
    boxscoreSummary
  };
}

function buildVeeraPrompt(input: StoryDraftInput) {
  const facts = (input.supportingFacts ?? []).slice(0, 4).join(" | ");
  const boxscore = buildBoxscoreSummary(input.boxscore);

  return [
    "Write a concise SharkEdge sports-desk article package.",
    `League: ${input.league}`,
    `Headline: ${input.title}`,
    input.category ? `Category: ${input.category}` : null,
    input.summary ? `Source summary: ${input.summary}` : null,
    input.eventLabel ? `Event label: ${input.eventLabel}` : null,
    boxscore ? `Box score anchor: ${boxscore}` : null,
    facts ? `Supporting facts: ${facts}` : null,
    "Return JSON with keys eyebrow, dek, sections, takeaways, bettingImpact, boxscoreSummary.",
    "Requirements: sports-native, no fake sourcing, grounded in the headline and box score, explain why it matters to bettors."
  ]
    .filter(Boolean)
    .join("\n");
}

async function buildExternalPackage(input: StoryDraftInput) {
  const endpoint = process.env.SHARKEDGE_STORY_WRITER_ENDPOINT?.trim();
  if (!endpoint) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        provider: "veera_research_writer",
        prompt: buildVeeraPrompt(input),
        title: input.title,
        league: input.league
      }),
      signal: controller.signal,
      cache: "no-store"
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Partial<StoryArticlePackage> & { draft?: string | null };
    if (payload.sections?.length && payload.dek && payload.eyebrow) {
      return {
        eyebrow: compactClause(payload.eyebrow) ?? buildEyebrow(inferStoryMode(input), input.league),
        dek: compactSentence(payload.dek) ?? buildNativePackage(input).dek,
        sections: payload.sections
          .map((section) => ({
            title: compactClause(section.title) ?? "SharkEdge angle",
            body: compactSentence(section.body) ?? ""
          }))
          .filter((section) => section.body),
        takeaways: (payload.takeaways ?? [])
          .map((item) => compactSentence(item))
          .filter((item): item is string => Boolean(item))
          .slice(0, 3),
        bettingImpact:
          compactSentence(payload.bettingImpact) ?? buildNativePackage(input).bettingImpact,
        boxscoreSummary:
          compactSentence(payload.boxscoreSummary) ?? buildBoxscoreSummary(input.boxscore)
      } satisfies StoryArticlePackage;
    }

    if (payload.draft) {
      const fallback = buildNativePackage(input);
      fallback.sections[0] = {
        title: fallback.sections[0]?.title ?? "Desk read",
        body: compactSentence(payload.draft) ?? fallback.sections[0]!.body
      };
      return fallback;
    }
  } catch {
    return null;
  }

  return null;
}

export function getStoryWriterProvider() {
  return STORY_WRITER_PROVIDER;
}

export async function buildLeagueStoryPackage(input: StoryDraftInput) {
  if (STORY_WRITER_PROVIDER === "veera_research_writer") {
    const externalPackage = await buildExternalPackage(input);
    if (externalPackage) {
      return externalPackage;
    }
  }

  return buildNativePackage(input);
}

export async function buildLeagueStorySummary(input: StoryDraftInput) {
  const storyPackage = await buildLeagueStoryPackage(input);
  return storyPackage.dek;
}
