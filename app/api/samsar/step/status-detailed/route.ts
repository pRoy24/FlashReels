import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { apiError, jsonError } from "@/lib/http";
import { getSamsarStepStatusDetailed, getSamsarVideoStatusDetailed } from "@/lib/samsar";

export async function GET(request: Request) {
  try {
    await requireSessionUser(request);
    const url = new URL(request.url);
    const requestId = url.searchParams.get("request_id") || url.searchParams.get("session_id") || "";
    if (!requestId) {
      throw apiError("request_id is required.");
    }
    let response;
    try {
      response = await getSamsarStepStatusDetailed(request, requestId);
    } catch (error) {
      const status = (error as { status?: unknown })?.status;
      if (status === 401 || status === 412) {
        throw error;
      }
      response = await getSamsarVideoStatusDetailed(request, requestId);
      const session = response && typeof response === "object" && "session" in response
        ? (response as { session?: { routeType?: unknown; route_type?: unknown } }).session
        : null;
      const routeType = typeof session?.routeType === "string"
        ? session.routeType
        : typeof session?.route_type === "string"
          ? session.route_type
          : "";
      if (routeType === "step") {
        throw apiError("Samsar step status is unavailable for this step render, so approval state cannot be loaded.", 502);
      }
    }
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(error);
  }
}
