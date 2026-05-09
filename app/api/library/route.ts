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
      .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
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
    const samsarRequestId = normalizeString(payload.samsarRequestId || payload.samsar_request_id);
    const samsarSessionId = normalizeString(payload.samsarSessionId || payload.samsar_session_id);
    const prompt = normalizeString(payload.prompt);
    const mode = "image_list_to_video" as FlashReelsMode;
    if (!sourceUrl && !samsarRequestId && !samsarSessionId) {
      throw apiError("A sourceUrl or Samsar session id is required.");
    }

    const video = await mutateDb((db) => {
      const now = nowIso();
      const existing = db.videos.find((candidate) => {
        if (candidate.userId !== user.id) {
          return false;
        }
        return Boolean(
          (samsarRequestId && candidate.samsarRequestId === samsarRequestId) ||
          (samsarSessionId && candidate.samsarSessionId === samsarSessionId),
        );
      });

      if (existing) {
        existing.title = normalizeString(payload.title) || existing.title;
        existing.prompt = prompt || existing.prompt;
        existing.sourceUrl = sourceUrl || existing.sourceUrl;
        existing.samsarSessionId = samsarSessionId || existing.samsarSessionId;
        existing.status = normalizeString(payload.status) || existing.status || "PENDING";
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
        samsarRequestId,
        samsarSessionId,
        status: normalizeString(payload.status) || "PENDING",
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
