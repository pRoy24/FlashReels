import { apiError, getRequestOrigin, normalizeString, trimTrailingSlash } from "@/lib/http";
import {
  getRunwayBaseUrl,
  getRunwayVersion,
  requireRuntimeKeys,
} from "@/lib/secure-config";

type InputPayload = Record<string, unknown>;

interface RunwayTask {
  id?: string;
  status?: string;
  output?: unknown;
  failure?: string;
  failureCode?: string;
  createdAt?: string;
  [key: string]: unknown;
}

function removeEmptyValues(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function parseDuration(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(10, Math.max(5, Math.round(value)));
  }

  const raw = normalizeString(value);
  if (!raw) {
    return 5;
  }

  const numeric = Number(raw.replace(/s$/i, ""));
  if (!Number.isFinite(numeric)) {
    return 5;
  }
  return Math.min(10, Math.max(5, Math.round(numeric)));
}

function normalizeAspectRatio(value: unknown) {
  const ratio = normalizeString(value);
  if (ratio === "9:16" || ratio === "720:1280" || ratio === "1080:1920") {
    return "9:16";
  }
  if (ratio === "1:1" || ratio === "960:960" || ratio === "1024:1024") {
    return "1:1";
  }
  return "16:9";
}

function videoRatio(value: unknown) {
  const ratio = normalizeAspectRatio(value);
  if (ratio === "9:16") {
    return "720:1280";
  }
  if (ratio === "1:1") {
    return "960:960";
  }
  return "1280:720";
}

function imageRatio(value: unknown) {
  const ratio = normalizeAspectRatio(value);
  if (ratio === "9:16") {
    return "1080:1920";
  }
  if (ratio === "1:1") {
    return "1024:1024";
  }
  return "1920:1080";
}

function normalizePrompt(input: InputPayload) {
  return (
    normalizeString(input.promptText) ||
    normalizeString(input.prompt_text) ||
    normalizeString(input.prompt)
  );
}

function normalizeImageUrl(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeString(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function normalizeReferenceImages(input: InputPayload) {
  const references = input.referenceImages || input.reference_images;
  if (Array.isArray(references)) {
    return references
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item))
      .map((item) => removeEmptyValues({
        uri: normalizeImageUrl(item.uri, item.url, item.image_url, item.imageUrl),
        tag: normalizeString(item.tag),
      }))
      .filter((item) => item.uri);
  }

  const imageUrls = Array.isArray(input.image_urls)
    ? input.image_urls
    : Array.isArray(input.imageUrls)
      ? input.imageUrls
      : [];

  return imageUrls
    .map((url, index) => removeEmptyValues({
      uri: normalizeImageUrl(url),
      tag: index === 0 ? "reference" : undefined,
    }))
    .filter((item) => item.uri);
}

function buildPromptImage(input: InputPayload) {
  const startImage = normalizeImageUrl(
    input.image_url,
    input.imageUrl,
    input.startImage,
    input.start_image,
    input.promptImage,
    input.prompt_image,
  );
  const endImage = normalizeImageUrl(input.end_image_url, input.endImageUrl, input.endImage, input.end_image);

  if (startImage && endImage) {
    return [
      { uri: startImage, position: "first" },
      { uri: endImage, position: "last" },
    ];
  }
  return startImage || undefined;
}

async function runwayFetch(pathname: string, init: RequestInit = {}) {
  const keys = await requireRuntimeKeys();
  const response = await fetch(`${getRunwayBaseUrl()}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${keys.runwayApiKey}`,
      "X-Runway-Version": getRunwayVersion(),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message =
      typeof data?.message === "string"
        ? data.message
        : typeof data?.error === "string"
          ? data.error
          : `Runway request failed with ${response.status}`;
    const error = new Error(message);
    (error as Error & { status: number; data: unknown }).status = response.status;
    (error as Error & { status: number; data: unknown }).data = data;
    throw error;
  }
  return data as RunwayTask;
}

export function normalizeRunwayStatus(status: unknown) {
  const raw = normalizeString(status).toUpperCase();
  if (raw === "SUCCEEDED" || raw === "COMPLETED" || raw === "SUCCESS" || raw === "DONE") {
    return "COMPLETED";
  }
  if (raw === "FAILED" || raw === "ERROR") {
    return "FAILED";
  }
  if (raw === "CANCELED" || raw === "CANCELLED") {
    return "CANCELED";
  }
  return raw || "PENDING";
}

