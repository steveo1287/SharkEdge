export type ExecutionBookSelection = {
  bookKey: string;
  bookName: string;
  line: number;
  oddsAmerican: number | null;
  deltaFromConsensus: number | null;
  freshnessMinutes: number;
  isOutlier: boolean;
  isStale: boolean;
};

export type ExecutionMarketSide = "OVER" | "UNDER" | "HOME" | "AWAY" | "NONE";

export type MlbExecutionContext = {
  venue: {
    baselineRunFactor: number | null;
    windSensitivity: string | null;
    roofType: string | null;
  };
  home: {
    abbreviation: string;
    lineupCertainty: string | null;
    lineupStrength: number | null;
    lineupContactScore: number | null;
    bullpenFreshness: number | null;
    bullpenRisk: string | null;
    starterConfidence: number | null;
  };
  away: {
    abbreviation: string;
    lineupCertainty: string | null;
    lineupStrength: number | null;
    lineupContactScore: number | null;
    bullpenFreshness: number | null;
    bullpenRisk: string | null;
    starterConfidence: number | null;
  };
};

export type ExecutionScoredBookSelection = ExecutionBookSelection & {
  executionScore: number;
  executionReasons: string[];
  triggerCodes: string[];
};

export type ExecutionSelectionResult = {
  books: ExecutionScoredBookSelection[];
  bestBook: ExecutionScoredBookSelection | null;
  bestBookCallout: string | null;
  executionTriggers: string[];
  staleOpportunityScore: number;
};

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function formatSigned(value: number, digits = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function oddsBonus(oddsAmerican: number | null) {
  if (typeof oddsAmerican !== "number" || !Number.isFinite(oddsAmerican)) {
    return 0;
  }
  if (oddsAmerican > 0) {
    return Math.min(6, oddsAmerican / 45);
  }
  return Math.max(-4, (110 - Math.abs(oddsAmerican)) / 25);
}

function isPitcherProp(statKey: string) {
  return statKey.includes("pitcher") || statKey.includes("strikeouts") || statKey.includes("outs");
}

function buildGlobalTriggers(args: {
  marketKey: string;
  simSide: ExecutionMarketSide;
  context: MlbExecutionContext | null;
}): string[] {
  const context = args.context;
  if (!context) {
    return [];
  }

  const triggers: string[] = [];
  const teams = [context.away, context.home];
  const uncertain = teams.filter((team) => team.lineupCertainty && team.lineupCertainty !== "HIGH");
  if (uncertain.length) {
    triggers.push(
      uncertain.length === 2
        ? "Lineup confirmation is still fluid on both sides."
        : `${uncertain[0]?.abbreviation ?? "One side"} lineup certainty is still ${String(uncertain[0]?.lineupCertainty ?? "LOW").toLowerCase()}.`
    );
  }

  const bullpenGap =
    typeof context.home.bullpenFreshness === "number" && typeof context.away.bullpenFreshness === "number"
      ? Math.abs(context.home.bullpenFreshness - context.away.bullpenFreshness)
      : 0;
  const strainedTeams = teams.filter((team) => typeof team.bullpenFreshness === "number" && team.bullpenFreshness <= 46);
  if (bullpenGap >= 12 || strainedTeams.length) {
    if (strainedTeams.length === 2) {
      triggers.push("Both bullpens look stressed, which can widen late-inning variance.");
    } else if (strainedTeams.length === 1) {
      triggers.push(`${strainedTeams[0]?.abbreviation ?? "One side"} bullpen usage is stretched entering the game.`);
    } else {
      const fresher =
        (context.home.bullpenFreshness ?? 0) > (context.away.bullpenFreshness ?? 0)
          ? context.home.abbreviation
          : context.away.abbreviation;
      triggers.push(`${fresher} carries the materially fresher bullpen entering late innings.`);
    }
  }

  if (
    args.marketKey === "total" &&
    typeof context.venue.baselineRunFactor === "number" &&
    context.venue.baselineRunFactor >= 1.05
  ) {
    triggers.push("Venue and park context are still skewed toward an elevated run environment.");
  }

  if (
    args.marketKey === "total" &&
    typeof context.venue.baselineRunFactor === "number" &&
    context.venue.baselineRunFactor <= 0.97
  ) {
    triggers.push("Venue and park context are suppressing the baseline run environment.");
  }

  if (
    isPitcherProp(args.marketKey) &&
    teams.some((team) => team.lineupCertainty && team.lineupCertainty !== "HIGH")
  ) {
    triggers.push("Pitcher props can move when confirmed batting orders finalize.");
  }

  return Array.from(new Set(triggers));
}

export function sharpenMlbExecution(args: {
  marketKey: string;
  label: string;
  simSide: ExecutionMarketSide;
  consensusLine: number | null;
  books: ExecutionBookSelection[];
  context: MlbExecutionContext | null;
}): ExecutionSelectionResult {
  const preference = args.simSide === "OVER" || args.simSide === "HOME" ? "LOW_LINE" : args.simSide === "UNDER" || args.simSide === "AWAY" ? "HIGH_LINE" : null;
  const globalTriggers = buildGlobalTriggers({ marketKey: args.marketKey, simSide: args.simSide, context: args.context });

  const context = args.context;
  const home = context?.home ?? null;
  const away = context?.away ?? null;
  const lineupUncertaintyActive = globalTriggers.some((trigger) => trigger.toLowerCase().includes("lineup"));
  const bullpenActive = globalTriggers.some((trigger) => trigger.toLowerCase().includes("bullpen"));

  const books = args.books
    .map((book) => {
      let score = 0;
      const reasons: string[] = [];
      const triggerCodes: string[] = [];

      if (preference && typeof args.consensusLine === "number") {
        const lineAdvantage = preference === "LOW_LINE"
          ? args.consensusLine - book.line
          : book.line - args.consensusLine;
        score += lineAdvantage * 32;
        if (lineAdvantage >= 0.2) {
          reasons.push(`Line is ${formatSigned(lineAdvantage, 2)} better than consensus for the sim side.`);
          triggerCodes.push("CONSENSUS_GAP");
        }
      }

      score += oddsBonus(book.oddsAmerican);
      if (book.isOutlier) {
        score += 5;
        reasons.push("Book is hanging an outlier number in the active mesh.");
        triggerCodes.push("OUTLIER");
      }
      if (book.isStale) {
        score += 4;
        reasons.push(`Quote is ${book.freshnessMinutes} minutes old versus the live mesh.`);
        triggerCodes.push("STALE");
      }

      if (lineupUncertaintyActive && book.freshnessMinutes >= 18) {
        score += 7;
        reasons.push("Lineup confirmation can still swing this market and this quote is older than the mesh.");
        triggerCodes.push("LINEUP_LAG");
      }

      if (bullpenActive && book.freshnessMinutes >= 18) {
        score += 6;
        reasons.push("Bullpen freshness context may not be fully reflected in this older quote.");
        triggerCodes.push("BULLPEN_LAG");
      }

      if (args.marketKey === "total" && context) {
        const runFactor = context.venue.baselineRunFactor ?? null;
        if (typeof runFactor === "number") {
          if (args.simSide === "OVER" && runFactor >= 1.05) {
            score += 4;
            reasons.push("Venue and park context still support the over path.");
            triggerCodes.push("RUN_ENV");
          }
          if (args.simSide === "UNDER" && runFactor <= 0.97) {
            score += 4;
            reasons.push("Venue and park context still support the under path.");
            triggerCodes.push("RUN_ENV");
          }
        }

        if (home && away && typeof home.bullpenFreshness === "number" && typeof away.bullpenFreshness === "number") {
          const fresher = home.bullpenFreshness > away.bullpenFreshness ? home.abbreviation : away.abbreviation;
          const gap = Math.abs(home.bullpenFreshness - away.bullpenFreshness);
          if (args.simSide === "OVER" && gap >= 12) {
            score += 4;
            reasons.push(`Late-inning environment is asymmetric because ${fresher} has the fresher bullpen cushion.`);
            triggerCodes.push("BULLPEN_SPLIT");
          }
          if (args.simSide === "UNDER" && home.bullpenFreshness >= 62 && away.bullpenFreshness >= 62) {
            score += 3;
            reasons.push("Both bullpens grade as relatively fresh for run suppression late.");
            triggerCodes.push("BULLPEN_SUPPRESSION");
          }
        }
      }

      if (args.marketKey === "spread_home" && home && away && typeof home.bullpenFreshness === "number" && typeof away.bullpenFreshness === "number") {
        const homeEdge = home.bullpenFreshness - away.bullpenFreshness;
        if (args.simSide === "HOME" && homeEdge >= 10) {
          score += 5;
          reasons.push(`${home.abbreviation} owns the fresher bullpen for late leverage innings.`);
          triggerCodes.push("HOME_BULLPEN_EDGE");
        }
        if (args.simSide === "AWAY" && homeEdge <= -10) {
          score += 5;
          reasons.push(`${away.abbreviation} owns the fresher bullpen for late leverage innings.`);
          triggerCodes.push("AWAY_BULLPEN_EDGE");
        }
        if (lineupUncertaintyActive && book.freshnessMinutes >= 18) {
          score += 2;
        }
      }

      if (isPitcherProp(args.marketKey) && context) {
        const contactScores = [context.home.lineupContactScore, context.away.lineupContactScore].filter((value): value is number => typeof value === "number");
        const contactMin = contactScores.length ? Math.min(...contactScores) : null;
        const contactMax = contactScores.length ? Math.max(...contactScores) : null;

        if (args.simSide === "OVER" && typeof contactMin === "number" && contactMin <= 42) {
          score += 4;
          reasons.push("At least one likely lineup still grades as swing-and-miss prone.");
          triggerCodes.push("SWING_MISS");
        }
        if (args.simSide === "UNDER" && typeof contactMax === "number" && contactMax >= 60) {
          score += 4;
          reasons.push("At least one likely lineup still grades as contact-heavy.");
          triggerCodes.push("CONTACT_PRESSURE");
        }
        if (bullpenActive && args.marketKey.includes("outs") && book.freshnessMinutes >= 18) {
          score += 3;
          reasons.push("Starter leash can move when bullpen workload shifts beneath the surface.");
          triggerCodes.push("STARTER_LEASH");
        }
      }

      return {
        ...book,
        executionScore: round(score, 2),
        executionReasons: Array.from(new Set(reasons)).slice(0, 4),
        triggerCodes: Array.from(new Set(triggerCodes)),
      } satisfies ExecutionScoredBookSelection;
    })
    .sort((left, right) => {
      if (left.executionScore !== right.executionScore) {
        return right.executionScore - left.executionScore;
      }
      if (left.line !== right.line && preference) {
        return preference === "LOW_LINE" ? left.line - right.line : right.line - left.line;
      }
      return left.freshnessMinutes - right.freshnessMinutes;
    });

  const bestBook = books[0] ?? null;
  const bestBookCallout = bestBook
    ? `${bestBook.bookName} is the cleanest ${args.label.toLowerCase()} entry for the ${args.simSide.toLowerCase()} lean at ${bestBook.line.toFixed(1)}${bestBook.oddsAmerican != null ? ` (${bestBook.oddsAmerican > 0 ? "+" : ""}${bestBook.oddsAmerican})` : ""}. ${bestBook.executionReasons[0] ?? "It is currently the best line in the mesh for the model side."}`
    : null;

  const staleOpportunityScore = round(
    books.slice(0, 3).reduce((sum, book) => sum + Math.max(0, book.executionScore), 0) /
      Math.max(1, Math.min(3, books.length)),
    1
  );

  return {
    books,
    bestBook,
    bestBookCallout,
    executionTriggers: globalTriggers.slice(0, 4),
    staleOpportunityScore,
  };
}
