-- AlterTable
ALTER TABLE "event_markets" ADD COLUMN     "closingLine" DOUBLE PRECISION,
ADD COLUMN     "closingOdds" INTEGER,
ADD COLUMN     "currentLine" DOUBLE PRECISION,
ADD COLUMN     "currentOdds" INTEGER,
ADD COLUMN     "openingLine" DOUBLE PRECISION,
ADD COLUMN     "openingOdds" INTEGER;

-- AlterTable
ALTER TABLE "event_results" ADD COLUMN     "coverResult" JSONB,
ADD COLUMN     "ouResult" TEXT;

-- CreateTable
CREATE TABLE "trend_cache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "filterJson" JSONB NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trend_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trend_cache_cacheKey_key" ON "trend_cache"("cacheKey");

-- CreateIndex
CREATE INDEX "trend_cache_scope_expiresAt_idx" ON "trend_cache"("scope", "expiresAt");