export function getTaskOutputUrls(task: RunwayTask) {
  const output = task.output;
  if (Array.isArray(output)) {
    return output.map((item) => normalizeString(item)).filter(Boolean);
  }
  const direct = normalizeString(output);
  return direct ? [direct] : [];
}

function buildQueueUrls(request: Request, endpointPath: string, requestId: string) {
  const baseUrl = trimTrailingSlash(getRequestOrigin(request));
  const normalizedEndpoint = endpointPath.replace(/^\/+|\/+$/g, "");
  const encodedRequestId = encodeURIComponent(requestId);
  const requestBase = `${baseUrl}/${normalizedEndpoint}/requests/${encodedRequestId}`;
  return {
    status_url: `${requestBase}/status`,
    response_url: requestBase,
    cancel_url: `${requestBase}/cancel`,
  };
}

export async function submitRunwayTextToImage({
  request,
  endpointPath,
  input,
}: {
  request: Request;
  endpointPath: string;
  input: InputPayload;
}) {
  const promptText = normalizePrompt(input);
  if (!promptText) {
    throw apiError("input.prompt is required.");
  }

  const referenceImages = normalizeReferenceImages(input);
  const body = removeEmptyValues({
    model: normalizeString(input.model) || process.env.RUNWAY_IMAGE_MODEL || "gen4_image",
    promptText,
    ratio: imageRatio(input.ratio || input.aspect_ratio || input.aspectRatio),
    referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
  });

  const task = await runwayFetch("/v1/text_to_image", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const requestId = normalizeString(task.id);
  if (!requestId) {
    throw apiError("Runway text-to-image returned no task id.", 502);
  }

  return {
    ...task,
    request_id: requestId,
    id: requestId,
    provider: "runway",
    status: normalizeRunwayStatus(task.status),
    ...buildQueueUrls(request, endpointPath, requestId),
  };
}

export async function submitRunwayImageToVideo({
  request,
  endpointPath,
  input,
}: {
  request: Request;
  endpointPath: string;
  input: InputPayload;
}) {
  const promptText = normalizePrompt(input);
  if (!promptText) {
    throw apiError("input.prompt is required.");
  }

  const body = removeEmptyValues({
    model: normalizeString(input.model) || process.env.RUNWAY_VIDEO_MODEL || "gen4.5",
    promptText,
    duration: parseDuration(input.duration),
    ratio: videoRatio(input.ratio || input.aspect_ratio || input.aspectRatio),
    promptImage: buildPromptImage(input),
  });

  const task = await runwayFetch("/v1/image_to_video", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const requestId = normalizeString(task.id);
  if (!requestId) {
    throw apiError("Runway image-to-video returned no task id.", 502);
  }

  return {
    ...task,
    request_id: requestId,
    id: requestId,
    provider: "runway",
    status: normalizeRunwayStatus(task.status),
    ...buildQueueUrls(request, endpointPath, requestId),
  };
}

export async function getRunwayTask(requestId: string) {
  const normalizedRequestId = normalizeString(requestId);
  if (!normalizedRequestId) {
    throw apiError("requestId is required.");
  }
  const task = await runwayFetch(`/v1/tasks/${encodeURIComponent(normalizedRequestId)}`, {
    method: "GET",
  });
  return {
    ...task,
    request_id: normalizedRequestId,
    id: task.id || normalizedRequestId,
    provider: "runway",
    status: normalizeRunwayStatus(task.status),
  };
}

export function buildRunwayResult(task: RunwayTask, kind: "image" | "video") {
  const urls = getTaskOutputUrls(task);
  const firstUrl = urls[0] || "";
  return {
    ...task,
    request_id: task.id,
    status: normalizeRunwayStatus(task.status),
    output: urls,
    url: firstUrl,
    ...(kind === "image"
      ? {
          image_url: firstUrl,
          images: urls.map((url) => ({ url })),
        }
      : {
          video_url: firstUrl,
          video: firstUrl ? { url: firstUrl } : undefined,
          videos: urls.map((url) => ({ url })),
        }),
  };
}
