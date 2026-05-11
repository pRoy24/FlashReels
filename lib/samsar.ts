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

import { requireSessionUserRecord } from "@/lib/auth";
import { buildFlashReelsExternalUser } from "@/lib/billing";
import { normalizeImageListCreatorPayload } from "@/lib/creator";
import type { FlashReelsUser } from "@/lib/db";
import { apiError } from "@/lib/http";
import {
  getAdapterBaseUrl,
  getRuntimeKeys,
  getSamsarSdkBaseUrl,
  shouldUseCustomAdapters,
} from "@/lib/secure-config";

type StartPayload = Record<string, unknown>;
type SamsarResponseRecord = Record<string, unknown>;

function getClient(apiKey: string) {
  return new SamsarClient({
    apiKey,
    baseUrl: getSamsarSdkBaseUrl(),
    timeoutMs: 60000,
  });
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

function getV2RequestOptions(user: FlashReelsUser) {
  if (user.role === "admin") {
    return {};
  }

  return {
    externalUser: buildFlashReelsExternalUser(user),
  };
}

async function getBaseVideoClient(request: Request) {
  const keys = await getRuntimeKeys(request);
  if (!keys.samsarApiKey) {
    throw apiError("Base SAMSAR_API_KEY is not configured. Admin and external-user video generation must be routed through the base Samsar API key.", 412);
  }
  return {
    client: getClient(keys.samsarApiKey),
    keys,
  };
}

const DEFAULT_MANUAL_STEP_STAGES = ["ai_video_generation"];

function shouldAutoRenderFullVideo(payload: Record<string, unknown>) {
  const value = payload.auto_render_full_video ?? payload.autoRenderFullVideo;
  return value !== false;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return "";
}

function getRecord(value: unknown): SamsarResponseRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as SamsarResponseRecord
    : {};
}

function getSamsarRequestId(data: SamsarResponseRecord) {
  return firstString(data.request_id, data.requestId, data.session_id, data.sessionId, data.sessionID);
}

function getSamsarStatus(data: SamsarResponseRecord) {
  return firstString(data.status, data.step_status, getRecord(data.step).status).toUpperCase();
}

function getSamsarResponseErrorMessage(data: unknown): string {
  if (typeof data === "string") {
    return data.trim();
  }
  const record = getRecord(data);
  const nestedError = getRecord(record.error);
  const step = getRecord(record.step);
  const session = getRecord(record.session);
  const candidates = [
    record.message,
    record.error,
    record.detail,
    record.error_message,
    record.errorMessage,
    record.failure_reason,
    record.failureReason,
    record.status_message,
    record.statusMessage,
    nestedError.message,
    nestedError.detail,
    step.message,
    step.error,
    step.error_message,
    session.message,
    session.error,
    session.error_message,
  ];
  return firstString(...candidates);
}

function getManualStepStages(payload: Record<string, unknown>) {
  const value = payload.manual_step_stages ?? payload.manualStepStages;
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : undefined;
}

function buildTraceMetadata(payload: Record<string, unknown>) {
  const metadata = getRecord(payload.metadata);
  const flashreels = getRecord(metadata.flashreels);
  const imageCount = Array.isArray(payload.image_urls) ? payload.image_urls.length : 0;
  return {
    ...metadata,
    flashreels: {
      ...flashreels,
      imageCount,
      expectedRoute: "video/step/image_to_video",
    },
  };
}

function getClientRequestId(payload: Record<string, unknown>) {
  const metadata = getRecord(payload.metadata);
  const flashreels = getRecord(metadata.flashreels);
  return firstString(flashreels.clientRequestId, payload.client_request_id, payload.clientRequestId);
}

function buildStepVideoInput(request: Request, payload: Record<string, unknown>, keys: Awaited<ReturnType<typeof getRuntimeKeys>>) {
  let normalizedPayload;
  try {
    normalizedPayload = normalizeImageListCreatorPayload(payload);
  } catch (error) {
    throw apiError(error instanceof Error ? error.message : "Invalid render request.", 400);
  }

  const manualStepStages = getManualStepStages(normalizedPayload);
  const input: CreateV2StepImageToVideoInput = {
    ...normalizedPayload,
    metadata: buildTraceMetadata(normalizedPayload),
    ...(manualStepStages?.length
      ? { manual_step_stages: manualStepStages }
      : shouldAutoRenderFullVideo(normalizedPayload)
        ? {}
        : { manual_step_stages: DEFAULT_MANUAL_STEP_STAGES }),
    ...(shouldUseCustomAdapters() && keys.runwayApiKey && keys.serverSecret
      ? { custom_adapters: buildCustomAdapters(request, keys.serverSecret) }
      : {}),
  };

  delete (input as Record<string, unknown>).auto_render_full_video;
  delete (input as Record<string, unknown>).autoRenderFullVideo;
  delete (input as Record<string, unknown>).manualStepStages;
  delete (input as Record<string, unknown>).client_request_id;
  delete (input as Record<string, unknown>).clientRequestId;
  return input;
}

