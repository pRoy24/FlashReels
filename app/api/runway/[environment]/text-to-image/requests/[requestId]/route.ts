import { NextResponse } from "next/server";

import { jsonError } from "@/lib/http";
import { buildRunwayResult, getRunwayTask, normalizeEnvironmentParam } from "@/lib/runway";

export async function GET(request: Request, context: { params: Promise<{ environment: string; requestId: string }> }) {
  try {
    const { environment, requestId } = await context.params;
    const task = await getRunwayTask(normalizeEnvironmentParam(environment), requestId);
    return NextResponse.json(buildRunwayResult(task, "image"));
  } catch (error) {
    return jsonError(error);
  }
}
