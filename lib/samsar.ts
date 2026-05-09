import SamsarClient, {
  type CreateVideoFromImageListInput,
  type CreateVideoFromTextInput,
  type CreateV2StepImageToVideoInput,
  type V2StepVideoDetailedStatusResponse,
  type V2StepVideoStatusResponse,
} from "samsar-js";

import { requireSessionUser } from "@/lib/auth";
import type { FlashReelsMode } from "@/lib/db";
import { apiError, getRequestOrigin, normalizeString, trimTrailingSlash } from "@/lib/http";
import { getRuntimeKeys, getSamsarSdkBaseUrl, requireRuntimeKeys } from "@/lib/secure-config";

interface StartPayload {
  mode?: FlashReelsMode;
  prompt?: string;
  imageUrls?: string[];
  image_urls?: string[];
  aspectRatio?: "16:9" | "9:16" | "1:1";
  aspect_ratio?: "16:9" | "9:16" | "1:1";
  duration?: number;
  enableSubtitles?: boolean;
  metadata?: Record<string, unknown>;
}

function getClient(apiKey: string) {
  return new SamsarClient({
    apiKey,
    baseUrl: getSamsarSdkBaseUrl(),
    timeoutMs: 60000,
  });
}

function normalizeMode(value: unknown): FlashReelsMode {
  return value === "image_list_to_video" ? "image_list_to_video" : "text_to_video";
}

function normalizeAspect(value: unknown) {
  const aspect = normalizeString(value);
  if (aspect === "9:16" || aspect === "1:1") {
    return aspect;
  }
  return "16:9";
}

function normalizeDuration(value: unknown) {
  const duration = Number(value);
  if (!Number.isFinite(duration)) {
    return 10;
  }
  return Math.min(240, Math.max(5, Math.round(duration)));
}

function normalizeImageUrls(payload: StartPayload) {
  const raw = Array.isArray(payload.imageUrls)
    ? payload.imageUrls
    : Array.isArray(payload.image_urls)
      ? payload.image_urls
      : [];
  return raw.map((url) => normalizeString(url)).filter(Boolean);
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

function buildCustomAdapters(request: Request) {
  const baseUrl = trimTrailingSlash(getRequestOrigin(request));
  return {
    base_url: baseUrl,
    text_to_image: "/api/runway/text-to-image",
    image_to_video: "/api/runway/image-to-video",
  };
}

function buildCommonInput(request: Request, payload: StartPayload) {
  const prompt = normalizeString(payload.prompt);
  if (!prompt) {
    throw apiError("Prompt is required.");
  }

  return {
    prompt,
    duration: normalizeDuration(payload.duration),
    aspect_ratio: normalizeAspect(payload.aspectRatio || payload.aspect_ratio),
    enable_subtitles: payload.enableSubtitles !== false,
    image_model: "NANOBANANA2",
    video_model: "RUNWAYML",
    custom_adapters: buildCustomAdapters(request),
  };
}

export async function startSamsarStepVideo(request: Request, payload: StartPayload) {
  const user = await requireSessionUser(request);
  const keys = await requireRuntimeKeys();
  const client = getClient(keys.samsarApiKey);
  const mode = normalizeMode(payload.mode);
  const commonInput = buildCommonInput(request, payload);

  if (mode === "image_list_to_video") {
    const imageUrls = normalizeImageUrls(payload);
    if (imageUrls.length === 0) {
      throw apiError("At least one image URL is required.");
    }

    const input: CreateV2StepImageToVideoInput = {
      ...commonInput,
      image_urls: imageUrls,
      metadata: payload.metadata || {},
    };
    const response = await client.createV2StepImageToVideo(input, {
      externalUser: buildExternalUser(user),
    });
    return response.data;
  }

  const input: CreateVideoFromTextInput = commonInput as CreateVideoFromTextInput;
  const response = await client.createV2StepTextToVideo(input, {
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
