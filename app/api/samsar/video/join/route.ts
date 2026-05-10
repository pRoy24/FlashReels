import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { createId, mutateDb, nowIso, readDb, type FlashReelsVideo } from "@/lib/db";
import { apiError, jsonError, normalizeString, readJson } from "@/lib/http";
import { joinSamsarVideos } from "@/lib/samsar";

type ApiRecord = Record<string, unknown>;

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function getResponseRequestId(response: ApiRecord) {
  return firstString(
    response.request_id,
    response.requestId,
    response.session_id,
    response.sessionId,
    response.external_request_id,
    response.externalRequestId,
  );
}

function getResponseStatus(response: ApiRecord) {
  return firstString(response.status, response.step_status, response.stepStatus) || "PENDING";
}

async function saveJoinedVideoToLibrary({
  userId,
  response,
  sourceVideoIds,
  sourceSessionIds,
  title,
}: {
  userId: string;
  response: ApiRecord;
  sourceVideoIds?: string[];
  sourceSessionIds: string[];
  title: string;
}) {
  const requestId = getResponseRequestId(response);
  if (!requestId) {
    return null;
  }

  return mutateDb((db) => {
    const now = nowIso();
    const existing = db.videos.find((candidate) => (
      candidate.userId === userId &&
      (candidate.samsarRequestId === requestId || candidate.samsarSessionId === requestId)
    ));
    const nextVideo: FlashReelsVideo = existing || {
      id: createId("vid"),
      userId,
      title,
      mode: "image_list_to_video",
      prompt: title,
      sourceUrl: "",
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    };

    nextVideo.title = title;
    nextVideo.prompt = title;
    nextVideo.samsarRequestId = requestId;
    nextVideo.samsarSessionId = requestId;
    nextVideo.status = getResponseStatus(response);
    nextVideo.updatedAt = now;
    nextVideo.metadata = {
      ...(nextVideo.metadata || {}),
      payload: {
        operation: "join",
        ...(sourceVideoIds ? { sourceVideoIds } : {}),
        sourceSessionIds,
        prompt: title,
      },
      stepStatus: response,
    };

    if (!existing) {
      db.videos.push(nextVideo);
    }
    return nextVideo;
  });
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser(request);
    const payload = await readJson<Record<string, unknown>>(request);
    const sessionIds = Array.isArray(payload.sessionIds)
      ? payload.sessionIds.map(normalizeString).filter(Boolean)
      : Array.isArray(payload.session_ids)
        ? payload.session_ids.map(normalizeString).filter(Boolean)
        : [];
    const videoIds = Array.isArray(payload.videoIds)
      ? payload.videoIds.map(normalizeString).filter(Boolean)
      : Array.isArray(payload.video_ids)
        ? payload.video_ids.map(normalizeString).filter(Boolean)
        : [];

    if (sessionIds.length >= 2) {
      const response = await joinSamsarVideos(request, {
        session_ids: sessionIds,
        blend_scenes: payload.blendScenes === true || payload.blend_scenes === true,
      });
      const libraryVideo = await saveJoinedVideoToLibrary({
        userId: user.id,
        response: response as ApiRecord,
        sourceSessionIds: sessionIds,
        title: "Joined reel",
      });

      return NextResponse.json({
        ...response,
        operation: "join",
        sourceSessionIds: sessionIds,
        libraryVideo,
      });
    }

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

    const videoSessionIds = videos
      .map((video) => video?.samsarSessionId || video?.samsarRequestId || "")
      .filter(Boolean);
    if (videoSessionIds.length < 2) {
      throw apiError("Select at least two videos with Samsar session ids.");
    }

    const response = await joinSamsarVideos(request, {
      session_ids: videoSessionIds,
      blend_scenes: payload.blendScenes === true || payload.blend_scenes === true,
    });
    const joinedTitle = `Joined reel: ${videos
      .map((video) => video?.title)
      .filter(Boolean)
      .join(" + ")}`;
    const libraryVideo = await saveJoinedVideoToLibrary({
      userId: user.id,
      response: response as ApiRecord,
      sourceVideoIds: videoIds,
      sourceSessionIds: videoSessionIds,
      title: joinedTitle,
    });

    return NextResponse.json({
      ...response,
      operation: "join",
      sourceVideoIds: videoIds,
      sourceSessionIds: videoSessionIds,
      libraryVideo,
    });
  } catch (error) {
    return jsonError(error);
  }
}
