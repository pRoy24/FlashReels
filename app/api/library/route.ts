import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { createId, mutateDb, nowIso, readDb, type FlashReelsMode } from "@/lib/db";
import { apiError, jsonError, normalizeString, readJson } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser(request);
    const db = await readDb();
    const videos = db.videos
      .filter((video) => video.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ videos });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser(request);
    const payload = await readJson<Record<string, unknown>>(request);
    const sourceUrl = normalizeString(payload.sourceUrl || payload.source_url || payload.videoUrl || payload.video_url);
    const prompt = normalizeString(payload.prompt);
    const mode = payload.mode === "image_list_to_video" ? "image_list_to_video" : "text_to_video";
    if (!sourceUrl) {
      throw apiError("sourceUrl is required.");
    }

    const video = await mutateDb((db) => {
      const now = nowIso();
      const existing = db.videos.find((candidate) =>
        candidate.userId === user.id &&
        normalizeString(candidate.samsarRequestId) &&
        candidate.samsarRequestId === normalizeString(payload.samsarRequestId || payload.samsar_request_id),
      );

      if (existing) {
        existing.title = normalizeString(payload.title) || existing.title;
        existing.sourceUrl = sourceUrl;
        existing.status = normalizeString(payload.status) || "COMPLETED";
        existing.updatedAt = now;
        existing.metadata = {
          ...(existing.metadata || {}),
          ...(payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata) ? payload.metadata : {}),
        };
        return existing;
      }

      const created = {
        id: createId("vid"),
        userId: user.id,
        title: normalizeString(payload.title) || "Untitled render",
        mode: mode as FlashReelsMode,
        prompt,
        sourceUrl,
        samsarRequestId: normalizeString(payload.samsarRequestId || payload.samsar_request_id),
        samsarSessionId: normalizeString(payload.samsarSessionId || payload.samsar_session_id),
        status: normalizeString(payload.status) || "COMPLETED",
        metadata: payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
          ? payload.metadata as Record<string, unknown>
          : {},
        createdAt: now,
        updatedAt: now,
      };
      db.videos.push(created);
      return created;
    });

    return NextResponse.json({ video });
  } catch (error) {
    return jsonError(error);
  }
}
