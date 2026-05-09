import { NextResponse } from "next/server";

import { getSetupStatus, saveRuntimeKeys, setActiveEnvironment } from "@/lib/secure-config";
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
    if (payload.environment) {
      await setActiveEnvironment(payload.environment);
    }
    return NextResponse.json(await getSetupStatus());
  } catch (error) {
    return jsonError(error);
  }
}
