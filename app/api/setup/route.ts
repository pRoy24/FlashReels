import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
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
    await requireSessionUser(request);
    const payload = await readJson<Record<string, unknown>>(request);
    if (payload.samsarApiKey || payload.runwayApiKey || payload.serverSecret) {
      const result = await saveRuntimeKeys(payload, request);
      const response = NextResponse.json(result.status);
      if (result.cookie) {
        response.cookies.set(result.cookie.name, result.cookie.value, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: result.cookie.maxAge,
        });
      }
      return response;
    }
    return NextResponse.json(await getSetupStatus(request));
  } catch (error) {
    return jsonError(error);
  }
}
