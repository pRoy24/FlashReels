"use client";

import { useMemo, useRef, useState, type ChangeEvent, type ReactNode, type UIEvent } from "react";
import {
  AlertCircle,
  Code2,
  Play,
  Settings2,
  Sparkles,
  SlidersHorizontal,
  Upload,
  Wand2,
  X,
} from "lucide-react";

import {
  DEFAULT_ASPECT_RATIO,
  DEFAULT_DURATION,
  DEFAULT_IMAGE_LIST_PROMPT,
  DEFAULT_IMAGE_LIST_SAMPLE_JSON,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  imageListPayloadToJson,
  normalizeImageListCreatorPayload,
  parseLooseObject,
  type CreatorTab,
} from "@/lib/creator";

type SubmitHandler = (payload: Record<string, unknown>) => void | Promise<void>;

interface CreatorWizardProps {
  busy: boolean;
  onSubmit: SubmitHandler;
}

function parseDelimitedUrls(value: string) {
  return value
    .split(/\r?\n/)
    .flatMap((line) => (line.trim().startsWith("data:") ? [line] : line.split(",")))
    .map((item) => item.trim())
    .filter(Boolean);
}

function textAreaRows(text: string, minimum = 7) {
  return Math.max(minimum, text.split(/\r?\n/).length);
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span>{children}</span>;
}

const JSON_HIGHLIGHT_TOKEN = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}\[\],:]/g;

function renderJsonHighlight(value: string) {
  JSON_HIGHLIGHT_TOKEN.lastIndex = 0;

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of value.matchAll(JSON_HIGHLIGHT_TOKEN)) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      nodes.push(value.slice(lastIndex, index));
    }

    let className = "jsonPunctuation";
    if (token.startsWith("\"")) {
      className = /^\s*:/.test(value.slice(index + token.length)) ? "jsonKey" : "jsonString";
    } else if (/^-?\d/.test(token)) {
      className = "jsonNumber";
    } else if (token === "true" || token === "false") {
      className = "jsonBoolean";
    } else if (token === "null") {
      className = "jsonNull";
    }

    nodes.push(
      <span className={className} key={`${index}-${key}`}>
        {token}
      </span>,
    );

    key += 1;
    lastIndex = index + token.length;
  }

  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }

  return nodes;
}

