import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { apiError, jsonError, normalizeString, readJson } from "@/lib/http";
import { processNextSamsarStep } from "@/lib/samsar";

const PROCESS_NEXT_TIMEOUT_MS = 40000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(apiError(`Samsar process-next timed out after ${Math.round(timeoutMs / 1000)}s.`, 504));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export async function POST(request: Request) {
  try {
    await requireSessionUser(request);
    const payload = await readJson<Record<string, unknown>>(request);
    const requestId = normalizeString(payload.request_id || payload.requestId || payload.session_id || payload.sessionId);
    const response = await withTimeout(processNextSamsarStep(request, requestId), PROCESS_NEXT_TIMEOUT_MS);
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(error);
  }
}
