import crypto from "node:crypto";

import { apiError, normalizeString } from "@/lib/http";
import { getRuntimeKeys } from "@/lib/secure-config";

function authHeaderSecret(request: Request) {
  const authorization = normalizeString(request.headers.get("authorization"));
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  if (authorization.toLowerCase().startsWith("key ")) {
    return authorization.slice(4).trim();
  }

  return (
    normalizeString(request.headers.get("x-flashreels-adapter-secret")) ||
    normalizeString(request.headers.get("x-adapter-api-key")) ||
    normalizeString(request.headers.get("x-api-key"))
  );
}

function bodySecret(body?: Record<string, unknown>) {
  if (!body) {
    return "";
  }
  return (
    normalizeString(body.serverSecret) ||
    normalizeString(body.server_secret) ||
    normalizeString(body.apiKey) ||
    normalizeString(body.api_key) ||
    normalizeString(body.customApiKey) ||
    normalizeString(body.custom_api_key)
  );
}

function querySecret(request: Request) {
  const url = new URL(request.url);
  return (
    normalizeString(url.searchParams.get("api_key")) ||
    normalizeString(url.searchParams.get("apiKey")) ||
    normalizeString(url.searchParams.get("adapter_key"))
  );
}

function matchesSecret(candidate: string, expected: string) {
  if (!candidate || !expected) {
    return false;
  }

  const candidateHash = crypto.createHash("sha256").update(candidate).digest();
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(candidateHash, expectedHash);
}

export async function requireAdapterAuth(request: Request, body?: Record<string, unknown>) {
  const { serverSecret } = await getRuntimeKeys();
  if (!serverSecret) {
    throw apiError("Server secret is not configured.", 412);
  }

  const candidate = authHeaderSecret(request) || bodySecret(body) || querySecret(request);
  if (!matchesSecret(candidate, serverSecret)) {
    throw apiError("Invalid adapter secret.", 401);
  }
}
