import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/http";
import { getWhitelist, saveWhitelist } from "@/lib/whitelist";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser(request);
    return NextResponse.json(await getWhitelist(user));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser(request);
    const payload = await readJson<Record<string, unknown>>(request);
    return NextResponse.json(await saveWhitelist(payload, user));
  } catch (error) {
    return jsonError(error);
  }
}
