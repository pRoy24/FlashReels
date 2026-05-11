import { NextResponse } from "next/server";

import { createBootstrapAdminUser, setSessionCookie } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { apiError, jsonError, readJson } from "@/lib/http";
import { getSetupStatus, saveRuntimeKeys } from "@/lib/secure-config";

async function requireFirstRun() {
  const db = await readDb();
  if (db.users.length > 0) {
    throw apiError("Admin onboarding is already complete.", 409);
  }
}

export async function GET(request: Request) {
  try {
    const db = await readDb();
    if (db.users.length > 0) {
      return NextResponse.json({ needed: false });
    }

    return NextResponse.json({
      needed: true,
      setup: await getSetupStatus(request),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireFirstRun();
    const payload = await readJson<Record<string, unknown>>(request);
    const step = typeof payload.step === "string" ? payload.step : "";

    if (step === "keys") {
      const result = await saveRuntimeKeys(payload, request);
      return NextResponse.json({ setup: result.status });
    }

    if (step === "admin") {
      const setup = await getSetupStatus(request);
      if (!setup.ready) {
        throw apiError("Save the Samsar API key before creating the admin login.", 412);
      }
      const user = await createBootstrapAdminUser(payload);
      const response = NextResponse.json({ user });
      setSessionCookie(response, user.id);
      return response;
    }

    throw apiError("Unknown onboarding step.", 422);
  } catch (error) {
    return jsonError(error);
  }
}
