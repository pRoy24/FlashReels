import { NextResponse } from "next/server";

import { getExternalBillingDashboard } from "@/lib/billing";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await getExternalBillingDashboard(request));
  } catch (error) {
    return jsonError(error);
  }
}
