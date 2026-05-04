import { NextResponse } from "next/server";

import { buildGeneratedSystemAttachments } from "@/services/trends/generated-system-attachments";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseIntParam(value: string | null, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function parseBool(value: string | null) {
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const league = (url.searchParams.get("league") ?? "ALL").toUpperCase();
  const date = url.searchParams.get("date") ?? undefined;
  const limitEvents = parseIntParam(url.searchParams.get("limitEvents"), 100, 1, 300);
  const topSystemsPerGame = parseIntParam(url.searchParams.get("topSystemsPerGame"), 3, 1, 10);
  const includeResearch = parseBool(url.searchParams.get("includeResearch"));

  const payload = await buildGeneratedSystemAttachments({
    league,
    date,
    limitEvents,
    topSystemsPerGame,
    includeResearch
  });

  return NextResponse.json({ ok: true, ...payload });
}
