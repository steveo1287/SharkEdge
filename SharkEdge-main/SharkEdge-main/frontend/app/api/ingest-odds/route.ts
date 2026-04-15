import { NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/services/backend/base-url";

async function proxy(path: string, init?: RequestInit) {
  try {
    const response = await fetch(`${getBackendBaseUrl()}${path}`, {
      ...init,
      cache: "no-store"
    });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type":
          response.headers.get("content-type") ?? "application/json"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to reach the SharkEdge backend ingest service."
      },
      {
        status: 502
      }
    );
  }
}

export async function GET() {
  return proxy("/api/ingest/odds/status");
}

export async function POST(request: Request) {
  const xApiKey = request.headers.get("x-api-key");

  return proxy("/api/ingest/odds", {
    method: "POST",
    body: await request.text(),
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      ...(xApiKey ? { "x-api-key": xApiKey } : {})
    }
  });
}
