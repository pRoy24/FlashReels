import SamsarClient, {
  type CreateV2StepImageToVideoInput,
  type V2StepVideoDetailedStatusResponse,
  type V2StepVideoStatusResponse,
} from "samsar-js";

import { requireSessionUser } from "@/lib/auth";
import { normalizeImageListCreatorPayload } from "@/lib/creator";
import { apiError } from "@/lib/http";
import { getAdapterBaseUrl, getRuntimeKeys, getSamsarSdkBaseUrl, requireRuntimeKeys } from "@/lib/secure-config";

type StartPayload = Record<string, unknown>;

function getClient(apiKey: string) {
  return new SamsarClient({
    apiKey,
    baseUrl: getSamsarSdkBaseUrl(),
    timeoutMs: 60000,
  });
}

function buildExternalUser(user: { id: string; email?: string; displayName?: string }) {
  return {
    provider: "flashreels",
    external_user_id: user.id,
    unique_key: user.id,
    email: user.email,
    display_name: user.displayName,
    user_type: "flashreels_user",
  };
}

function buildCustomAdapters(request: Request, serverSecret: string) {
  const baseUrl = getAdapterBaseUrl(request);
  return {
    base_url: baseUrl,
    text_to_image: "/api/runway/text-to-image",
    image_to_video: "/api/runway/image-to-video",
    api_key: serverSecret,
  };
}

export async function startSamsarStepVideo(request: Request, payload: StartPayload) {
  const user = await requireSessionUser(request);
  const keys = await requireRuntimeKeys();
  const client = getClient(keys.samsarApiKey);
  const normalizedPayload = normalizeImageListCreatorPayload(
    payload as Record<string, unknown>,
  );
  const input: CreateV2StepImageToVideoInput = {
    ...normalizedPayload,
    custom_adapters: buildCustomAdapters(request, keys.serverSecret),
  };
  const response = await client.createV2StepImageToVideo(input, {
    externalUser: buildExternalUser(user),
  });
  return response.data;
}

export async function getSamsarStepStatusDetailed(
  request: Request,
  requestId: string,
): Promise<V2StepVideoDetailedStatusResponse> {
  const user = await requireSessionUser(request);
  const keys = await getRuntimeKeys();
  if (!keys.samsarApiKey) {
    throw apiError("Samsar API key is not configured.", 412);
  }
  const client = getClient(keys.samsarApiKey);
  const response = await client.getV2StepVideoStatusDetailed(requestId, {
    externalUser: buildExternalUser(user),
  });
  return response.data;
}

export const getSamsarStepStatus = getSamsarStepStatusDetailed;

export async function processNextSamsarStep(
  request: Request,
  requestId: string,
): Promise<V2StepVideoStatusResponse> {
  const user = await requireSessionUser(request);
  const keys = await getRuntimeKeys();
  if (!keys.samsarApiKey) {
    throw apiError("Samsar API key is not configured.", 412);
  }
  const client = getClient(keys.samsarApiKey);
  const response = await client.processNextV2StepVideo(requestId, {
    externalUser: buildExternalUser(user),
  });
  return response.data;
}

export type { StartPayload };
