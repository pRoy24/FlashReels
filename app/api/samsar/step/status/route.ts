import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { apiError, jsonError } from "@/lib/http";
import { getSamsarStepStatus } from "@/lib/samsar";

export async function GET(request: Request) {
  try {
    await requireSessionUser(request);
    const url = new URL(request.url);
    const requestId = url.searchParams.get("request_id") || url.searchParams.get("session_id") || "";
    if (!requestId) {
      throw apiError("request_id is required.");
    }
    const response = await getSamsarStepStatus(request, requestId);
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(error);
  }
}
