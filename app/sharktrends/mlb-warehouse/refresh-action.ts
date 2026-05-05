"use server";

import { runMlbBettingWarehouseRefresh } from "@/services/mlb/mlb-betting-warehouse";

export async function refreshMlbBettingWarehouse() {
  return runMlbBettingWarehouseRefresh();
}
