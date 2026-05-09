import { NextResponse } from "next/server";

import { jsonError } from "@/lib/http";
import { getRunwayTask, normalizeEnvironmentParam } from "@/lib/runway";

export async function GET(request: Request, context: { params: Promise<{ environment: string; requestId: string }> }) {
  try {
    const { environment, requestId } = await context.params;
    const task = await getRunwayTask(normalizeEnvironmentParam(environment), requestId);
    return NextResponse.json(task);
  } catch (error) {
    return jsonError(error);
  }
}
