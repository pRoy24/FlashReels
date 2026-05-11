import { NextResponse } from "next/server";

import { loginUser, setSessionCookie } from "@/lib/auth";
import { provisionExternalUserForUserId } from "@/lib/billing";
import { jsonError, readJson } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const payload = await readJson<Record<string, unknown>>(request);
    const user = await loginUser(payload);
    await provisionExternalUserForUserId(request, user.id).catch(() => undefined);
    const response = NextResponse.json({ user });
    setSessionCookie(response, user.id);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
