import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { jsonError, normalizeString, readJson } from "@/lib/http";
import { processNextSamsarStep } from "@/lib/samsar";

export async function POST(request: Request) {
  try {
    await requireSessionUser(request);
    const payload = await readJson<Record<string, unknown>>(request);
    const requestId = normalizeString(payload.request_id || payload.requestId || payload.session_id || payload.sessionId);
    const response = await processNextSamsarStep(request, requestId);
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(error);
  }
}
