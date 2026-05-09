import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { apiError, jsonError, normalizeString, readJson } from "@/lib/http";
import { translateSamsarVideo } from "@/lib/samsar";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser(request);
    const payload = await readJson<Record<string, unknown>>(request);
    const videoId = normalizeString(payload.videoId || payload.video_id);
    const language = normalizeString(payload.language || payload.language_code || payload.languageCode);
    if (!videoId) {
      throw apiError("videoId is required.");
    }
    if (!language) {
      throw apiError("language is required.");
    }

    const db = await readDb();
    const video = db.videos.find((candidate) => candidate.id === videoId && candidate.userId === user.id);
    if (!video) {
      throw apiError("Video not found.", 404);
    }
    const sourceSessionId = video.samsarSessionId || video.samsarRequestId;
    if (!sourceSessionId) {
      throw apiError("This library item does not have a Samsar session id.");
    }

    const response = await translateSamsarVideo(request, {
      videoSessionId: sourceSessionId,
      language,
      language_code: language,
      enable_subtitles: payload.enableSubtitles !== false && payload.enable_subtitles !== false,
      translate_outro: payload.translateOutro !== false && payload.translate_outro !== false,
      translate_footer: payload.translateFooter !== false && payload.translate_footer !== false,
    });

    return NextResponse.json({
      ...response,
      operation: "retranslate",
      sourceVideoId: video.id,
      sourceSessionId,
      language,
    });
  } catch (error) {
    return jsonError(error);
  }
}
