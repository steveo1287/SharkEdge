import { ingestMlbPlayerDataPipe, type MlbPlayerDataPipePayload } from "@/services/players/mlb-player-data-pipe";
import { validateMlbPlayerDataPayload, type PlayerDataQualityResult } from "@/services/players/mlb-player-data-quality";

export type MlbPlayerDataIngestV2Result = {
  ok: boolean;
  generatedAt: string;
  quality: Omit<PlayerDataQualityResult, "cleanPayload">;
  ingest: Awaited<ReturnType<typeof ingestMlbPlayerDataPipe>> | null;
  rejectedRows: PlayerDataQualityResult["issues"];
  warnings: string[];
};

function stripCleanPayload(result: PlayerDataQualityResult): Omit<PlayerDataQualityResult, "cleanPayload"> {
  const { cleanPayload: _cleanPayload, ...rest } = result;
  return rest;
}

export async function ingestMlbPlayerDataV2(payload: MlbPlayerDataPipePayload): Promise<MlbPlayerDataIngestV2Result> {
  const quality = validateMlbPlayerDataPayload(payload);
  const blockers = quality.issues.filter((issue) => issue.severity === "BLOCKER");
  const rejectedRows = quality.issues.filter((issue) => issue.severity === "BLOCKER" || issue.severity === "HIGH");

  if (!quality.ok || quality.accepted.batters + quality.accepted.pitchers === 0) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      quality: stripCleanPayload(quality),
      ingest: null,
      rejectedRows,
      warnings: ["Ingest rejected by quality gate.", ...quality.warnings]
    };
  }

  const ingest = await ingestMlbPlayerDataPipe(quality.cleanPayload);
  return {
    ok: ingest.ok && blockers.length === 0,
    generatedAt: new Date().toISOString(),
    quality: stripCleanPayload(quality),
    ingest,
    rejectedRows,
    warnings: [...quality.warnings, ...ingest.warnings]
  };
}
