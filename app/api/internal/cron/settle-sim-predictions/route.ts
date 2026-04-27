import { NextResponse } from "next/server";
import { settleSimPredictions } from "@/services/simulation/sim-settlement-service";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";

export async function GET(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const result = await settleSimPredictions();

    return NextResponse.json({
      success: true,
      message: `Settled ${result.settledCount} of ${result.totalOpen} open predictions`,
      details: result
    });
  } catch (error) {
    console.error("Settlement job failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
