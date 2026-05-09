import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { apiError, jsonError, normalizeString, readJson } from "@/lib/http";
import { joinSamsarVideos } from "@/lib/samsar";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser(request);
    const payload = await readJson<Record<string, unknown>>(request);
    const videoIds = Array.isArray(payload.videoIds)
      ? payload.videoIds.map(normalizeString).filter(Boolean)
      : Array.isArray(payload.video_ids)
        ? payload.video_ids.map(normalizeString).filter(Boolean)
        : [];

    if (videoIds.length < 2) {
      throw apiError("Select at least two videos to join.");
    }

    const db = await readDb();
    const videos = videoIds.map((videoId) => db.videos.find((candidate) => (
      candidate.id === videoId &&
      candidate.userId === user.id
    )));
    if (videos.some((video) => !video)) {
      throw apiError("One or more videos were not found.", 404);
    }

    const sessionIds = videos
      .map((video) => video?.samsarSessionId || video?.samsarRequestId || "")
      .filter(Boolean);
    if (sessionIds.length < 2) {
      throw apiError("Select at least two videos with Samsar session ids.");
    }

    const response = await joinSamsarVideos(request, {
      session_ids: sessionIds,
      blend_scenes: payload.blendScenes === true || payload.blend_scenes === true,
    });

    return NextResponse.json({
      ...response,
      operation: "join",
      sourceVideoIds: videoIds,
      sourceSessionIds: sessionIds,
    });
  } catch (error) {
    return jsonError(error);
  }
}
