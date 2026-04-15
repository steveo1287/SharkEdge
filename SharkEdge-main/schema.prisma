ALTER TABLE "saved_trends"
ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "saved_trends_userId_archivedAt_updatedAt_idx"
ON "saved_trends"("userId", "archivedAt", "updatedAt");
