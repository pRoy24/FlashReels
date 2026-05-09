import { NextResponse } from "next/server";

import { requireAdapterAuth } from "@/lib/adapter-auth";
import { jsonError } from "@/lib/http";
import { buildRunwayResult, getRunwayTask } from "@/lib/runway";

export async function GET(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    await requireAdapterAuth(request);
    const { requestId } = await context.params;
    const task = await getRunwayTask(requestId);
    return NextResponse.json(buildRunwayResult(task, "video"));
  } catch (error) {
    return jsonError(error);
  }
}
