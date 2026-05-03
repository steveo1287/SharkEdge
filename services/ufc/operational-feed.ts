import { prisma } from "@/lib/db/prisma";

export type UfcOperationalFeedCard = {
  fightId: string;
  eventLabel: string;
  fightDate: string;
  scheduledRounds: number;
  fighterAId: string;
  fighterBId: string;
  fighterAName: string | null;
  fighterBName: string | null;
  pickFighterId: string | null;
  pickName: string | null;
  fighterAWinProbability: number;
  fighterBWinProbability: number;
  fairOddsAmerican: number | null;
  sportsbookOddsAmerican: number | null;
  edgePct: number | null;
  methodProbabilities: {
    KO_TKO: number | null;
    SUBMISSION: number | null;
    DECISION: number | null;
  };
  dataQualityGrade: string | null;
  confidenceGrade: string | null;
  simulationCount: number | null;
  generatedAt: string;
  pathSummary: string[];
  dangerFlags: string[];
  shadowStatus: string | null;
};

type FeedRow = {
  fight_id: string;
  event_label: string;
  fight_date: Date | string;
  scheduled_rounds: number;
  fighter_a_id: string;
  fighter_b_id: string;
  fighter_a_name: string | null;
  fighter_b_name: string | null;
  pick_fighter_id: string | null;
  pick_name: string | null;
  fighter_a_win_probability: number;
  fighter_b_win_probability: number;
  fair_odds_american: number | null;
  sportsbook_odds_american: number | null;
  edge_pct: number | null;
  ko_tko_probability: number | null;
  submission_probability: number | null;
  decision_probability: number | null;
  prediction_json: any;
  generated_at: Date | string;
  data_quality_grade: string | null;
  confidence_grade: string | null;
  simulation_count: number | null;
  shadow_status: string | null;
};

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function getUfcOperationalFeed(options: { modelVersion?: string; limit?: number; includePast?: boolean } = {}): Promise<UfcOperationalFeedCard[]> {
  const modelVersion = options.modelVersion ?? "ufc-fight-iq-v1";
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 25)));
  const includePast = Boolean(options.includePast);

  const rows = await prisma.$queryRaw<FeedRow[]>`
    SELECT DISTINCT ON (p.fight_id)
      f.id AS fight_id,
      f.event_label,
      f.fight_date,
      f.scheduled_rounds,
      f.fighter_a_id,
      f.fighter_b_id,
      fa.full_name AS fighter_a_name,
      fb.full_name AS fighter_b_name,
      p.pick_fighter_id,
      fp.full_name AS pick_name,
      p.fighter_a_win_probability,
      p.fighter_b_win_probability,
      p.fair_odds_american,
      p.sportsbook_odds_american,
      p.edge_pct,
      p.ko_tko_probability,
      p.submission_probability,
      p.decision_probability,
      p.prediction_json,
      p.generated_at,
      s.data_quality_grade,
      s.confidence_grade,
      r.simulation_count,
      s.status AS shadow_status
    FROM ufc_predictions p
    JOIN ufc_fights f ON f.id = p.fight_id
    LEFT JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
    LEFT JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
    LEFT JOIN ufc_fighters fp ON fp.id = p.pick_fighter_id
    LEFT JOIN ufc_shadow_predictions s ON s.prediction_id = p.id
    LEFT JOIN ufc_sim_runs r ON r.prediction_id = p.id
    WHERE p.model_version = ${modelVersion}
      AND (${includePast}::boolean OR f.fight_date >= now() - interval '12 hours')
    ORDER BY p.fight_id, p.generated_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    fightId: row.fight_id,
    eventLabel: row.event_label,
    fightDate: toIso(row.fight_date),
    scheduledRounds: row.scheduled_rounds,
    fighterAId: row.fighter_a_id,
    fighterBId: row.fighter_b_id,
    fighterAName: row.fighter_a_name,
    fighterBName: row.fighter_b_name,
    pickFighterId: row.pick_fighter_id,
    pickName: row.pick_name,
    fighterAWinProbability: row.fighter_a_win_probability,
    fighterBWinProbability: row.fighter_b_win_probability,
    fairOddsAmerican: row.fair_odds_american,
    sportsbookOddsAmerican: row.sportsbook_odds_american,
    edgePct: row.edge_pct,
    methodProbabilities: {
      KO_TKO: row.ko_tko_probability,
      SUBMISSION: row.submission_probability,
      DECISION: row.decision_probability
    },
    dataQualityGrade: row.data_quality_grade,
    confidenceGrade: row.confidence_grade,
    simulationCount: row.simulation_count,
    generatedAt: toIso(row.generated_at),
    pathSummary: asArray(row.prediction_json?.pathSummary),
    dangerFlags: asArray(row.prediction_json?.dangerFlags),
    shadowStatus: row.shadow_status
  }));
}
