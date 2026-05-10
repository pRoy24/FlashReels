import { NextResponse } from "next/server";

import { apiError, jsonError, normalizeString, readJson } from "@/lib/http";
import {
  cloneSamsarVideo,
  regenerateSamsarVideoAvatar,
  translateSamsarVideo,
  updateSamsarVideoFooter,
} from "@/lib/samsar";

function getSourceSessionId(payload: Record<string, unknown>) {
  return normalizeString(
    payload.sourceSessionId ||
    payload.source_session_id ||
    payload.videoSessionId ||
    payload.video_session_id ||
    payload.request_id ||
    payload.requestId,
  );
}

export async function POST(request: Request) {
  try {
    const payload = await readJson<Record<string, unknown>>(request);
    const operation = normalizeString(payload.operation).toLowerCase();
    const sourceSessionId = getSourceSessionId(payload);
    if (!sourceSessionId) {
      throw apiError("sourceSessionId is required.");
    }

    if (operation === "regenerate_avatar") {
      const response = await regenerateSamsarVideoAvatar(request, {
        videoSessionId: sourceSessionId,
      });
      return NextResponse.json({
        ...response,
        operation,
        sourceSessionId,
      });
    }

    if (operation === "clone") {
      const response = await cloneSamsarVideo(request, {
        videoSessionId: sourceSessionId,
      });
      return NextResponse.json({
        ...response,
        operation,
        sourceSessionId,
      });
    }

    if (operation === "translate" || operation === "retranslate") {
      const language = normalizeString(payload.language || payload.language_code || payload.languageCode);
      if (!language) {
        throw apiError("language is required.");
      }
      const response = await translateSamsarVideo(request, {
        videoSessionId: sourceSessionId,
        language,
        language_code: language,
        enable_subtitles: payload.enableSubtitles !== false && payload.enable_subtitles !== false,
        translate_outro: payload.translateOutro !== false && payload.translate_outro !== false,
        translate_footer: payload.translateFooter !== false && payload.translate_footer !== false,
      });
      return NextResponse.json({
        ...response,
        operation: "retranslate",
        sourceSessionId,
        language,
      });
    }

    if (operation === "update_footer" || operation === "regenerate_footer") {
      const removeFooter = payload.removeFooter === true || payload.remove_footer === true;
      const ctaText = normalizeString(payload.ctaText || payload.cta_text);
      const ctaLogo = normalizeString(payload.ctaLogo || payload.cta_logo);
      const ctaUrl = normalizeString(payload.ctaUrl || payload.cta_url);
      const input = removeFooter
        ? { videoSessionId: sourceSessionId, remove_footer: true }
        : {
            videoSessionId: sourceSessionId,
            cta_text: ctaText,
            cta_logo: ctaLogo,
            cta_url: ctaUrl,
          };
      const response = await updateSamsarVideoFooter(request, input);
      return NextResponse.json({
        ...response,
        operation: "update_footer",
        sourceSessionId,
      });
    }

    throw apiError("Unsupported video edit operation.");
  } catch (error) {
    return jsonError(error);
  }
}
