DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'discovered_trend_systems'
  ) THEN
    ALTER TABLE "discovered_trend_systems"
      ADD COLUMN IF NOT EXISTS "teamBreakdownJson" JSONB,
      ADD COLUMN IF NOT EXISTS "opponentBreakdownJson" JSONB,
      ADD COLUMN IF NOT EXISTS "lineDistributionJson" JSONB;
  END IF;
END $$;
