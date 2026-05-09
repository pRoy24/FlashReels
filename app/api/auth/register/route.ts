import { NextResponse } from "next/server";

import { registerUser, setSessionCookie } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const payload = await readJson<Record<string, unknown>>(request);
    const user = await registerUser(payload);
    const response = NextResponse.json({ user });
    setSessionCookie(response, user.id);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
