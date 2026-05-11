import { NextResponse } from "next/server";

import { requireAdminUser, requireSessionUser } from "@/lib/auth";
import { getSetupStatus, saveRuntimeKeys } from "@/lib/secure-config";
import { jsonError, readJson } from "@/lib/http";

export async function GET(request: Request) {
  try {
    await requireSessionUser(request);
    return NextResponse.json(await getSetupStatus(request));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminUser(request);
    const payload = await readJson<Record<string, unknown>>(request);
    if (payload.samsarApiKey || payload.runwayApiKey || payload.serverSecret) {
      const result = await saveRuntimeKeys(payload, request);
      return NextResponse.json(result.status);
    }
    return NextResponse.json(await getSetupStatus(request));
  } catch (error) {
    return jsonError(error);
  }
}
