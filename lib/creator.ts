export type CreatorTab = "simple" | "json";

export const DEFAULT_IMAGE_MODEL = "NANOBANANA2";
export const DEFAULT_VIDEO_MODEL = "RUNWAYML";
export const DEFAULT_ASPECT_RATIO = "16:9";
export const DEFAULT_DURATION = 10;
export const DEFAULT_IMAGE_LIST_PROMPT =
  "Create a cohesive video from these images with smooth movement, editorial pacing, and consistent visual tone.";
export const DEFAULT_IMAGE_LIST_SAMPLE_JSON = `{
  "prompt": "A premium product reel with polished motion and cinematic transitions",
  "image_urls": [
    "https://example.com/scene-01.jpg",
    "https://example.com/scene-02.jpg",
    "https://example.com/scene-03.jpg"
  ],
  "aspect_ratio": "16:9",
  "duration": 12,
  "enable_subtitles": true,
  "image_model": "NANOBANANA2",
  "video_model": "RUNWAYML",
  "outro_image_url": "https://example.com/outro.png",
  "cta_url": "https://example.com/landing",
  "add_footer_animation": true,
  "footer_metadata": [
    { "url": "https://example.com/landing", "title": "Open landing page" }
  ],
  "add_narrator_avatar": true,
  "avatar_model": "STUDIO_AVATAR"
}`;

export interface LooseObjectParseResult {
  value: Record<string, unknown> | null;
  error: string | null;
}

function stripCodeFence(source: string) {
  const trimmed = source.trim();
  const fenced = trimmed.match(/^```(?:json|jsonc|javascript|js)?\s*([\s\S]*?)```$/i);
  if (fenced) {
    return fenced[1].trim();
  }
  return trimmed;
}

function clonePlainObject(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function escapeJsonControlCharactersInStrings(source: string) {
  let result = "";
  let inString = false;
  let escaped = false;

  for (const character of source) {
    if (!inString) {
      if (character === "\"") {
        inString = true;
      }
      result += character;
      continue;
    }

    if (escaped) {
      escaped = false;
      result += character;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      result += character;
      continue;
    }

    if (character === "\"") {
      inString = false;
      result += character;
      continue;
    }

    if (character === "\n") {
      result += "\\n";
      continue;
    }

    if (character === "\r") {
      result += "\\r";
      continue;
    }

    if (character === "\t") {
      result += "\\t";
      continue;
    }

    result += character;
  }

  return result;
}

function parseJsonObject(source: string) {
  const parsed = JSON.parse(source);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { value: null, error: "The payload must be a top-level object." };
  }
  return { value: clonePlainObject(parsed), error: null };
}

export function parseLooseObject(source: string): LooseObjectParseResult {
  const cleaned = stripCodeFence(source);
  if (!cleaned) {
    return { value: null, error: "Enter JSON or an object literal." };
  }

  try {
    return parseJsonObject(cleaned);
  } catch {
    const escapedCleaned = escapeJsonControlCharactersInStrings(cleaned);

    try {
      return parseJsonObject(escapedCleaned);
    } catch {
      try {
        const evaluated = new Function(`"use strict"; return (${escapedCleaned});`)();
        if (!evaluated || typeof evaluated !== "object" || Array.isArray(evaluated)) {
          return { value: null, error: "The payload must be a top-level object." };
        }
        return { value: clonePlainObject(evaluated), error: null };
      } catch (error) {
        return {
          value: null,
          error: error instanceof Error ? error.message : "Unable to parse JSON.",
        };
      }
    }
  }
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

function toBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "0", "off"].includes(normalized)) {
      return false;
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value !== 0;
  }
  return undefined;
}

function toNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function readBooleanAlias(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const parsed = toBoolean(raw[key]);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

function normalizeImageListItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: Array<string | Record<string, unknown>> = [];

  for (const item of value) {
    if (typeof item === "string") {
      const url = item.trim();
      if (url) {
        items.push(url);
      }
      continue;
    }

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const raw = item as Record<string, unknown>;
    const url = firstString(
      raw.image_url,
      raw.imageUrl,
      raw.url,
      raw.src,
      raw.enhanced_url,
      raw.enhancedUrl,
      raw.source,
    );

    if (!url) {
      continue;
    }

    items.push({
      ...raw,
      image_url: url,
    });
  }

  return items;
}

