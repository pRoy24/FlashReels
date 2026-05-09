import { NextResponse } from "next/server";

import { jsonError } from "@/lib/http";
import { buildRunwayResult, getRunwayTask } from "@/lib/runway";

export async function GET(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId } = await context.params;
    const task = await getRunwayTask(requestId);
    return NextResponse.json(buildRunwayResult(task, "image"));
  } catch (error) {
    return jsonError(error);
  }
}
