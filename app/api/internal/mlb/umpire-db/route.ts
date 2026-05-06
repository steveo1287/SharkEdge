import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { seedMlbUmpireDb, refreshUmpireAssignments, listUmpireTendencies, getMlbUmpireTendencyByName } from "@/services/simulation/mlb-umpire-db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const querySchema = z.object({
  action: z.enum(["seed", "refresh-assignments", "list", "lookup"]).optional().default("list"),
  name: z.string().optional(),
});

export async function GET(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    action: url.searchParams.get("action") ?? "list",
    name: url.searchParams.get("name") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid params", issues: parsed.error.issues }, { status: 400 });
  }

  const { action, name } = parsed.data;

  try {
    switch (action) {
      case "seed": {
        const result = await seedMlbUmpireDb();
        return NextResponse.json({ ok: true, action: "seed", result });
      }
      case "refresh-assignments": {
        const [seed, assignments] = await Promise.all([seedMlbUmpireDb(), refreshUmpireAssignments()]);
        return NextResponse.json({ ok: true, action: "refresh-assignments", seed, assignments });
      }
      case "list": {
        const tendencies = await listUmpireTendencies();
        return NextResponse.json({ ok: true, count: tendencies.length, tendencies });
      }
      case "lookup": {
        if (!name) {
          return NextResponse.json({ ok: false, error: "name param required for lookup" }, { status: 400 });
        }
        const tendency = await getMlbUmpireTendencyByName(name);
        return NextResponse.json({ ok: true, name, found: Boolean(tendency), tendency });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[mlb/umpire-db]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const [seed, assignments] = await Promise.all([seedMlbUmpireDb(), refreshUmpireAssignments()]);
    return NextResponse.json({ ok: true, seed, assignments });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
