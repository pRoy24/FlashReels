import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { getSamsarStepStatusDetailed } from "@/lib/samsar";

export async function GET(request: Request) {
  try {
    await requireSessionUser(request);
    const url = new URL(request.url);
    const requestId = url.searchParams.get("request_id") || url.searchParams.get("session_id") || "";
    const response = await getSamsarStepStatusDetailed(request, requestId);
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(error);
  }
}
