import SamsarClient, {
  type ExternalCreditsBalanceResponse,
  type ExternalCreditsRechargeResponse,
  type ExternalRequestSummary,
  type ExternalUserIdentity,
  type ExternalUserSummary,
} from "samsar-js";

import { requireSessionUserRecord } from "@/lib/auth";
import { mutateDb, nowIso, publicUser, readDb, type FlashReelsUser } from "@/lib/db";
import { apiError, normalizeString } from "@/lib/http";
import { getRuntimeKeys, getSamsarSdkBaseUrl, requireRuntimeKeys } from "@/lib/secure-config";

const DEFAULT_AUDIT_LIMIT = 25;

function getClient(apiKey: string) {
  return new SamsarClient({
    apiKey,
    baseUrl: getSamsarSdkBaseUrl(),
    timeoutMs: 60000,
  });
}

export function buildFlashReelsExternalUser(user: Pick<FlashReelsUser, "id" | "email" | "displayName">): ExternalUserIdentity {
  return {
    provider: "flashreels",
    external_user_id: user.id,
    unique_key: user.id,
    email: user.email,
    display_name: user.displayName,
    user_type: "flashreels_user",
  };
}

function parsePositiveInteger(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(normalizeString(value));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.round(numeric);
}

async function getBaseClient(request: Request) {
  const keys = await requireRuntimeKeys(request);
  return getClient(keys.samsarApiKey);
}

async function saveExternalApiKey(userId: string, externalApiKey: string) {
  const updatedAt = nowIso();
  await mutateDb(async (db) => {
    const user = db.users.find((candidate) => candidate.id === userId);
    if (!user) {
      return;
    }
    user.externalApiKey = externalApiKey;
    user.externalApiKeyCreatedAt = user.externalApiKeyCreatedAt || updatedAt;
    user.updatedAt = updatedAt;
  });
}

export async function markExternalApiKeyUsed(userId: string) {
  const updatedAt = nowIso();
  await mutateDb(async (db) => {
    const user = db.users.find((candidate) => candidate.id === userId);
    if (!user) {
      return;
    }
    user.externalApiKeyLastUsedAt = updatedAt;
    user.updatedAt = updatedAt;
  });
}

export async function ensureExternalUserProvisioned(request: Request, user: FlashReelsUser) {
  if (user.role === "admin" || user.externalApiKey) {
    return user;
  }

  const client = await getBaseClient(request);
  const response = await client.createExternalUserSession(buildFlashReelsExternalUser(user));
  const externalApiKey = normalizeString(response.data.external_api_key);
  if (externalApiKey) {
    await saveExternalApiKey(user.id, externalApiKey);
    return {
      ...user,
      externalApiKey,
      externalApiKeyCreatedAt: user.externalApiKeyCreatedAt || nowIso(),
    };
  }

  return user;
}

export async function provisionExternalUserForUserId(request: Request, userId: string) {
  const db = await readDb();
  const user = db.users.find((candidate) => candidate.id === userId);
  if (!user || user.role === "admin" || user.externalApiKey) {
    return user || null;
  }

  const keys = await getRuntimeKeys(request);
  if (!keys.samsarApiKey) {
    return user;
  }

  return ensureExternalUserProvisioned(request, user);
}

export async function getSamsarApiKeyForUser(request: Request, user: FlashReelsUser) {
  if (user.role !== "admin" && user.externalApiKey) {
    await markExternalApiKeyUsed(user.id);
    return user.externalApiKey;
  }

  const keys = await getRuntimeKeys(request);
  if (!keys.samsarApiKey) {
    throw apiError("Samsar API key is not configured.", 412);
  }
  return keys.samsarApiKey;
}

function summarizeExternalUser(externalUser: ExternalUserSummary | null | undefined) {
  if (!externalUser) {
    return null;
  }
  return {
    id: externalUser.id,
    email: externalUser.email,
    displayName: externalUser.display_name,
    generationCredits: externalUser.generation_credits,
    totalRequests: externalUser.total_requests,
    totalCreditsUsed: externalUser.total_credits_used,
    totalCreditsRefunded: externalUser.total_credits_refunded,
    totalCreditsPurchased: externalUser.total_credits_purchased,
    lastRequestAt: externalUser.last_request_at,
    lastPurchaseAt: externalUser.last_purchase_at,
    lastActivityAt: externalUser.last_activity_at,
    hasExternalApiKey: externalUser.has_external_api_key,
    externalApiKeyCreatedAt: externalUser.external_api_key_created_at,
    externalApiKeyLastUsedAt: externalUser.external_api_key_last_used_at,
  };
}

function summarizeRequest(request: ExternalRequestSummary) {
  return {
    requestId: request.request_id || request.external_request_id || "",
    upstreamRequestId: request.upstream_request_id,
    routeKey: request.route_key,
    status: request.status,
    prompt: request.prompt,
    videoUrl: request.video_url || request.published_video_url,
    imageCount: request.image_count,
    creditsCharged: request.credits_charged,
    creditsRefunded: request.credits_refunded,
    remainingCredits: request.remaining_credits,
    targetLanguage: request.target_language,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    publishedAt: request.published_at,
  };
}

export async function getExternalBillingDashboard(request: Request) {
  const user = await requireSessionUserRecord(request);
  const provisionedUser = await ensureExternalUserProvisioned(request, user);
  const client = await getBaseClient(request);
  const externalUser = buildFlashReelsExternalUser(provisionedUser);
  const [balanceResult, requestsResult] = await Promise.allSettled([
    client.getExternalCreditsBalance(externalUser),
    client.listExternalUserRequests(externalUser, { limit: DEFAULT_AUDIT_LIMIT }),
  ]);

  if (balanceResult.status === "rejected") {
    throw balanceResult.reason;
  }

  const balance = balanceResult.value.data as ExternalCreditsBalanceResponse;
  const requestData = requestsResult.status === "fulfilled" ? requestsResult.value.data : null;
  const externalSummary = summarizeExternalUser(
    balance.external_user || balance.externalUser || requestData?.external_user || requestData?.externalUser,
  );

  return {
    user: publicUser(provisionedUser),
    billing: {
      remainingCredits: balance.remainingCredits,
      lastTopUp: balance.lastTopUp || null,
      externalUser: externalSummary,
    },
    audit: {
      requests: (requestData?.requests || []).map(summarizeRequest),
      error: requestsResult.status === "rejected"
        ? requestsResult.reason instanceof Error ? requestsResult.reason.message : "Unable to load audit."
        : "",
    },
  };
}

export async function createExternalBillingRecharge(request: Request, creditsInput: unknown) {
  const credits = parsePositiveInteger(creditsInput);
  if (!credits) {
    throw apiError("Credits must be a positive number.", 422);
  }

  const user = await requireSessionUserRecord(request);
  const provisionedUser = await ensureExternalUserProvisioned(request, user);
  const client = await getBaseClient(request);
  const response = await client.createExternalCreditsRecharge(
    buildFlashReelsExternalUser(provisionedUser),
    credits,
  );
  return response.data as ExternalCreditsRechargeResponse;
}
