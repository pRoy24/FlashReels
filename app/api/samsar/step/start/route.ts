import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/http";
import { startSamsarStepVideo, type StartPayload } from "@/lib/samsar";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser(request);
    const payload = await readJson<StartPayload>(request);
    console.info("[FlashReels] /api/samsar/step/start received", {
      userId: user.id,
      role: user.role,
      imageCount: Array.isArray(payload.image_urls) ? payload.image_urls.length : 0,
    });
    const response = await startSamsarStepVideo(request, payload);
    return NextResponse.json(response);
  } catch (error) {
    console.error("[FlashReels] /api/samsar/step/start failed", {
      status: typeof (error as { status?: unknown })?.status === "number"
        ? (error as { status: number }).status
        : 500,
      message: error instanceof Error ? error.message : "Unexpected error",
    });
    return jsonError(error);
  }
}
