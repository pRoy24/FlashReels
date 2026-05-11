import { NextResponse } from "next/server";

import { createExternalBillingRecharge } from "@/lib/billing";
import { jsonError, readJson } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const payload = await readJson<Record<string, unknown>>(request);
    return NextResponse.json(await createExternalBillingRecharge(request, payload.credits));
  } catch (error) {
    return jsonError(error);
  }
}
