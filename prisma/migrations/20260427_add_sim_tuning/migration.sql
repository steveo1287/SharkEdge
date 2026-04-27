-- CreateTable
CREATE TABLE "sim_tuning" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "brierScore" DOUBLE PRECISION,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_tuning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sim_tuning_scope_key" ON "sim_tuning"("scope");

-- CreateIndex
CREATE INDEX "sim_tuning_scope_idx" ON "sim_tuning"("scope");
