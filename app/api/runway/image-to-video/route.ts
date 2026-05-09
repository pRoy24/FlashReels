import { NextResponse } from "next/server";

import { jsonError, readJson } from "@/lib/http";
import { submitRunwayImageToVideo } from "@/lib/runway";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ input?: Record<string, unknown> }>(request);
    const response = await submitRunwayImageToVideo({
      request,
      endpointPath: "/api/runway/image-to-video",
      input: body.input || {},
    });
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(error);
  }
}
