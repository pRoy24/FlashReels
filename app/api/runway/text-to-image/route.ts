import { NextResponse } from "next/server";

import { requireAdapterAuth } from "@/lib/adapter-auth";
import { jsonError, readJson } from "@/lib/http";
import { submitRunwayTextToImage } from "@/lib/runway";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ input?: Record<string, unknown> }>(request);
    await requireAdapterAuth(request, body as Record<string, unknown>);
    const response = await submitRunwayTextToImage({
      request,
      endpointPath: "/api/runway/text-to-image",
      input: body.input || {},
    });
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(error);
  }
}
