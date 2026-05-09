import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { apiError, jsonError } from "@/lib/http";

export async function DELETE(request: Request, context: { params: Promise<{ videoId: string }> }) {
  try {
    const user = await requireSessionUser(request);
    const { videoId } = await context.params;
    await mutateDb((db) => {
      const index = db.videos.findIndex((video) => video.id === videoId && video.userId === user.id);
      if (index === -1) {
        throw apiError("Video not found.", 404);
      }
      db.videos.splice(index, 1);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
