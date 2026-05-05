"use server";

import { runMlbGameSpineIngestion } from "@/services/mlb/mlb-game-spine";

export async function refreshMlbGameSpine() {
  return runMlbGameSpineIngestion();
}
