import { NextResponse } from "next/server";

export function ensureInternalApiAccess(request: Request) {
  const acceptedKeys = [
    process.env.INTERNAL_API_KEY?.trim(),
    process.env.INTERNAL_API_KEY2?.trim(),
    process.env.TRENDS_REFRESH_TOKEN?.trim(),
    process.env.CRON_SECRET?.trim()
  ].filter((value): value is string => Boolean(value && value.length));

  if (!acceptedKeys.length) {
    return null;
  }

  const headerApiKey = request.headers.get("x-api-key")?.trim() ?? null;
  const authHeader = request.headers.get("authorization")?.trim() ?? "";
  const bearerKey = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  let queryToken: string | null = null;
  try {
    queryToken = new URL(request.url).searchParams.get("token")?.trim() ?? null;
  } catch {
    queryToken = null;
  }

  const providedKeys = [headerApiKey, bearerKey, queryToken].filter(
    (value): value is string => Boolean(value && value.length)
  );
  const authorized = providedKeys.some((provided) => acceptedKeys.includes(provided));

  if (!authorized) {
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
