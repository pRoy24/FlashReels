import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { publishLibraryVideo, unpublishLibraryVideo } from "@/lib/feed";
import { jsonError, normalizeString, readJson } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser(request);
    const payload = await readJson<Record<string, unknown>>(request);
    const videoId = normalizeString(payload.videoId || payload.video_id);
    const result = await publishLibraryVideo(user.id, videoId);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser(request);
    const payload = await readJson<Record<string, unknown>>(request);
    const videoId = normalizeString(payload.videoId || payload.video_id);
    const result = await unpublishLibraryVideo(user.id, videoId);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
