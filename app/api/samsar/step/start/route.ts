import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/http";
import { startSamsarStepVideo, type StartPayload } from "@/lib/samsar";

export async function POST(request: Request) {
  try {
    await requireSessionUser(request);
    const payload = await readJson<StartPayload>(request);
    const response = await startSamsarStepVideo(request, payload);
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(error);
  }
}
