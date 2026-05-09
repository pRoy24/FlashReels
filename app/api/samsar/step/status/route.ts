import { NextResponse } from "next/server";

import { jsonError } from "@/lib/http";
import { getSamsarStepStatus } from "@/lib/samsar";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestId = url.searchParams.get("request_id") || url.searchParams.get("session_id") || "";
    const response = await getSamsarStepStatus(request, requestId);
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(error);
  }
}
