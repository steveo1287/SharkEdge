import { NextResponse } from "next/server";

import { getUfcProviderReadiness } from "@/services/ufc/provider-adapters";

export async function GET() {
  const providers = getUfcProviderReadiness();
  return NextResponse.json({
    ok: true,
    ready: providers.every((provider) => provider.ready),
    providers
  });
}
