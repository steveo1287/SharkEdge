import { NextResponse } from "next/server";

import { csvImportSchema } from "@/lib/validation/product";
import { importCsvBets } from "@/services/imports/csv-import-service";

function getStatusCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/database|prisma|migration/i.test(message)) {
    return 503;
  }

  if (/premium|limit/i.test(message)) {
    return 403;
  }

  return 400;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = csvImportSchema.parse(body);
    const result = await importCsvBets(payload);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to import CSV bets."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}
