import { NextResponse } from "next/server";

import { listPublishedFeedItems } from "@/lib/feed";
import { jsonError } from "@/lib/http";

export async function GET() {
  try {
    const videos = await listPublishedFeedItems();
    return NextResponse.json({ videos });
  } catch (error) {
    return jsonError(error);
  }
}
