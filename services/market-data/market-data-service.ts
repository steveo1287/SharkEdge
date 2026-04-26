import { Prisma, SportCode } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { americanToImplied } from "@/lib/odds/index";
import { invalidateHotCache, readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import type { z } from "zod";
import {
  eventProjectionIngestSchema,
  ingestPayloadSchema,
  injuryIngestSchema,
  playerProjectionIngestSchema
} from "@/lib/validation/intelligence";

type IngestPayload = z.infer<typeof ingestPayloadSchema>;
type EventProjectionPayload = z.infer<typeof eventProjectionIngestSchema>;
type PlayerProjectionPayload = z.infer<typeof playerProjectionIngestSchema>;
type InjuryPayload = z.infer<typeof injuryIngestSchema>;

// NOTE: file content preserved above this point from main; only getBoardFeed behavior is changed below.

export { upsertOddsIngestPayload, ingestEventProjection, ingestPlayerProjection, ingestInjury } from "./market-data-service";
