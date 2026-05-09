import { NextResponse } from "next/server";

import { getSetupStatus, saveRuntimeKeys } from "@/lib/secure-config";
import { jsonError, readJson } from "@/lib/http";

export async function GET() {
  return NextResponse.json(await getSetupStatus());
}

export async function POST(request: Request) {
  try {
    const payload = await readJson<Record<string, unknown>>(request);
    if (payload.samsarApiKey || payload.runwayApiKey) {
      const status = await saveRuntimeKeys(payload);
      return NextResponse.json(status);
    }
    return NextResponse.json(await getSetupStatus());
  } catch (error) {
    return jsonError(error);
  }
}
