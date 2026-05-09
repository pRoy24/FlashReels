import { NextResponse } from "next/server";

import { jsonError, readJson } from "@/lib/http";
import { normalizeEnvironmentParam, submitRunwayTextToImage } from "@/lib/runway";

export async function POST(request: Request, context: { params: Promise<{ environment: string }> }) {
  try {
    const { environment } = await context.params;
    const body = await readJson<{ input?: Record<string, unknown> }>(request);
    const normalizedEnvironment = normalizeEnvironmentParam(environment);
    const response = await submitRunwayTextToImage({
      environment: normalizedEnvironment,
      request,
      endpointPath: `/api/runway/${normalizedEnvironment}/text-to-image`,
      input: body.input || {},
    });
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(error);
  }
}
