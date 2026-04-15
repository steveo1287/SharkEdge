ALTER TABLE "discovered_trend_systems"
  ADD COLUMN IF NOT EXISTS "teamBreakdownJson" JSONB,
  ADD COLUMN IF NOT EXISTS "opponentBreakdownJson" JSONB,
  ADD COLUMN IF NOT EXISTS "lineDistributionJson" JSONB;