export function CreatorWizard({ busy, onSubmit }: CreatorWizardProps) {
  const [tab, setTab] = useState<CreatorTab>("simple");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [prompt, setPrompt] = useState(DEFAULT_IMAGE_LIST_PROMPT);
  const [imageUrls, setImageUrls] = useState("");
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">(DEFAULT_ASPECT_RATIO);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [enableSubtitles, setEnableSubtitles] = useState(true);
  const [imageModel, setImageModel] = useState(DEFAULT_IMAGE_MODEL);
  const [videoModel, setVideoModel] = useState(DEFAULT_VIDEO_MODEL);
  const [videoModelSubType, setVideoModelSubType] = useState("");
  const [customImageToVideoModel, setCustomImageToVideoModel] = useState("");
  const [outroUrl, setOutroUrl] = useState("");
  const [outroImageUrl, setOutroImageUrl] = useState("");
  const [footerUrl, setFooterUrl] = useState("");
  const [footerTitle, setFooterTitle] = useState("");
  const [enableFooter, setEnableFooter] = useState(false);
  const [enableAvatar, setEnableAvatar] = useState(true);
  const [avatarModel, setAvatarModel] = useState("");
  const [limitSingleNarrator, setLimitSingleNarrator] = useState(true);
  const [ctaTextTop, setCtaTextTop] = useState("");
  const [ctaTextBottom, setCtaTextBottom] = useState("");
  const [ctaLogo, setCtaLogo] = useState("");
  const [metadataJson, setMetadataJson] = useState('{\n  "project": "launch"\n}');
  const [jsonText, setJsonText] = useState(DEFAULT_IMAGE_LIST_SAMPLE_JSON);
  const jsonHighlightRef = useRef<HTMLPreElement | null>(null);

  const simplePayload = useMemo(() => {
    const footerEnabled = enableFooter || Boolean(footerUrl);
    const metadata = parseLooseObject(metadataJson);
    if (metadata.error) {
      return { payload: null, error: `Metadata: ${metadata.error}` };
    }

    try {
      const payload = normalizeImageListCreatorPayload({
        prompt,
        image_urls: [...parseDelimitedUrls(imageUrls), ...uploadedImageUrls],
        aspect_ratio: aspectRatio,
        duration,
        enable_subtitles: enableSubtitles,
        image_model: imageModel,
        video_model: videoModel,
        video_model_sub_type: videoModelSubType || undefined,
        custom_image_to_video_model: customImageToVideoModel || undefined,
        outro_url: outroUrl || undefined,
        outro_image_url: outroImageUrl || undefined,
        footer_url: footerUrl || undefined,
        footer_title: footerTitle || undefined,
        add_footer_animation: footerEnabled,
        add_narrator_avatar: enableAvatar,
        avatar_model: avatarModel || undefined,
        limit_single_narrator: enableAvatar ? true : limitSingleNarrator,
        cta_text_top: ctaTextTop || undefined,
        cta_text_bottom: ctaTextBottom || undefined,
        cta_logo: ctaLogo || undefined,
        metadata: metadata.value || undefined,
      });
      return { payload, error: null };
    } catch (error) {
      return {
        payload: null,
        error: error instanceof Error ? error.message : "Unable to validate simple creator fields.",
      };
    }
  }, [
    aspectRatio,
    avatarModel,
    ctaLogo,
    ctaTextBottom,
    ctaTextTop,
    customImageToVideoModel,
    duration,
    enableAvatar,
    enableFooter,
    enableSubtitles,
    footerUrl,
    footerTitle,
    imageModel,
    imageUrls,
    limitSingleNarrator,
    metadataJson,
    outroImageUrl,
    outroUrl,
    prompt,
    uploadedImageUrls,
    videoModel,
    videoModelSubType,
  ]);

  const jsonPayload = useMemo(() => {
    const parsed = parseLooseObject(jsonText);
    if (parsed.error) {
      return { payload: null, error: parsed.error, parsed: null };
    }

    const parsedValue = parsed.value ?? {};

    try {
      const payload = normalizeImageListCreatorPayload(parsedValue);
      return { payload, error: null, parsed: parsedValue };
    } catch (error) {
      return {
        payload: null,
        error: error instanceof Error ? error.message : "Unable to validate JSON payload.",
        parsed: parsedValue,
      };
    }
  }, [jsonText]);

  const activeResult = tab === "json" ? jsonPayload : simplePayload;
  const payload = activeResult.payload;
  const validationError = activeResult.error;
  const parsedImageCount = Array.isArray(payload?.image_urls) ? payload.image_urls.length : 0;
  const footerActive = Boolean(payload?.add_footer_animation);
  const avatarActive = Boolean(payload?.add_narrator_avatar);
  const outroMode = payload?.outro_image_url ? "Provided outro image" : payload?.cta_url ? "Generated outro URL" : "No outro";

  function submit() {
    if (!payload || validationError) {
      return;
    }
    void onSubmit(payload);
  }

  function syncJsonFromCurrentForm() {
    if (!simplePayload.payload) {
      return;
    }
    setJsonText(imageListPayloadToJson(simplePayload.payload));
    setTab("json");
  }

  function syncJsonHighlightScroll(event: UIEvent<HTMLTextAreaElement>) {
    if (!jsonHighlightRef.current) {
      return;
    }

    jsonHighlightRef.current.scrollTop = event.currentTarget.scrollTop;
    jsonHighlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
  }

  async function handleImageFiles(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) {
      return;
    }

    try {
      const dataUrls = await Promise.all(
        files.map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result ?? ""));
              reader.onerror = () => reject(reader.error ?? new Error("Unable to read uploaded image."));
              reader.readAsDataURL(file);
            }),
        ),
      );

      setUploadedImageUrls((current) => [...current, ...dataUrls.filter(Boolean)]);
    } catch (error) {
      console.error(error);
    } finally {
      input.value = "";
    }
  }

  return (
    <section className="controlPanel creatorWizard">
      <div className="wizardHeader">
        <div>
          <p className="eyebrow">Image request</p>
          <h2>Create from images and metadata</h2>
        </div>
        <div className="wizardHeaderMeta">
          <span><Sparkles size={14} /> Simple</span>
          <span><Code2 size={14} /> JSON</span>
        </div>
      </div>

      <div className="segmented compact wizardTabs" role="tablist" aria-label="Creator wizard mode">
        <button className={tab === "simple" ? "active" : ""} onClick={() => setTab("simple")} type="button">
          Simple
        </button>
        <button className={tab === "json" ? "active" : ""} onClick={() => setTab("json")} type="button">
          JSON
        </button>
      </div>

      {tab === "json" ? (
        <div className="wizardJsonLayout">
          <label className="wizardEditor">
            <FieldLabel>Raw JSON</FieldLabel>
            <div className="jsonEditorShell">
              <pre className="jsonHighlight" aria-hidden="true" ref={jsonHighlightRef}>
                {renderJsonHighlight(jsonText)}
                {jsonText.endsWith("\n") ? " " : null}
              </pre>
              <textarea
                className="jsonTextarea"
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
                onScroll={syncJsonHighlightScroll}
                rows={18}
                spellCheck={false}
                placeholder={DEFAULT_IMAGE_LIST_SAMPLE_JSON}
              />
            </div>
          </label>

          <div className="wizardSidecar">
            <div className="wizardSummary">
              <strong>{parsedImageCount > 0 ? `${parsedImageCount} image(s)` : "No valid payload yet"}</strong>
              <span>{outroMode}</span>
              <small>{footerActive ? "Footer enabled" : "Footer disabled"} · {avatarActive ? "Avatar enabled" : "Avatar disabled"}</small>
            </div>

            {validationError ? (
              <div className="errorBox">
                <AlertCircle size={15} />
                <span>{validationError}</span>
              </div>
            ) : payload ? (
              <pre className="jsonPreview">{imageListPayloadToJson(payload)}</pre>
            ) : null}

            <button className="secondaryButton" onClick={syncJsonFromCurrentForm} type="button" disabled={busy}>
              <Code2 size={16} />
              Load current form into JSON
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="simpleFormTopline">
            <div className="wizardSummary">
              <strong>{parsedImageCount > 0 ? `${parsedImageCount} source image(s)` : "No images added"}</strong>
              <span>{outroMode}</span>
              <small>{aspectRatio} render · {avatarActive ? "Avatar on" : "Avatar off"}</small>
            </div>
            <button className="secondaryButton compactAction" onClick={() => setShowAdvanced(true)} type="button">
              <Settings2 size={16} />
              Advanced
            </button>
          </div>

          <label>
            <FieldLabel>Video direction</FieldLabel>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={textAreaRows(prompt, 5)}
            />
          </label>

          <div className="wizardGroup imageSourceGroup">
            <div className="wizardGroupHeader">
              <Upload size={16} />
              <strong>Product images</strong>
              {uploadedImageUrls.length > 0 ? <span>{uploadedImageUrls.length} uploaded</span> : null}
            </div>

            <label>
              <FieldLabel>Product listing image URLs</FieldLabel>
              <textarea
                value={imageUrls}
                onChange={(event) => setImageUrls(event.target.value)}
                rows={6}
                placeholder="https://example.com/shot-01.jpg&#10;https://example.com/shot-02.jpg"
              />
            </label>

            <label className="uploadDropzone">
              <input type="file" accept="image/*" multiple onChange={handleImageFiles} />
              <Upload size={17} />
              <span>Upload product images</span>
            </label>
          </div>

          <div className="fieldGrid">
            <label>
              <FieldLabel>Render aspect ratio</FieldLabel>
              <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as "16:9" | "9:16")}>
                <option value="16:9">16:9 landscape</option>
                <option value="9:16">9:16 vertical</option>
              </select>
            </label>
            <label>
              <FieldLabel>CTA URL</FieldLabel>
              <input value={outroUrl} onChange={(event) => setOutroUrl(event.target.value)} placeholder="https://example.com/product" />
            </label>
          </div>

          <label>
            <FieldLabel>Metadata</FieldLabel>
            <textarea
              value={metadataJson}
              onChange={(event) => setMetadataJson(event.target.value)}
              rows={textAreaRows(metadataJson, 4)}
              spellCheck={false}
            />
          </label>
        </>
      )}

      {tab === "simple" && validationError ? (
        <div className="errorBox">
          <AlertCircle size={15} />
          <span>{validationError}</span>
        </div>
      ) : null}

      <button className="primaryButton" onClick={submit} disabled={busy || !payload}>
        {busy ? <Play size={17} className="spin" /> : <Play size={17} />}
        Submit render
      </button>

      {showAdvanced ? (
        <div className="modalBackdrop" role="presentation">
          <section className="advancedModal" role="dialog" aria-modal="true" aria-label="Advanced generation options">
            <div className="modalHeader">
              <div>
                <p className="eyebrow">Advanced</p>
                <h2>Generation controls</h2>
              </div>
              <button className="iconButton" onClick={() => setShowAdvanced(false)} type="button" aria-label="Close advanced options">
                <X size={17} />
              </button>
            </div>

            <div className="modalScroll">
              <div className="wizardGroup">
                <div className="wizardGroupHeader">
                  <Wand2 size={16} />
                  <strong>Footer CTA</strong>
                </div>
                <div className="fieldGrid">
                  <label>
                    <FieldLabel>Footer CTA URL</FieldLabel>
                    <input value={footerUrl} onChange={(event) => setFooterUrl(event.target.value)} placeholder="https://example.com/learn-more" />
                  </label>
                  <label>
                    <FieldLabel>Footer CTA text</FieldLabel>
                    <input value={footerTitle} onChange={(event) => setFooterTitle(event.target.value)} placeholder="Shop the collection" />
                  </label>
                </div>
                <div className="fieldGrid">
                  <label>
                    <FieldLabel>CTA text top</FieldLabel>
                    <input value={ctaTextTop} onChange={(event) => setCtaTextTop(event.target.value)} />
                  </label>
                  <label>
                    <FieldLabel>CTA text bottom</FieldLabel>
                    <input value={ctaTextBottom} onChange={(event) => setCtaTextBottom(event.target.value)} />
                  </label>
                </div>
                <label>
                  <FieldLabel>CTA logo URL</FieldLabel>
                  <input value={ctaLogo} onChange={(event) => setCtaLogo(event.target.value)} placeholder="https://cdn.example.com/logo.png" />
                </label>
                <label className="checkRow">
                  <input type="checkbox" checked={enableFooter} onChange={(event) => setEnableFooter(event.target.checked)} />
                  <span>Enable footer animation</span>
                </label>
              </div>

              <div className="wizardGroup">
                <div className="wizardGroupHeader">
                  <SlidersHorizontal size={16} />
                  <strong>Render options</strong>
                </div>
                <div className="fieldGrid">
                  <label>
                    <FieldLabel>Duration</FieldLabel>
                    <input type="number" min={5} max={240} value={duration} onChange={(event) => setDuration(Number(event.target.value))} />
                  </label>
                  <label>
                    <FieldLabel>Outro image URL</FieldLabel>
                    <input value={outroImageUrl} onChange={(event) => setOutroImageUrl(event.target.value)} placeholder="https://cdn.example.com/outro.png" />
                  </label>
                </div>
                <div className="checkGrid">
                  <label className="checkRow">
                    <input type="checkbox" checked={enableSubtitles} onChange={(event) => setEnableSubtitles(event.target.checked)} />
                    <span>Subtitles</span>
                  </label>
                  <label className="checkRow">
                    <input type="checkbox" checked={enableAvatar} onChange={(event) => setEnableAvatar(event.target.checked)} />
                    <span>Add avatar</span>
                  </label>
                </div>
              </div>

              <div className="wizardGroup">
                <div className="wizardGroupHeader">
                  <Code2 size={16} />
                  <strong>Models</strong>
                </div>
                <div className="fieldGrid">
                  <label>
                    <FieldLabel>Image model</FieldLabel>
                    <input value={imageModel} onChange={(event) => setImageModel(event.target.value)} />
                  </label>
                  <label>
                    <FieldLabel>Video model</FieldLabel>
                    <input value={videoModel} onChange={(event) => setVideoModel(event.target.value)} />
                  </label>
                </div>
                <div className="fieldGrid">
                  <label>
                    <FieldLabel>Video model subtype</FieldLabel>
                    <input value={videoModelSubType} onChange={(event) => setVideoModelSubType(event.target.value)} placeholder="Optional subtype" />
                  </label>
                  <label>
                    <FieldLabel>Custom image-to-video model</FieldLabel>
                    <input
                      value={customImageToVideoModel}
                      onChange={(event) => setCustomImageToVideoModel(event.target.value)}
                      placeholder="Optional provider-specific value"
                    />
                  </label>
                </div>
                <div className="fieldGrid">
                  <label>
                    <FieldLabel>Avatar model</FieldLabel>
                    <input value={avatarModel} onChange={(event) => setAvatarModel(event.target.value)} placeholder="Optional avatar model" />
                  </label>
                  <label>
                    <FieldLabel>Limit single narrator</FieldLabel>
                    <select value={limitSingleNarrator ? "true" : "false"} onChange={(event) => setLimitSingleNarrator(event.target.value === "true")}>
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
