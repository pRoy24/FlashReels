import { NextResponse } from "next/server";

import { getSetupStatus, saveRuntimeKeys } from "@/lib/secure-config";
import { jsonError, readJson } from "@/lib/http";

export async function GET() {
  try {
    return NextResponse.json(await getSetupStatus());
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await readJson<Record<string, unknown>>(request);
    if (payload.samsarApiKey || payload.runwayApiKey || payload.serverSecret) {
      const status = await saveRuntimeKeys(payload);
      return NextResponse.json(status);
    }
    return NextResponse.json(await getSetupStatus());
  } catch (error) {
    return jsonError(error);
  }
}