function assertSamsarStartAccepted(data: unknown) {
  const record = getRecord(data);
  const errorMessage = getSamsarResponseErrorMessage(record);
  const status = getSamsarStatus(record);
  if (errorMessage || ["FAILED", "FAILURE", "ERROR", "CANCELED", "CANCELLED"].includes(status)) {
    throw apiError(errorMessage || `Samsar render request failed with status ${status}.`, 502);
  }
  const requestId = getSamsarRequestId(record);
  if (!requestId) {
    throw apiError("Samsar accepted the request but did not return a request id.", 502);
  }
  return { record, requestId, status };
}

export async function startSamsarStepVideo(request: Request, payload: StartPayload) {
  const user = await requireSessionUserRecord(request);
  const { client, keys } = await getBaseVideoClient(request);
  const input = buildStepVideoInput(request, payload as Record<string, unknown>, keys);
  console.info("[FlashReels] Starting Samsar step video", {
    userId: user.id,
    role: user.role || "user",
    route: user.role === "admin" ? "base" : "base_external_user",
    clientRequestId: getClientRequestId(input as Record<string, unknown>),
    imageCount: Array.isArray(input.image_urls) ? input.image_urls.length : 0,
    videoModel: input.video_model,
    autoRenderFullVideo: shouldAutoRenderFullVideo(payload as Record<string, unknown>),
    manualStepStages: (input as Record<string, unknown>).manual_step_stages,
    hasCustomAdapters: Boolean(input.custom_adapters),
  });
  const response = await client.createV2StepImageToVideo(input, {
    ...getV2RequestOptions(user),
  });
  const accepted = assertSamsarStartAccepted(response.data);
  console.info("[FlashReels] Samsar step video accepted", {
    requestId: accepted.requestId,
    clientRequestId: getClientRequestId(input as Record<string, unknown>),
    status: accepted.status || "UNKNOWN",
    creditsCharged: response.creditsCharged,
    creditsRemaining: response.creditsRemaining,
  });
  return {
    ...accepted.record,
    flashreelsClientRequestId: getClientRequestId(input as Record<string, unknown>),
    flashreelsRoute: "video/step/image_to_video",
  };
}

export async function getSamsarStepStatusDetailed(
  request: Request,
  requestId: string,
): Promise<V2StepVideoDetailedStatusResponse> {
  const user = await requireSessionUserRecord(request);
  const { client } = await getBaseVideoClient(request);
  const response = await client.getV2StepVideoStatusDetailed(requestId, {
    ...getV2RequestOptions(user),
  });
  return response.data;
}

export const getSamsarStepStatus = getSamsarStepStatusDetailed;

export async function getSamsarVideoStatusDetailed(
  request: Request,
  requestId: string,
): Promise<GlobalStatusDetailedResponse> {
  const user = await requireSessionUserRecord(request);
  const { client } = await getBaseVideoClient(request);
  const response = await client.getV2StatusDetailed(requestId, {
    ...getV2RequestOptions(user),
  });
  return response.data;
}

export async function translateSamsarVideo(
  request: Request,
  input: TranslateVideoInput,
): Promise<TranslateVideoResponse> {
  const user = await requireSessionUserRecord(request);
  const { client } = await getBaseVideoClient(request);
  const response = await client.translateV2Video(input, {
    ...getV2RequestOptions(user),
  });
  return response.data as TranslateVideoResponse;
}

export async function cloneSamsarVideo(
  request: Request,
  input: CloneVideoInput,
): Promise<CloneVideoResponse> {
  const user = await requireSessionUserRecord(request);
  const { client } = await getBaseVideoClient(request);
  const response = await client.cloneV2Video(input, {
    ...getV2RequestOptions(user),
  });
  return response.data;
}

export async function regenerateSamsarVideoAvatar(
  request: Request,
  input: CloneVideoInput,
): Promise<CloneVideoResponse> {
  const user = await requireSessionUserRecord(request);
  const { client } = await getBaseVideoClient(request);
  const response = await client.postV2<CloneVideoResponse>("video/regenerate_avatar", {
    input,
  }, {
    ...getV2RequestOptions(user),
  });
  return response.data;
}

export async function updateSamsarVideoFooter(
  request: Request,
  input: UpdateVideoFooterImageInput,
): Promise<UpdateVideoFooterImageResponse> {
  const user = await requireSessionUserRecord(request);
  const { client } = await getBaseVideoClient(request);
  const response = await client.updateV2VideoFooterImage(input, {
    ...getV2RequestOptions(user),
  });
  return response.data as UpdateVideoFooterImageResponse;
}

export async function joinSamsarVideos(
  request: Request,
  input: JoinVideosInput,
): Promise<JoinVideosResponse> {
  const user = await requireSessionUserRecord(request);
  const { client } = await getBaseVideoClient(request);
  let response;
  try {
    response = await client.postV2<JoinVideosResponse>("join_videos", {
      input,
    }, {
      ...getV2RequestOptions(user),
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
  const user = await requireSessionUserRecord(request);
  const { client } = await getBaseVideoClient(request);
  const response = await client.processNextV2StepVideo(requestId, {
    ...getV2RequestOptions(user),
  });
  return response.data;
}

export type { StartPayload };