function normalizeFooterMetadata(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items: Record<string, unknown>[] = [];

  for (const item of value) {
    if (typeof item === "string") {
      const url = item.trim();
      if (url) {
        items.push({ url });
      }
      continue;
    }

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const raw = item as Record<string, unknown>;
    const url = firstString(raw.url, raw.cta_url, raw.ctaUrl);
    const title = firstString(raw.title, raw.text, raw.cta_text, raw.ctaText);
    const ctaUrl = firstString(raw.cta_url, raw.ctaUrl);
    const ctaText = firstString(raw.cta_text, raw.ctaText);
    const ctaLogo = firstString(raw.cta_logo, raw.ctaLogo, raw.logoUrl, raw.logoImagePath, raw.footerLogoImagePath);

    if (!url && !ctaUrl && !title && !ctaText && !ctaLogo) {
      continue;
    }

    items.push({
      ...raw,
      ...(url ? { url } : {}),
      ...(title ? { title } : {}),
      ...(ctaUrl ? { cta_url: ctaUrl } : {}),
      ...(ctaText ? { cta_text: ctaText } : {}),
      ...(ctaLogo ? { cta_logo: ctaLogo } : {}),
    });
  }

  return items.length > 0 ? items : undefined;
}

export function normalizeImageListCreatorPayload(raw: Record<string, unknown>) {
  const prompt = firstString(raw.prompt, raw.original_prompt, raw.originalPrompt);
  if (!prompt) {
    throw new Error("Prompt is required.");
  }

  const imageUrls = normalizeImageListItems(
    raw.image_urls ?? raw.imageUrls ?? raw.image_list ?? raw.imageList ?? raw.images,
  );
  if (imageUrls.length === 0) {
    throw new Error("At least one image URL is required.");
  }

  const aspectRatio = firstString(raw.aspect_ratio, raw.aspectRatio) || DEFAULT_ASPECT_RATIO;
  const duration = Math.max(5, Math.min(240, Math.round(toNumber(raw.duration, DEFAULT_DURATION))));
  const imageModel = firstString(raw.image_model, raw.imageModel) || DEFAULT_IMAGE_MODEL;
  const videoModel = firstString(raw.video_model, raw.videoModel) || DEFAULT_VIDEO_MODEL;
  const customImageToVideoModel = firstString(
    raw.custom_image_to_video_model,
    raw.customImageToVideoModel,
  );
  const avatarModel = firstString(raw.avatar_model, raw.avatarModel);
  const outroImageUrl = firstString(raw.outro_image_url, raw.outroImageUrl);
  const ctaUrl = firstString(raw.cta_url, raw.ctaUrl, raw.outro_url, raw.outroUrl);
  const footerUrl = firstString(raw.footer_url, raw.footerUrl);
  const footerTitle = firstString(raw.footer_title, raw.footerTitle);
  const ctaTextTop = firstString(raw.cta_text_top, raw.ctaTextTop);
  const ctaTextBottom = firstString(raw.cta_text_bottom, raw.ctaTextBottom);
  const ctaLogo = firstString(raw.cta_logo, raw.ctaLogo, raw.footer_logo, raw.footerLogo);
  const addOutroAnimation = readBooleanAlias(raw, ["add_outro_animation", "addOutroAnimation"]);
  const addOutroFocusArea = readBooleanAlias(raw, ["add_outro_focus_area", "addOutroFocusArea"]);
  const generateOutroImage = readBooleanAlias(raw, ["generate_outro_image", "generateOutroImage"]);
  const addFooterAnimation = readBooleanAlias(
    raw,
    ["add_footer_animation", "addFooterAnimation", "enable_footer", "enableFooter"],
  );
  const addNarratorAvatar = readBooleanAlias(
    raw,
    ["add_narrator_avatar", "addNarratorAvatar", "enable_avatar", "enableAvatar"],
  );
  const limitSingleNarrator = readBooleanAlias(raw, ["limit_single_narrator", "limitSingleNarrator"]);
  const autoRenderFullVideo = readBooleanAlias(raw, ["auto_render_full_video", "autoRenderFullVideo"]);
  const enableSubtitles = readBooleanAlias(
    raw,
    ["enable_subtitles", "enableSubtitles", "add_subtitles", "addSubtitles"],
  );
  const footerMetadata =
    normalizeFooterMetadata(
      raw.footer_metadata ??
      raw.footerMetadata ??
      raw.footer_items ??
      raw.footerItems ??
      (footerUrl
        ? [
            {
              url: footerUrl,
              title: footerTitle || ctaTextTop || ctaTextBottom || "Footer link",
              cta_url: footerUrl,
              ...(ctaTextTop ? { cta_text: ctaTextTop } : {}),
              ...(ctaTextBottom ? { text: ctaTextBottom } : {}),
              ...(ctaLogo ? { cta_logo: ctaLogo } : {}),
            },
          ]
        : undefined),
    );

  const payload: Record<string, unknown> = {
    ...raw,
    prompt,
    image_urls: imageUrls,
    aspect_ratio: aspectRatio,
    duration,
    image_model: imageModel,
    video_model: videoModel,
  };

  if (customImageToVideoModel) {
    payload.custom_image_to_video_model = customImageToVideoModel;
  }
  if (avatarModel) {
    payload.avatar_model = avatarModel;
  }
  if (outroImageUrl) {
    payload.outro_image_url = outroImageUrl;
  }
  if (ctaUrl && !raw.footer_metadata && !raw.footerMetadata) {
    payload.cta_url = ctaUrl;
  }
  if (footerUrl) {
    payload.footer_url = footerUrl;
  }
  if (footerTitle) {
    payload.footer_title = footerTitle;
  }
  if (ctaTextTop) {
    payload.cta_text_top = ctaTextTop;
  }
  if (ctaTextBottom) {
    payload.cta_text_bottom = ctaTextBottom;
  }
  if (ctaLogo) {
    payload.cta_logo = ctaLogo;
  }
  if (addOutroAnimation !== undefined) {
    payload.add_outro_animation = addOutroAnimation;
  }
  if (addOutroFocusArea !== undefined) {
    payload.add_outro_focus_area = addOutroFocusArea;
  }
  if (generateOutroImage !== undefined) {
    payload.generate_outro_image = generateOutroImage;
  }
  if (addFooterAnimation !== undefined) {
    payload.add_footer_animation = addFooterAnimation;
  }
  if (addNarratorAvatar !== undefined) {
    payload.add_narrator_avatar = addNarratorAvatar;
  }
  if (limitSingleNarrator !== undefined) {
    payload.limit_single_narrator = limitSingleNarrator;
  }
  if (autoRenderFullVideo !== undefined) {
    payload.auto_render_full_video = autoRenderFullVideo;
  }
  if (enableSubtitles !== undefined) {
    payload.enable_subtitles = enableSubtitles;
  }
  if (footerMetadata) {
    payload.footer_metadata = footerMetadata;
  }

  delete payload.imageUrls;
  delete payload.imageList;
  delete payload.images;
  delete payload.aspectRatio;
  delete payload.enableSubtitles;
  delete payload.imageModel;
  delete payload.videoModel;
  delete payload.customImageToVideoModel;
  delete payload.avatarModel;
  delete payload.outroImageUrl;
  delete payload.outroUrl;
  delete payload.outro_url;
  delete payload.ctaUrl;
  delete payload.footerUrl;
  delete payload.footer_url;
  delete payload.footerTitle;
  delete payload.footer_title;
  delete payload.ctaTextTop;
  delete payload.ctaTextBottom;
  delete payload.ctaLogo;
  delete payload.footerMetadata;
  delete payload.footerItems;
  delete payload.footer_items;
  delete payload.addOutroAnimation;
  delete payload.addOutroFocusArea;
  delete payload.generateOutroImage;
  delete payload.addFooterAnimation;
  delete payload.addNarratorAvatar;
  delete payload.limitSingleNarrator;
  delete payload.autoRenderFullVideo;

  return payload;
}

export function imageListPayloadToJson(payload: Record<string, unknown>) {
  return JSON.stringify(payload, null, 2);
}
