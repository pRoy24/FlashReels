import SamsarClient, {
  type JoinVideosInput,
  type JoinVideosResponse,
  type CloneVideoInput,
  type CloneVideoResponse,
  type TranslateVideoInput,
  type TranslateVideoResponse,
  type UpdateVideoFooterImageInput,
  type UpdateVideoFooterImageResponse,
  type CreateV2StepImageToVideoInput,
  type GlobalStatusDetailedResponse,
  type V2StepVideoDetailedStatusResponse,
  type V2StepVideoStatusResponse,
} from "samsar-js";

import { requireSessionUser } from "@/lib/auth";
import { normalizeImageListCreatorPayload } from "@/lib/creator";
import { apiError } from "@/lib/http";
import {
  getAdapterBaseUrl,
  getRuntimeKeys,
  getSamsarSdkBaseUrl,
  requireRuntimeKeys,
  shouldUseCustomAdapters,
} from "@/lib/secure-config";

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

const DEFAULT_MANUAL_STEP_STAGES = ["ai_video_generation"];

function shouldAutoRenderFullVideo(payload: Record<string, unknown>) {
  const value = payload.auto_render_full_video ?? payload.autoRenderFullVideo;
  return value !== false;
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
    manual_step_stages:
      normalizedPayload.manual_step_stages ||
      normalizedPayload.manualStepStages ||
      (shouldAutoRenderFullVideo(normalizedPayload) ? [] : DEFAULT_MANUAL_STEP_STAGES),
    ...(shouldUseCustomAdapters() && keys.runwayApiKey && keys.serverSecret
      ? { custom_adapters: buildCustomAdapters(request, keys.serverSecret) }
      : {}),
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

export async function getSamsarVideoStatusDetailed(
  request: Request,
  requestId: string,
): Promise<GlobalStatusDetailedResponse> {
  const user = await requireSessionUser(request);
  const keys = await getRuntimeKeys();
  if (!keys.samsarApiKey) {
    throw apiError("Samsar API key is not configured.", 412);
  }
  const client = getClient(keys.samsarApiKey);
  const response = await client.getV2StatusDetailed(requestId, {
    externalUser: buildExternalUser(user),
  });
  return response.data;
}

export async function translateSamsarVideo(
  request: Request,
  input: TranslateVideoInput,
): Promise<TranslateVideoResponse> {
  const user = await requireSessionUser(request);
  const keys = await requireRuntimeKeys();
  const client = getClient(keys.samsarApiKey);
  const response = await client.translateV2Video(input, {
    externalUser: buildExternalUser(user),
  });
  return response.data as TranslateVideoResponse;
}

export async function cloneSamsarVideo(
  request: Request,
  input: CloneVideoInput,
): Promise<CloneVideoResponse> {
  const user = await requireSessionUser(request);
  const keys = await requireRuntimeKeys();
  const client = getClient(keys.samsarApiKey);
  const response = await client.cloneV2Video(input, {
    externalUser: buildExternalUser(user),
  });
  return response.data;
}

export async function regenerateSamsarVideoAvatar(
  request: Request,
  input: CloneVideoInput,
): Promise<CloneVideoResponse> {
  const user = await requireSessionUser(request);
  const keys = await requireRuntimeKeys();
  const client = getClient(keys.samsarApiKey);
  const response = await client.postV2<CloneVideoResponse>("video/regenerate_avatar", {
    input,
  }, {
    externalUser: buildExternalUser(user),
  });
  return response.data;
}

export async function updateSamsarVideoFooter(
  request: Request,
  input: UpdateVideoFooterImageInput,
): Promise<UpdateVideoFooterImageResponse> {
  const user = await requireSessionUser(request);
  const keys = await requireRuntimeKeys();
  const client = getClient(keys.samsarApiKey);
  const response = await client.updateV2VideoFooterImage(input, {
    externalUser: buildExternalUser(user),
  });
  return response.data as UpdateVideoFooterImageResponse;
}

export async function joinSamsarVideos(
  request: Request,
  input: JoinVideosInput,
): Promise<JoinVideosResponse> {
  const user = await requireSessionUser(request);
  const keys = await requireRuntimeKeys();
  const client = getClient(keys.samsarApiKey);
  let response;
  try {
    response = await client.postV2<JoinVideosResponse>("join_videos", {
      input,
    }, {
      externalUser: buildExternalUser(user),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("One or more source videos were not found for this external user")) {
      throw error;
    }
    response = await client.joinVideos(input);
  }
  return response.data;
}

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
