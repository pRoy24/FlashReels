import { NextResponse } from "next/server";

import { jsonError } from "@/lib/http";
import { getRunwayTask } from "@/lib/runway";

export async function GET(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId } = await context.params;
    const task = await getRunwayTask(requestId);
    return NextResponse.json(task);
  } catch (error) {
    return jsonError(error);
  }
}
