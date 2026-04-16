-- CreateTable
CREATE TABLE "calibration_summaries" (
  "id" TEXT NOT NULL,
  "summaryDate" TIMESTAMP(3) NOT NULL,
  "scope" TEXT NOT NULL,
  "sport" TEXT,
  "marketType" TEXT,
  "modelVersion" TEXT,
  "thresholdConfigJson" JSONB NOT NULL,
  "metricsJson" JSONB NOT NULL,
  "flagsJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "calibration_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "calibration_summaries_summaryDate_scope_sport_marketType_modelVersion_key"
ON "calibration_summaries"("summaryDate","scope","sport","marketType","modelVersion");
