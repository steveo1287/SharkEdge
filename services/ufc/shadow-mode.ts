import { prisma } from "@/lib/db/prisma";
import { americanOddsToImpliedProbability } from "@/services/ufc/fight-iq";

export type UfcShadowResolveInput = {
  fightId: string;
  actualWinnerFighterId: string;
  marketOddsAClose?: number | null;
  marketOddsBClose?: number | null;
};

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function clvPct(openOdds: number | null, closeOdds: number | null) {
  const open = americanOddsToImpliedProbability(openOdds);
  const close = americanOddsToImpliedProbability(closeOdds);
  if (open == null || close == null) return null;
  return round((close - open) * 100, 2);
}

export async function resolveUfcShadowPrediction(input: UfcShadowResolveInput) {
  const fights = await prisma.$queryRaw<Array<{ fighter_a_id: string; fighter_b_id: string }>>`
    SELECT fighter_a_id, fighter_b_id FROM ufc_fights WHERE id = ${input.fightId} LIMIT 1
  `;
  const fight = fights[0];
  if (!fight) throw new Error(`Missing UFC fight ${input.fightId}`);

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    pick_fighter_id: string | null;
    market_odds_a_open: number | null;
    market_odds_b_open: number | null;
  }>>`
    SELECT id, pick_fighter_id, market_odds_a_open, market_odds_b_open
    FROM ufc_shadow_predictions
    WHERE fight_id = ${input.fightId} AND status = 'PENDING'
  `;

  for (const row of rows) {
    const pickedA = row.pick_fighter_id === fight.fighter_a_id;
    const closingLineValuePct = pickedA
      ? clvPct(row.market_odds_a_open, input.marketOddsAClose ?? null)
      : clvPct(row.market_odds_b_open, input.marketOddsBClose ?? null);
    const resultCorrect = row.pick_fighter_id === input.actualWinnerFighterId;
    await prisma.$executeRaw`
      UPDATE ufc_shadow_predictions
      SET actual_winner_fighter_id = ${input.actualWinnerFighterId},
          market_odds_a_close = COALESCE(${input.marketOddsAClose ?? null}, market_odds_a_close),
          market_odds_b_close = COALESCE(${input.marketOddsBClose ?? null}, market_odds_b_close),
          closing_line_value_pct = ${closingLineValuePct},
          result_correct = ${resultCorrect},
          status = 'RESOLVED',
          updated_at = now()
      WHERE id = ${row.id}
    `;
  }

  return { resolved: rows.length };
}
