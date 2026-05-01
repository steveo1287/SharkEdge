import { NextResponse } from "next/server";

export function ensureInternalApiAccess(request: Request) {
  const configuredKey =
    process.env.INTERNAL_API_KEY?.trim() || process.env.INTERNAL_API_KEY2?.trim();
  if (!configuredKey) {
    return null;
  }

  const providedKey = request.headers.get("x-api-key")?.trim();
  if (providedKey !== configuredKey) {
    return NextResponse.json(
      {
        error: "Unauthorized"
      },
      {
        status: 401
      }
    );
  }

  return null;
}
