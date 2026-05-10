"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Database,
  Download,
  Film,
  Image as ImageIcon,
  KeyRound,
  Languages,
  ListVideo,
  Loader2,
  LogOut,
  Music,
  Pause,
  Play,
  RefreshCcw,
  Save,
  Share2,
  Trash2,
  Volume2,
} from "lucide-react";

import { CreatorWizard } from "@/components/CreatorWizard";

type ApiRecord = Record<string, unknown>;

interface User {
  id: string;
  email: string;
  displayName: string;
}

interface SetupStatus {
  ready: boolean;
  samsarConfigured: boolean;
  runwayConfigured: boolean;
  serverSecretConfigured: boolean;
  samsarSource: string;
  runwaySource: string;
  serverSecretSource: string;
  publicBaseUrl?: string;
  persistence?: {
    provider: string;
    persistent: boolean;
    remoteSafe?: boolean;
    reason?: string;
    redisEnv?: {
      url?: string;
      token?: string;
    };
  };
  envFile?: {
    target: string;
    writable: boolean;
    reason?: string;
  };
}

interface LibraryVideo {
  id: string;
  title: string;
  mode: string;
  prompt: string;
  sourceUrl: string;
  samsarRequestId?: string;
  samsarSessionId?: string;
  status: string;
  published?: boolean;
  publishedAt?: string;
  feedSlug?: string;
  feedTitle?: string;
  feedDescription?: string;
  feedPosterUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

const STAGE_ORDER = [
  "prompt_generation",
  "image_generation",
  "speech_generation",
  "music_generation",
  "ai_video_generation",
  "lip_sync_generation",
  "sound_effect_generation",
  "narrator_avatar_generation",
  "video_generation",
];

const STAGE_LABELS: Record<string, string> = {
  prompt_generation: "Prompt",
  image_generation: "Images",
  speech_generation: "Speech",
  music_generation: "Music",
  audio_generation: "Audio",
  ai_video_generation: "Motion",
  lip_sync_generation: "Lip sync",
  sound_effect_generation: "Sound effects",
  narrator_avatar_generation: "Avatar",
  delete_reflow: "Reflow",
  timeline_reflowed: "Timeline",
  transcript_generation: "Transcript",
  frame_generation: "Frames",
  video_generation: "Final render",
};

const SAMSAR_STATIC_ASSET_BASE_URL = (
  process.env.NEXT_PUBLIC_SAMSAR_STATIC_ASSET_BASE_URL || "https://static.samsar.one"
).replace(/\/+$/, "");

const LANGUAGE_OPTIONS = [
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "hi", label: "Hindi" },
  { code: "th", label: "Thai" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
  { code: "en", label: "English" },
];

function buildDetailedStatusUrl(requestId: string) {
  return `/api/samsar/step/status-detailed?request_id=${encodeURIComponent(requestId)}`;
}

interface StagePreviewResource {
  id: string;
  label: string;
  stage: string;
  kind: "image" | "video" | "audio";
  url: string;
  status: string;
  startTime: number;
  endTime: number;
  prompt?: string;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getRecord(value: unknown): ApiRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ApiRecord : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = getString(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function firstArrayString(value: unknown) {
  if (!Array.isArray(value)) {
    return "";
  }
  for (const item of value) {
    const normalized = getString(item);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function normalizeMediaUrl(url: string) {
  const value = getString(url);
  if (!value) {
    return "";
  }
  try {
    const parsed = new URL(value);
    if (
      /^api\.samsar\.(one|gg)$/i.test(parsed.hostname) &&
      /^\/(?:video|user_resources)\//.test(parsed.pathname)
    ) {
      return `${SAMSAR_STATIC_ASSET_BASE_URL}${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // Relative paths are normalized below.
  }
  if (/^(https?:|data:|blob:)/i.test(value)) {
    return value;
  }
  const assetPath = value
    .replace(/^\/?assets\//, "")
    .replace(/^\/?samsar_processor\/assets\//, "")
    .replace(/^\/+/, "");
  return assetPath ? `${SAMSAR_STATIC_ASSET_BASE_URL}/${assetPath}` : "";
}

function getRequestId(data: ApiRecord | null) {
  if (!data) {
    return "";
  }
  return firstString(data.request_id, data.requestId, data.session_id, data.sessionID);
}

function getStatusText(status: ApiRecord | null) {
  return firstString(status?.step_status, status?.status, getRecord(status?.step).status) || "IDLE";
}

function getFinalVideoUrl(status: ApiRecord | null) {
  if (!status) {
    return "";
  }
  const session = getRecord(status.session);
  const sessionResult = getRecord(session.result);
  const currentStep = firstString(
    getRecord(status.current_step_resources).step,
    getRecord(status.step).current_step,
    status.current_step,
    session.currentStage,
  );
  const currentResources = currentStep === "video_generation"
    ? getRecord(getRecord(status.current_step_resources).resources)
    : {};
  const completed = getRecord(status.completed_step_resources);
  const finalResources = getRecord(getRecord(completed.video_generation).resources);
  const video = getRecord(status.video);
  const output = getRecord(status.output);
  const result = getRecord(status.result);
  return normalizeMediaUrl(firstString(
    sessionResult.url,
    sessionResult.remoteURL,
    sessionResult.videoLink,
    session.videoLink,
    session.video_url,
    session.videoUrl,
    session.remoteVideoLink,
    finalResources.result_url,
    finalResources.remote_url,
    finalResources.video_link,
    finalResources.videoLink,
    result.url,
    result.remoteURL,
    result.videoLink,
    video.url,
    video.video_url,
    output.url,
    output.video_url,
    currentResources.result_url,
    currentResources.remote_url,
    currentResources.video_link,
    currentResources.videoLink,
    status.result_url,
    status.remoteURL,
    status.remote_url,
    status.video_url,
    status.videoLink,
    firstArrayString(status.result_urls),
  ));
}

function getSessionPreviewUrl(status: ApiRecord | null) {
  return getFinalVideoUrl(status) || collectPreviewResources(status).at(-1)?.url || "";
}

function collectMediaUrls(value: unknown, result = new Set<string>()) {
  if (typeof value === "string") {
    const normalizedUrl = normalizeMediaUrl(value);
    if (normalizedUrl) {
      result.add(normalizedUrl);
    }
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectMediaUrls(item, result));
    return result;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectMediaUrls(item, result));
  }
  return result;
}

function isVideoUrl(url: string) {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) || url.includes("video") || url.includes("cloudfront");
}

function isAudioUrl(url: string) {
  return /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(url) || url.includes("audio");
}

function isImageUrl(url: string) {
  return /^data:image\//i.test(url) || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
}

function formatStageLabel(stage: string) {
  return STAGE_LABELS[stage] || stage.replaceAll("_", " ");
}

function formatTime(value: number) {
  const safeValue = Math.max(0, Math.round(value));
  const minutes = Math.floor(safeValue / 60);
  const seconds = safeValue % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getDetailedSession(status: ApiRecord | null) {
  return getRecord(status?.session);
}

function getLibraryStatus(video: LibraryVideo) {
  return firstString(video.status, getStatusText(getRecord(video.metadata?.stepStatus))) || "PENDING";
}

function getLibraryRequestId(video: LibraryVideo) {
  return firstString(video.samsarRequestId, video.samsarSessionId);
}

function getLibraryPayload(video: LibraryVideo) {
  const metadata = getRecord(video.metadata);
  return getRecord(metadata.payload);
}

function getLibraryStepStatus(video: LibraryVideo) {
  const metadata = getRecord(video.metadata);
  return getRecord(metadata.stepStatus);
}

function canUseLibraryVideo(video: LibraryVideo) {
  const sourceUrl = video.sourceUrl || "";
  return Boolean(
    getLibraryRequestId(video) &&
    sourceUrl &&
    !isImageUrl(sourceUrl) &&
    getLibraryStatus(video).toUpperCase() === "COMPLETED",
  );
}

function getStageStatus(session: ApiRecord, stage: string) {
  const stages = getRecord(session.stages);
  const value = stages[stage];
  if (typeof value === "string") {
    return value;
  }
  return firstString(getRecord(value).status);
}

function isCompleteStatus(value: string) {
  return value.toUpperCase() === "COMPLETED";
}

function isStageComplete(session: ApiRecord, stage: string, resourceStatus = "") {
  const completedStages = Array.isArray(session.completedStages) ? session.completedStages.map((item) => getString(item)) : [];
  return completedStages.includes(stage) || isCompleteStatus(resourceStatus) || isCompleteStatus(getStageStatus(session, stage));
}

function resolveResourceKind(kind: unknown, url: string): StagePreviewResource["kind"] {
  const normalized = getString(kind).toLowerCase();
  if (normalized === "audio" || isAudioUrl(url)) {
    return "audio";
  }
  if (normalized === "image" || /^data:image\//i.test(url) || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)) {
    return "image";
  }
  return "video";
}

function getLayerWindow(layer: ApiRecord, sessionDuration: number) {
  const startTime = Math.max(0, getNumber(layer.startTime, 0));
  const duration = getNumber(layer.duration, 0);
  const explicitEnd = getNumber(layer.endTime, 0);
  const endTime = explicitEnd > startTime
    ? explicitEnd
    : duration > 0
      ? startTime + duration
      : Math.max(startTime + 1, sessionDuration || startTime + 1);
  return { startTime, endTime };
}

function collectPreviewResources(status: ApiRecord | null): StagePreviewResource[] {
  const session = getDetailedSession(status);
  const sessionDuration = Math.max(0, getNumber(session.duration, 0));
  const resources: StagePreviewResource[] = [];
  const seen = new Set<string>();

  function addResource(resource: Omit<StagePreviewResource, "id"> & { id?: string }) {
    const normalizedUrl = normalizeMediaUrl(resource.url);
    if (!normalizedUrl || seen.has(normalizedUrl)) {
      return;
    }
    const statusValue = resource.status || getStageStatus(session, resource.stage);
    if (!isStageComplete(session, resource.stage, statusValue)) {
      return;
    }
    seen.add(normalizedUrl);
    resources.push({
      ...resource,
      url: normalizedUrl,
      id: resource.id || `${resource.stage}-${resources.length}`,
      status: statusValue || "COMPLETED",
    });
  }

  const layers = Array.isArray(session.layers) ? session.layers.map(getRecord) : [];
  layers.forEach((layer, index) => {
    const { startTime, endTime } = getLayerWindow(layer, sessionDuration);
    const promptText = firstString(layer.videoPrompt, layer.prompt);

    const preview = getRecord(layer.preview);
    const previewUrl = firstString(preview.url);
    if (previewUrl) {
      const previewStage = firstString(preview.stage, layer.aiVideoType, "ai_video_generation");
      addResource({
        id: `layer-${index}-preview`,
        label: `Scene ${index + 1} ${formatStageLabel(previewStage)}`,
        stage: previewStage,
        kind: resolveResourceKind(preview.type, previewUrl),
        url: previewUrl,
        status: firstString(layer.status),
        startTime,
        endTime,
        prompt: promptText,
      });
    }

    [
      ["image", "image_generation", "Image"],
      ["aiVideo", "ai_video_generation", "Motion"],
      ["lipSyncVideo", "lip_sync_generation", "Lip sync"],
      ["soundEffectVideo", "sound_effect_generation", "Sound effect"],
      ["userVideo", "ai_video_generation", "User video"],
    ].forEach(([key, stage, label]) => {
      const asset = getRecord(layer[key]);
      const url = firstString(asset.url);
      if (!url) {
        return;
      }
      addResource({
        id: `layer-${index}-${key}`,
        label: `Scene ${index + 1} ${label}`,
        stage,
        kind: resolveResourceKind(key === "image" ? "image" : "video", url),
        url,
        status: firstString(asset.status, layer.status),
        startTime,
        endTime,
        prompt: firstString(asset.description, promptText),
      });
    });
  });

  const audioLayers = [
    ...(Array.isArray(session.audioLayers) ? session.audioLayers.map(getRecord) : []),
    ...(Array.isArray(session.globalAudioLayers) ? session.globalAudioLayers.map(getRecord) : []),
  ];
  audioLayers.forEach((layer, index) => {
    const { startTime, endTime } = getLayerWindow(layer, sessionDuration);
    const remoteLinks = Array.isArray(layer.remoteAudioLinks) ? layer.remoteAudioLinks : [];
    const url = firstString(layer.url, remoteLinks[0]);
    if (!url) {
      return;
    }
    const type = firstString(layer.type, layer.audioBindingMode, "audio");
    const stage = type.includes("music") ? "music_generation" : "speech_generation";
    addResource({
      id: `audio-${index}`,
      label: `${type.replaceAll("_", " ")} ${index + 1}`,
      stage,
      kind: "audio",
      url,
      status: firstString(layer.status),
      startTime,
      endTime,
      prompt: firstString(layer.prompt, layer.lyrics, layer.speakerCharacterName),
    });
  });

  const globalVideos = Array.isArray(session.globalVideos) ? session.globalVideos.map(getRecord) : [];
  globalVideos.forEach((video, index) => {
    const { startTime, endTime } = getLayerWindow(video, sessionDuration);
    const url = firstString(video.url);
    if (!url) {
      return;
    }
    addResource({
      id: `global-video-${index}`,
      label: firstString(video.title) || `Global video ${index + 1}`,
      stage: "ai_video_generation",
      kind: "video",
      url,
      status: firstString(video.status),
      startTime,
      endTime,
    });
  });

  const resultUrl = getFinalVideoUrl(status);
  if (resultUrl) {
    addResource({
      id: "final-result",
      label: "Final render",
      stage: "video_generation",
      kind: "video",
      url: resultUrl,
      status: "COMPLETED",
      startTime: 0,
      endTime: sessionDuration || Math.max(...resources.map((resource) => resource.endTime), 1),
    });
  }

  return resources.sort((a, b) => {
    if (a.id === "final-result" && b.id !== "final-result") {
      return 1;
    }
    if (b.id === "final-result" && a.id !== "final-result") {
      return -1;
    }
    return a.startTime - b.startTime || STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
  });
}

async function readApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || "Request failed");
  }
  return data as T;
}

function SetupWizard({
  setup,
  onUpdated,
}: {
  setup: SetupStatus | null;
  onUpdated: (setup: SetupStatus) => void;
}) {
  const [samsarApiKey, setSamsarApiKey] = useState("");
  const [runwayApiKey, setRunwayApiKey] = useState("");
  const [serverSecret, setServerSecret] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const nextSetup = await readApi<SetupStatus>("/api/setup", {
        method: "POST",
        body: JSON.stringify({
          samsarApiKey,
          runwayApiKey,
          serverSecret,
        }),
      });
      setSamsarApiKey("");
      setRunwayApiKey("");
      setServerSecret("");
      onUpdated(nextSetup);
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : "Unable to save setup.");
    } finally {
      setSaving(false);
    }
  }

  const secretStorage = getSecretStorageStatus(setup);

  return (
    <section className="setupSurface">
      <div className="setupPanel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Startup wizard</p>
            <h1>Connect FlashReels</h1>
          </div>
          <KeyRound size={24} />
        </div>

        <div className="setupStatusGrid">
          <StatusPill ready={Boolean(setup?.runwayConfigured)} label="RunwayML API key" source={setup?.runwaySource} />
          <StatusPill ready={Boolean(setup?.samsarConfigured)} label="Samsar API key" source={setup?.samsarSource} />
          <StatusPill ready={Boolean(setup?.serverSecretConfigured)} label="Server secret" source={setup?.serverSecretSource} />
          <StatusPill ready={secretStorage.ready} label="Secret storage" source={secretStorage.source} />
          <StatusPill
            ready={Boolean(setup?.publicBaseUrl)}
            label={setup?.publicBaseUrl ? "Public callbacks" : "Instance callbacks"}
            source={setup?.publicBaseUrl || "request origin"}
          />
        </div>

        <label>
          <span>RunwayML API key</span>
          <input
            type="password"
            value={runwayApiKey}
            onChange={(event) => setRunwayApiKey(event.target.value)}
            placeholder={setup?.runwayConfigured ? "Configured" : "Paste key"}
          />
        </label>
        <label>
          <span>Samsar.one API key</span>
          <input
            type="password"
            value={samsarApiKey}
            onChange={(event) => setSamsarApiKey(event.target.value)}
            placeholder={setup?.samsarConfigured ? "Configured" : "Paste key"}
          />
        </label>
        <label>
          <span>Server secret</span>
          <input
            type="password"
            value={serverSecret}
            onChange={(event) => setServerSecret(event.target.value)}
            placeholder={setup?.serverSecretConfigured ? "Configured" : "24+ chars, mixed character types"}
          />
        </label>

        {error ? <div className="errorBox">{error}</div> : null}

        <button className="primaryButton" onClick={submit} disabled={saving || (!samsarApiKey && !runwayApiKey && !serverSecret)}>
          {saving ? <Loader2 className="spin" size={17} /> : <Check size={17} />}
          Save secure setup
        </button>
      </div>
    </section>
  );
}

function StatusPill({ ready, label, source }: { ready: boolean; label: string; source?: string }) {
  return (
    <div className={`statusPill ${ready ? "ready" : ""}`}>
      {ready ? <Check size={15} /> : <CircleDashed size={15} />}
      <span>{label}</span>
      {source ? <small>{source}</small> : null}
    </div>
  );
}

function getSecretStorageStatus(setup: SetupStatus | null) {
  if (!setup) {
    return { ready: false, source: "" };
  }
  if (setup.persistence?.remoteSafe) {
    return { ready: true, source: setup.persistence.provider };
  }
  if (setup.envFile?.writable) {
    return { ready: true, source: `${setup.envFile.target} + local store` };
  }
  if (setup.persistence?.persistent) {
    return { ready: true, source: setup.persistence.provider };
  }
  return {
    ready: false,
    source: setup.persistence?.reason || setup.envFile?.reason || setup.persistence?.provider || "",
  };
}

function AuthGate({ onAuth }: { onAuth: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const data = await readApi<{ user: User }>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, displayName, password }),
      });
      onAuth(data.user);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="setupSurface">
      <div className="setupPanel authPanel">
        <div>
          <p className="eyebrow">Account</p>
          <h1>{mode === "register" ? "Create workspace" : "Sign in"}</h1>
        </div>
        <div className="segmented">
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
            Register
          </button>
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Login
          </button>
        </div>
        {mode === "register" ? (
          <label>
            <span>Display name</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
        ) : null}
        <label>
          <span>Email</span>
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          <span>Password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <div className="errorBox">{error}</div> : null}
        <button className="primaryButton" onClick={submit} disabled={busy || !email || !password}>
          {busy ? <Loader2 className="spin" size={17} /> : <ArrowRight size={17} />}
          Continue
        </button>
      </div>
    </section>
  );
}

function StepCard({ block }: { block: ApiRecord }) {
  const resources = getRecord(block.resources);
  const mediaUrls = Array.from(collectMediaUrls(resources)).slice(0, 8);
  const label = firstString(block.label, block.step) || "Step";

  return (
    <article className="stepCard">
      <div className="stepCardHeader">
        <div>
          <span>{label}</span>
          <small>{firstString(block.status) || "COMPLETED"}</small>
        </div>
        <Check size={16} />
      </div>
      {mediaUrls.length > 0 ? (
        <div className="mediaGrid">
          {mediaUrls.map((url) => (
            isVideoUrl(url) ? (
              <video key={url} src={url} controls playsInline />
            ) : (
              <img key={url} src={url} alt="" />
            )
          ))}
        </div>
      ) : (
        <pre className="resourceJson">{JSON.stringify(resources, null, 2)}</pre>
      )}
    </article>
  );
}

function ResourceIcon({ kind }: { kind: StagePreviewResource["kind"] }) {
  if (kind === "audio") {
    return <Volume2 size={15} />;
  }
  if (kind === "image") {
    return <ImageIcon size={15} />;
  }
  return <Film size={15} />;
}

function buildTimelineRows(resources: StagePreviewResource[]) {
  const orderedResources = [...resources].sort((a, b) => (
    a.startTime - b.startTime ||
    a.endTime - b.endTime ||
    a.label.localeCompare(b.label)
  ));
  const rows: StagePreviewResource[][] = [];

  orderedResources.forEach((resource) => {
    const row = rows.find((candidate) => candidate.every((existing) => (
      resource.endTime <= existing.startTime || resource.startTime >= existing.endTime
    )));
    if (row) {
      row.push(resource);
    } else {
      rows.push([resource]);
    }
  });

  return rows;
}

function StagedVideoPreview({
  resource,
  timelineSeek,
  isSequencePlaying,
  playbackRequestId,
  mediaRef,
  onEnded,
  onPlay,
  onPause,
}: {
  resource: StagePreviewResource;
  timelineSeek: number;
  isSequencePlaying: boolean;
  playbackRequestId: number;
  mediaRef: MutableRefObject<HTMLMediaElement | null>;
  onEnded: () => void;
  onPlay: () => void;
  onPause: () => void;
}) {
  const localMediaRef = useRef<HTMLMediaElement | null>(null);

  useEffect(() => {
    const media = localMediaRef.current;
    if (!media || (resource.kind !== "video" && resource.kind !== "audio")) {
      return;
    }
    const nextTime = Math.max(0, timelineSeek - resource.startTime);
    if (Number.isFinite(nextTime) && Math.abs(media.currentTime - nextTime) > 0.5) {
      media.currentTime = nextTime;
    }
  }, [resource, timelineSeek]);

  useEffect(() => {
    const media = localMediaRef.current;
    if (!media || (resource.kind !== "video" && resource.kind !== "audio")) {
      return;
    }
    if (!isSequencePlaying) {
      return;
    }
    media.play().catch(() => {
      onPause();
    });
  }, [isSequencePlaying, onPause, playbackRequestId, resource]);

  function setMediaElement(element: HTMLMediaElement | null) {
    localMediaRef.current = element;
    mediaRef.current = element;
  }

  function syncInitialSeek(element: HTMLMediaElement | null) {
    if (element) {
      element.currentTime = Math.max(0, timelineSeek - resource.startTime);
    }
  }

  function handlePause() {
    if (!localMediaRef.current?.ended) {
      onPause();
    }
  }

  if (resource.kind === "image") {
    return <img src={resource.url} alt="" />;
  }

  if (resource.kind === "audio") {
    return (
      <div className="audioPreviewHero">
        <Music size={42} />
        <strong>{resource.label}</strong>
        <span>{formatTime(resource.startTime)} - {formatTime(resource.endTime)}</span>
        <audio
          key={resource.url}
          ref={setMediaElement}
          src={resource.url}
          controls
          onLoadedMetadata={(event) => syncInitialSeek(event.currentTarget)}
          onEnded={onEnded}
          onPlay={onPlay}
          onPause={handlePause}
        />
      </div>
    );
  }

  return (
    <video
      key={resource.url}
      ref={setMediaElement}
      src={resource.url}
      controls
      playsInline
      onLoadedMetadata={(event) => syncInitialSeek(event.currentTarget)}
      onEnded={onEnded}
      onPlay={onPlay}
      onPause={handlePause}
    />
  );
}

function StagedPreviewPanel({
  status,
  resources,
  selectedResource,
  timelineSeek,
  onTimelineSeek,
  onSelectResource,
}: {
  status: ApiRecord | null;
  resources: StagePreviewResource[];
  selectedResource: StagePreviewResource | null;
  timelineSeek: number;
  onTimelineSeek: (time: number) => void;
  onSelectResource: (resource: StagePreviewResource) => void;
}) {
  const session = getDetailedSession(status);
  const sequenceMediaRef = useRef<HTMLMediaElement | null>(null);
  const autoPlayedFinalUrlRef = useRef("");
  const [isSequencePlaying, setIsSequencePlaying] = useState(false);
  const [playbackRequestId, setPlaybackRequestId] = useState(0);
  const statusText = getStatusText(status).toUpperCase();
  const currentStage = firstString(session.currentStage, getRecord(status?.step).current_step, status?.current_step);
  const previewStage = firstString(session.previewStage);
  const completedStages = Array.isArray(session.completedStages) ? session.completedStages.map((stage) => getString(stage)).filter(Boolean) : [];
  const timelineDuration = Math.max(
    1,
    getNumber(session.duration, 0),
    ...resources.map((resource) => resource.endTime),
  );
  const completedCount = STAGE_ORDER.filter((stage) => completedStages.includes(stage) || resources.some((resource) => resource.stage === stage)).length;
  const progressPercent = Math.min(100, Math.max(4, (completedCount / STAGE_ORDER.length) * 100));
  const playableResources = useMemo(() => resources
    .filter((resource) => resource.kind === "audio" || resource.kind === "video")
    .sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime || a.label.localeCompare(b.label)), [resources]);
  const timelineRows = useMemo(() => buildTimelineRows(resources), [resources]);

  function selectResource(resource: StagePreviewResource) {
    sequenceMediaRef.current?.pause();
    setIsSequencePlaying(false);
    onSelectResource(resource);
    onTimelineSeek(resource.startTime);
  }

  function startPlayback(resource: StagePreviewResource, seekTime = resource.startTime) {
    onSelectResource(resource);
    onTimelineSeek(seekTime);
    setIsSequencePlaying(true);
    setPlaybackRequestId((value) => value + 1);
  }

  useEffect(() => {
    if (statusText !== "COMPLETED") {
      return;
    }
    const finalResource = resources.find((resource) => resource.id === "final-result" && resource.kind === "video")
      || resources.find((resource) => resource.stage === "video_generation" && resource.kind === "video");
    if (!finalResource || autoPlayedFinalUrlRef.current === finalResource.url) {
      return;
    }
    autoPlayedFinalUrlRef.current = finalResource.url;
    startPlayback(finalResource, 0);
  }, [resources, statusText]);

  function toggleSequencePlayback() {
    if (isSequencePlaying) {
      sequenceMediaRef.current?.pause();
      setIsSequencePlaying(false);
      return;
    }

    const selectedPlayable = selectedResource && playableResources.find((resource) => resource.id === selectedResource.id);
    const timelinePlayable = playableResources.find((resource) => timelineSeek >= resource.startTime && timelineSeek < resource.endTime);
    const nextPlayable = playableResources.find((resource) => resource.endTime > timelineSeek);
    const resourceToPlay = selectedPlayable || timelinePlayable || nextPlayable || playableResources[0];
    if (!resourceToPlay) {
      return;
    }
    const seekTime = timelineSeek >= resourceToPlay.startTime && timelineSeek < resourceToPlay.endTime
      ? timelineSeek
      : resourceToPlay.startTime;
    startPlayback(resourceToPlay, seekTime);
  }

  function handleResourceEnded() {
    if (!selectedResource) {
      setIsSequencePlaying(false);
      return;
    }
    const currentIndex = playableResources.findIndex((resource) => resource.id === selectedResource.id);
    const nextResource = currentIndex >= 0 ? playableResources[currentIndex + 1] : null;
    if (!nextResource) {
      setIsSequencePlaying(false);
      return;
    }
    startPlayback(nextResource);
  }

  return (
    <>
      <div className="renderProgress">
        <div className="renderProgressTrack">
          <span style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="renderProgressMeta">
          <span>{currentStage ? formatStageLabel(currentStage) : "Preparing"}</span>
          {previewStage ? <strong>Preview: {formatStageLabel(previewStage)}</strong> : <strong>{completedCount}/{STAGE_ORDER.length} stages</strong>}
        </div>
      </div>

      <div className="renderViewport">
        {selectedResource ? (
          <StagedVideoPreview
            resource={selectedResource}
            timelineSeek={timelineSeek}
            isSequencePlaying={isSequencePlaying}
            playbackRequestId={playbackRequestId}
            mediaRef={sequenceMediaRef}
            onEnded={handleResourceEnded}
            onPlay={() => setIsSequencePlaying(true)}
            onPause={() => setIsSequencePlaying(false)}
          />
        ) : (
          <div className="emptyPreview">
            <Film size={30} />
            <span>{status ? "Waiting for a playable stage resource" : "No render loaded"}</span>
          </div>
        )}
      </div>

      <div className="timelinePreview">
        <div className="timelineControls">
          <button
            type="button"
            className="timelinePlayButton"
            onClick={toggleSequencePlayback}
            disabled={playableResources.length === 0}
            aria-label={isSequencePlaying ? "Pause preview timeline" : "Play preview timeline"}
          >
            {isSequencePlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <div className="timelineRangeWrap">
            <div className="timelineLabels">
              <span>{formatTime(timelineSeek)}</span>
              <strong>{formatTime(timelineDuration)}</strong>
            </div>
            <input
              type="range"
              min={0}
              max={timelineDuration}
              step={0.1}
              value={Math.min(timelineDuration, timelineSeek)}
              onChange={(event) => {
                setIsSequencePlaying(false);
                sequenceMediaRef.current?.pause();
                onTimelineSeek(Number(event.target.value));
              }}
              aria-label="Seek preview timeline"
            />
          </div>
        </div>
        <div className="timelineTracks" aria-label="Timeline resources">
          {timelineRows.length > 0 ? timelineRows.map((row, rowIndex) => (
            <div className="timelineTrack" key={`timeline-row-${rowIndex}`}>
              {row.map((resource) => (
                <button
                  key={resource.id}
                  type="button"
                  className={`timelineSegment ${selectedResource?.id === resource.id ? "active" : ""} kind-${resource.kind}`}
                  title={`${resource.label} ${formatTime(resource.startTime)}-${formatTime(resource.endTime)}`}
                  style={{
                    left: `${Math.min(100, Math.max(0, (resource.startTime / timelineDuration) * 100))}%`,
                    width: `${Math.max(3, ((resource.endTime - resource.startTime) / timelineDuration) * 100)}%`,
                  }}
                  onClick={() => selectResource(resource)}
                >
                  <ResourceIcon kind={resource.kind} />
                  <span>{resource.label}</span>
                </button>
              ))}
            </div>
          )) : (
            <div className="placeholderBlock">Timeline resources will appear as completed assets become available.</div>
          )}
        </div>
      </div>

      {selectedResource ? (
        <div className="resourceDetailPanel">
          <div className="resourceDetailHeader">
            <span>
              <ResourceIcon kind={selectedResource.kind} />
              {selectedResource.label}
            </span>
            <strong>{formatTime(selectedResource.startTime)}-{formatTime(selectedResource.endTime)}</strong>
          </div>
          <p>{formatStageLabel(selectedResource.stage)} - {selectedResource.status}</p>
          {selectedResource.prompt ? <small>{selectedResource.prompt}</small> : null}
          <div className="resourceActions">
            <a href={selectedResource.url} target="_blank" rel="noreferrer">Open resource</a>
            {selectedResource.kind === "video" ? (
              <a href={selectedResource.url} download target="_blank" rel="noreferrer">
                <Download size={14} />
                Download
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="resourceShelf" aria-label="Completed stage resources">
        {resources.length > 0 ? resources.map((resource) => (
          <button
            key={resource.id}
            type="button"
            className={`resourceTile ${selectedResource?.id === resource.id ? "active" : ""}`}
            onClick={() => {
              selectResource(resource);
            }}
          >
            <span className="resourceThumb">
              {resource.kind === "image" ? <img src={resource.url} alt="" /> : resource.kind === "video" ? <video src={resource.url} muted playsInline /> : <Music size={24} />}
            </span>
            <span className="resourceInfo">
              <span>
                <ResourceIcon kind={resource.kind} />
                {resource.label}
              </span>
              <small>{formatStageLabel(resource.stage)} - {formatTime(resource.startTime)}-{formatTime(resource.endTime)}</small>
            </span>
          </button>
        )) : (
          <div className="placeholderBlock">Completed image, video, speech, and music previews will appear here as each stage finishes.</div>
        )}
      </div>
    </>
  );
}

export default function FlashReelsApp() {
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [lastSubmission, setLastSubmission] = useState<Record<string, unknown> | null>(null);
  const [requestId, setRequestId] = useState("");
  const [status, setStatus] = useState<ApiRecord | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [library, setLibrary] = useState<LibraryVideo[]>([]);
  const [savedUrl, setSavedUrl] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState("");
  const [timelineSeek, setTimelineSeek] = useState(0);
  const [draftPayload, setDraftPayload] = useState<Record<string, unknown> | null>(null);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
  const [libraryLanguages, setLibraryLanguages] = useState<Record<string, string>>({});
  const [libraryActionBusy, setLibraryActionBusy] = useState("");
  const [currentEditLanguage, setCurrentEditLanguage] = useState(LANGUAGE_OPTIONS[0].code);
  const [currentFooterText, setCurrentFooterText] = useState("");
  const [currentFooterUrl, setCurrentFooterUrl] = useState("");
  const [currentJoinVideoId, setCurrentJoinVideoId] = useState("");
  const [currentActionBusy, setCurrentActionBusy] = useState("");
  const autoProcessNextRef = useRef("");
  const statusText = getStatusText(status);
  const finalVideoUrl = getFinalVideoUrl(status);
  const currentSourceSessionId = firstString(getRequestId(status), requestId);
  const step = getRecord(status?.step);
  const waitingForNext = Boolean(step.waiting_for_process_next || status?.waiting_for_process_next);
  const requiresUserAction = Boolean(
    step.requires_user_action ||
    step.requiresUserAction ||
    status?.requires_user_action ||
    status?.requiresUserAction,
  );
  const canProcessNext = Boolean(
    step.can_process_next ||
    step.canProcessNext ||
    status?.can_process_next ||
    status?.canProcessNext ||
    requiresUserAction,
  );
  const nextStep = firstString(step.next_step, status?.next_step);
  const currentStep = firstString(step.current_step, status?.current_step);
  const currentStepLabel = currentStep ? formatStageLabel(currentStep) : "";
  const nextStepLabel = nextStep ? formatStageLabel(nextStep) : "";
  const terminal = ["FAILED", "CANCELED", "CANCELLED"].includes(statusText.toUpperCase());
  const activeStatus = ["PENDING", "RUNNING", "PROCESSING", "IN_PROGRESS"].includes(statusText.toUpperCase());
  const completedStatus = statusText.toUpperCase() === "COMPLETED";
  const canContinue = statusText.toUpperCase() === "COMPLETED" && waitingForNext && canProcessNext && Boolean(nextStep);
  const completedBlocks = useMemo(() => {
    const completed = getRecord(status?.completed_step_resources);
    return STAGE_ORDER
      .map((key) => getRecord(completed[key]))
      .filter((block) => Object.keys(block).length > 0);
  }, [status]);
  const previewResources = useMemo(() => collectPreviewResources(status), [status]);
  const finalPreviewResource = useMemo(() => (
    previewResources.find((resource) => resource.id === "final-result" && resource.kind === "video") || null
  ), [previewResources]);
  const selectedResource = useMemo(() => {
    if (previewResources.length === 0) {
      return null;
    }
    const explicitResource = previewResources.find((resource) => resource.id === selectedResourceId);
    if (explicitResource) {
      return explicitResource;
    }
    if (finalPreviewResource && statusText.toUpperCase() === "COMPLETED") {
      return finalPreviewResource;
    }
    return previewResources.find((resource) => resource.id === selectedResourceId)
      || previewResources.find((resource) => timelineSeek >= resource.startTime && timelineSeek <= resource.endTime)
      || previewResources[previewResources.length - 1];
  }, [finalPreviewResource, previewResources, selectedResourceId, statusText, timelineSeek]);
  const joinCandidates = useMemo(() => (
    library.filter((video) => canUseLibraryVideo(video) && getLibraryRequestId(video) !== currentSourceSessionId)
  ), [currentSourceSessionId, library]);

  const loadLibrary = useCallback(async () => {
    if (!user) {
      return;
    }
    const data = await readApi<{ videos: LibraryVideo[] }>("/api/library");
    setLibrary(data.videos);
  }, [user]);

  const saveSessionSnapshot = useCallback(async (
    snapshotStatus: ApiRecord | null,
    snapshotRequestId: string,
    snapshotPayload: Record<string, unknown> | null,
    options: { refreshLibrary?: boolean } = {},
  ) => {
    if (!snapshotStatus || !snapshotRequestId) {
      return null;
    }

    const sourceUrl = getSessionPreviewUrl(snapshotStatus);
    const title = firstString(snapshotPayload?.prompt, getDetailedSession(snapshotStatus).title, snapshotRequestId, "Untitled render");
    const snapshotStatusText = getStatusText(snapshotStatus);
    const persistedStatus = snapshotStatusText === "IDLE" && snapshotRequestId ? "PENDING" : snapshotStatusText;
    const video = await readApi<{ video: LibraryVideo }>("/api/library", {
      method: "POST",
      body: JSON.stringify({
        title: title.slice(0, 72),
        mode: "image_list_to_video",
        prompt: title,
        sourceUrl,
        samsarRequestId: snapshotRequestId,
        samsarSessionId: getRequestId(snapshotStatus) || snapshotRequestId,
        status: persistedStatus,
        metadata: {
          payload: snapshotPayload || {},
          stepStatus: snapshotStatus,
        },
      }),
    });

    if (sourceUrl) {
      setSavedUrl(sourceUrl);
    }
    if (options.refreshLibrary !== false) {
      await loadLibrary();
    } else {
      setLibrary((current) => {
        const index = current.findIndex((item) => item.id === video.video.id);
        if (index === -1) {
          return [video.video, ...current];
        }
        return current.map((item) => item.id === video.video.id ? video.video : item);
      });
    }
    return video.video;
  }, [loadLibrary]);

  const pollStatus = useCallback(async () => {
    if (!requestId) {
      return;
    }
    setPolling(true);
    try {
      const data = await readApi<ApiRecord>(
        buildDetailedStatusUrl(requestId),
      );
      setStatus(data);
      await saveSessionSnapshot(data, requestId, lastSubmission, { refreshLibrary: false });
      setError("");
    } catch (pollError) {
      setError(pollError instanceof Error ? pollError.message : "Unable to poll status.");
    } finally {
      setPolling(false);
    }
  }, [lastSubmission, requestId, saveSessionSnapshot]);

  const loadSetup = useCallback(async () => {
    const setupData = await readApi<SetupStatus>("/api/setup");
    setSetup(setupData);
    return setupData;
  }, []);

  useEffect(() => {
    async function boot() {
      try {
        const authData = await readApi<{ user: User | null }>("/api/auth/me");
        setUser(authData.user);
        if (authData.user) {
          await loadSetup();
        }
      } catch (bootError) {
        setError(bootError instanceof Error ? bootError.message : "Unable to load FlashReels.");
      } finally {
        setBooting(false);
      }
    }
    boot();
  }, [loadSetup]);

  useEffect(() => {
    if (user) {
      loadLibrary().catch(() => undefined);
    }
  }, [loadLibrary, user]);

  useEffect(() => {
    if (!requestId || terminal || canContinue || statusText.toUpperCase() === "COMPLETED") {
      return;
    }

    const timeout = setTimeout(() => {
      pollStatus();
    }, 5200);
    return () => clearTimeout(timeout);
  }, [canContinue, pollStatus, requestId, statusText, terminal]);

  useEffect(() => {
    if (previewResources.length === 0) {
      setSelectedResourceId("");
      setTimelineSeek(0);
      return;
    }
    if (finalPreviewResource && statusText.toUpperCase() === "COMPLETED" && selectedResourceId !== finalPreviewResource.id) {
      setSelectedResourceId(finalPreviewResource.id);
      setTimelineSeek(finalPreviewResource.startTime);
      return;
    }
    if (!previewResources.some((resource) => resource.id === selectedResourceId)) {
      const nextResource = previewResources[previewResources.length - 1];
      setSelectedResourceId(nextResource.id);
      setTimelineSeek(nextResource.startTime);
    }
  }, [finalPreviewResource, previewResources, selectedResourceId, statusText]);

  async function startRender(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setLastSubmission(payload);
    setDraftPayload(payload);
    setStatus(null);
    setRequestId("");
    setSavedUrl("");
    setSelectedResourceId("");
    setTimelineSeek(0);
    try {
      const data = await readApi<ApiRecord>("/api/samsar/step/start", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const nextRequestId = getRequestId(data);
      if (!nextRequestId) {
        throw new Error("Samsar did not return a request id.");
      }
      setStatus(data);
      setRequestId(nextRequestId);
      const detailedData = await readApi<ApiRecord>(buildDetailedStatusUrl(nextRequestId));
      setStatus(detailedData);
      await saveSessionSnapshot(detailedData, nextRequestId, payload, { refreshLibrary: true });
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Unable to start render.");
    } finally {
      setBusy(false);
    }
  }

  async function processNext() {
    if (!requestId) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await readApi<ApiRecord>("/api/samsar/step/process-next", {
        method: "POST",
        body: JSON.stringify({ request_id: requestId }),
      });
      const nextRequestId = getRequestId(data) || requestId;
      setRequestId(nextRequestId);
      setStatus(data);
      const detailedData = await readApi<ApiRecord>(buildDetailedStatusUrl(nextRequestId));
      setStatus(detailedData);
      await saveSessionSnapshot(detailedData, nextRequestId, lastSubmission, { refreshLibrary: true });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to continue to next step.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!canContinue || !requestId || busy || polling) {
      if (!canContinue) {
        autoProcessNextRef.current = "";
      }
      return;
    }

    const autoKey = `${requestId}:${currentStep}:${nextStep}`;
    if (autoProcessNextRef.current === autoKey) {
      return;
    }
    autoProcessNextRef.current = autoKey;
    processNext();
  }, [busy, canContinue, currentStep, nextStep, polling, requestId]);

  async function saveCurrentSession() {
    if (!requestId || !status) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await saveSessionSnapshot(status, requestId, lastSubmission, { refreshLibrary: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save session.");
    } finally {
      setBusy(false);
    }
  }

  async function loadPreviousSession(video: LibraryVideo) {
    const previousRequestId = getLibraryRequestId(video);
    const previousStatus = getLibraryStepStatus(video);
    const previousPayload = getLibraryPayload(video);
    if (!previousRequestId) {
      setError("This library item does not have a Samsar session id.");
      return;
    }

    setBusy(true);
    setError("");
    setRequestId(previousRequestId);
    setLastSubmission(Object.keys(previousPayload).length > 0 ? previousPayload : null);
    setDraftPayload(Object.keys(previousPayload).length > 0 ? previousPayload : null);
    setStatus(Object.keys(previousStatus).length > 0 ? previousStatus : {
      request_id: previousRequestId,
      status: getLibraryStatus(video),
    });
    setSavedUrl(video.sourceUrl || "");
    setSelectedResourceId("");
    setTimelineSeek(0);
    setLibraryOpen(false);

    try {
      const detailedData = await readApi<ApiRecord>(buildDetailedStatusUrl(previousRequestId));
      setStatus(detailedData);
      await saveSessionSnapshot(detailedData, previousRequestId, Object.keys(previousPayload).length > 0 ? previousPayload : null, { refreshLibrary: true });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to refresh the previous session.");
    } finally {
      setBusy(false);
    }
  }

  function toggleLibrarySelection(video: LibraryVideo, checked: boolean) {
    if (!canUseLibraryVideo(video)) {
      return;
    }
    setSelectedLibraryIds((current) => {
      if (checked) {
        return current.includes(video.id) ? current : [...current, video.id];
      }
      return current.filter((videoId) => videoId !== video.id);
    });
  }

  async function startRetranslation(video: LibraryVideo) {
    const language = libraryLanguages[video.id] || LANGUAGE_OPTIONS[0].code;
    setBusy(true);
    setLibraryActionBusy(`retranslate:${video.id}`);
    setError("");
    try {
      const data = await readApi<ApiRecord>("/api/samsar/video/retranslate", {
        method: "POST",
        body: JSON.stringify({ videoId: video.id, language }),
      });
      const nextRequestId = getRequestId(data);
      if (!nextRequestId) {
        throw new Error("Samsar did not return a request id for the translation.");
      }
      const languageLabel = LANGUAGE_OPTIONS.find((option) => option.code === language)?.label || language.toUpperCase();
      const payload = {
        operation: "retranslate",
        sourceVideoId: video.id,
        prompt: `${video.title} (${languageLabel})`,
        language,
      };
      setRequestId(nextRequestId);
      setStatus(data);
      setLastSubmission(payload);
      setDraftPayload(null);
      setSelectedResourceId("");
      setTimelineSeek(0);
      setLibraryOpen(false);
      await saveSessionSnapshot(data, nextRequestId, payload, { refreshLibrary: true });
    } catch (translateError) {
      setError(translateError instanceof Error ? translateError.message : "Unable to start retranslation.");
    } finally {
      setBusy(false);
      setLibraryActionBusy("");
    }
  }

  async function enterDerivedSession(
    data: ApiRecord,
    payload: Record<string, unknown>,
    emptyRequestMessage: string,
  ) {
    const nextRequestId = getRequestId(data);
    if (!nextRequestId) {
      throw new Error(emptyRequestMessage);
    }
    setRequestId(nextRequestId);
    setStatus(data);
    setLastSubmission(payload);
    setDraftPayload(null);
    setSavedUrl("");
    setSelectedResourceId("");
    setTimelineSeek(0);
    const detailedData = await readApi<ApiRecord>(buildDetailedStatusUrl(nextRequestId));
    setStatus(detailedData);
    await saveSessionSnapshot(detailedData, nextRequestId, payload, { refreshLibrary: true });
  }

  async function startCurrentVideoEdit(operation: "regenerate_avatar" | "retranslate" | "update_footer") {
    if (!currentSourceSessionId) {
      setError("This render does not have a Samsar session id yet.");
      return;
    }
    if (operation === "update_footer" && !currentFooterText.trim() && !currentFooterUrl.trim()) {
      setError("Add footer CTA text or URL before regenerating the footer.");
      return;
    }

    setBusy(true);
    setCurrentActionBusy(operation);
    setError("");
    try {
      const languageLabel = LANGUAGE_OPTIONS.find((option) => option.code === currentEditLanguage)?.label || currentEditLanguage.toUpperCase();
      const data = await readApi<ApiRecord>("/api/samsar/video/edit", {
        method: "POST",
        body: JSON.stringify({
          operation,
          sourceSessionId: currentSourceSessionId,
          language: currentEditLanguage,
          ctaText: currentFooterText,
          ctaUrl: currentFooterUrl,
        }),
      });
      const payload = {
        operation,
        sourceSessionId: currentSourceSessionId,
        prompt: operation === "retranslate"
          ? `Retranslated reel (${languageLabel})`
          : operation === "update_footer"
            ? "Footer-updated reel"
            : "Avatar-regenerated reel",
        language: operation === "retranslate" ? currentEditLanguage : undefined,
      };
      await enterDerivedSession(data, payload, "Samsar did not return a request id for the edited video.");
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "Unable to start video edit.");
    } finally {
      setBusy(false);
      setCurrentActionBusy("");
    }
  }

  async function joinCurrentVideo() {
    const otherVideo = library.find((video) => video.id === currentJoinVideoId);
    if (!currentSourceSessionId || !otherVideo || !canUseLibraryVideo(otherVideo)) {
      setError("Choose a completed library video to join with the current render.");
      return;
    }

    setBusy(true);
    setCurrentActionBusy("join");
    setError("");
    try {
      const data = await readApi<ApiRecord>("/api/samsar/video/join", {
        method: "POST",
        body: JSON.stringify({
          sessionIds: [currentSourceSessionId, otherVideo.samsarSessionId || otherVideo.samsarRequestId],
          blendScenes: true,
        }),
      });
      await enterDerivedSession(data, {
        operation: "join",
        sourceSessionId: currentSourceSessionId,
        sourceVideoId: otherVideo.id,
        prompt: `Joined reel: current + ${otherVideo.title}`,
      }, "Samsar did not return a request id for the joined reel.");
      setCurrentJoinVideoId("");
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Unable to join videos.");
    } finally {
      setBusy(false);
      setCurrentActionBusy("");
    }
  }

  async function joinSelectedVideos() {
    const videosToJoin = selectedLibraryIds
      .map((videoId) => library.find((video) => video.id === videoId))
      .filter((video): video is LibraryVideo => Boolean(video && canUseLibraryVideo(video)));
    if (videosToJoin.length < 2) {
      setError("Select at least two completed videos to join.");
      return;
    }

    setBusy(true);
    setLibraryActionBusy("join");
    setError("");
    try {
      const data = await readApi<ApiRecord>("/api/samsar/video/join", {
        method: "POST",
        body: JSON.stringify({ videoIds: videosToJoin.map((video) => video.id), blendScenes: true }),
      });
      const nextRequestId = getRequestId(data);
      if (!nextRequestId) {
        throw new Error("Samsar did not return a request id for the joined reel.");
      }
      const payload = {
        operation: "join",
        sourceVideoIds: videosToJoin.map((video) => video.id),
        prompt: `Joined reel: ${videosToJoin.map((video) => video.title).join(" + ")}`,
      };
      setRequestId(nextRequestId);
      setStatus(data);
      setLastSubmission(payload);
      setDraftPayload(null);
      setSelectedResourceId("");
      setTimelineSeek(0);
      setSelectedLibraryIds([]);
      setLibraryOpen(false);
      await saveSessionSnapshot(data, nextRequestId, payload, { refreshLibrary: true });
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Unable to join videos.");
    } finally {
      setBusy(false);
      setLibraryActionBusy("");
    }
  }

  async function removeVideo(videoId: string) {
    await readApi(`/api/library/${encodeURIComponent(videoId)}`, { method: "DELETE" });
    setSelectedLibraryIds((current) => current.filter((selectedVideoId) => selectedVideoId !== videoId));
    await loadLibrary();
  }

  async function publishVideo(video: LibraryVideo) {
    setLibraryActionBusy(`publish:${video.id}`);
    setError("");
    try {
      const data = await readApi<{ video: LibraryVideo; feed: { slug: string } | null }>("/api/feed/publish", {
        method: "POST",
        body: JSON.stringify({ videoId: video.id }),
      });
      setLibrary((current) => current.map((item) => item.id === video.id ? data.video : item));
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Unable to publish this video.");
    } finally {
      setLibraryActionBusy("");
    }
  }

  async function unpublishVideo(video: LibraryVideo) {
    setLibraryActionBusy(`unpublish:${video.id}`);
    setError("");
    try {
      const data = await readApi<{ video: LibraryVideo; feed: null }>("/api/feed/publish", {
        method: "DELETE",
        body: JSON.stringify({ videoId: video.id }),
      });
      setLibrary((current) => current.map((item) => item.id === video.id ? data.video : item));
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Unable to unpublish this video.");
    } finally {
      setLibraryActionBusy("");
    }
  }

  async function logout() {
    await readApi("/api/auth/logout", { method: "POST" });
    setUser(null);
    setSetup(null);
    setLibrary([]);
  }

  async function handleAuth(nextUser: User) {
    setUser(nextUser);
    setError("");
    try {
      await loadSetup();
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : "Unable to load setup.");
    }
  }

  if (booting) {
    return (
      <main className="appShell centerShell">
        <Loader2 className="spin" />
      </main>
    );
  }

  if (!user) {
    return <AuthGate onAuth={handleAuth} />;
  }

  if (!setup?.ready) {
    return <SetupWizard setup={setup} onUpdated={setSetup} />;
  }

  return (
    <main className="appShell">
      <header className="appTopbar">
        <div className="brandBlock">
          <Film size={20} />
          <div>
            <strong>FlashReels</strong>
            <span>Product reel generator</span>
          </div>
        </div>

        <div className="topbarActions">
          <div className={`statusBadge status-${statusText.toLowerCase()}`}>
            {polling || activeStatus ? <Loader2 className="spin" size={16} /> : statusText.toUpperCase() === "COMPLETED" ? <Check size={16} /> : <CircleDashed size={16} />}
            {statusText}
          </div>
          <div className="accountChip">
            <strong>{user.displayName}</strong>
            <span>{user.email}</span>
          </div>
          <button className="iconButton" onClick={logout} aria-label="Log out">
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <div className={`appBody ${libraryOpen ? "libraryExpanded" : "libraryCollapsed"}`}>
        <section className="studio">
          <header className="studioTopbar">
            <div>
              <h1>Add listing images, metadata, and CTA to start a render</h1>
            </div>
          </header>

          <div className={`studioGrid ${creatorOpen ? "creatorOverlayOpen" : ""}`}>
            <div className="creatorColumn">
              <section className={`creatorPanelShell ${creatorOpen ? "expanded" : "collapsed"}`}>
                <button
                  className="creatorPanelToggle"
                  onClick={() => setCreatorOpen((open) => !open)}
                  type="button"
                  aria-expanded={creatorOpen}
                >
                  <span className="creatorToggleIcon">
                    <ImageIcon size={17} />
                  </span>
                  <span className="creatorToggleCopy">
                    <strong>New render</strong>
                    <small>{creatorOpen ? "Collapse panel" : "Expand panel"}</small>
                  </span>
                  {creatorOpen ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
                </button>
                <div className="creatorPanelBody">
                  <CreatorWizard busy={busy} draftPayload={draftPayload} onSubmit={startRender} />
                </div>
              </section>
              {error ? <div className="errorBox">{error}</div> : null}
            </div>

            <section className="previewPanel">
              <div className="previewHeader">
                <div>
                  <p className="eyebrow">Current request</p>
                  <h2>{requestId || "Not started"}</h2>
                  <span>{currentStep || "Compose a request to begin"}</span>
                </div>
                <div className="previewHeaderActions">
                  {finalVideoUrl ? (
                    <a className="iconButton" href={finalVideoUrl} download target="_blank" rel="noreferrer" aria-label="Download completed video">
                      <Download size={17} />
                    </a>
                  ) : null}
                  <button className="iconButton" onClick={pollStatus} disabled={!requestId || polling} aria-label="Refresh status">
                    {polling ? <Loader2 className="spin" size={17} /> : <RefreshCcw size={17} />}
                  </button>
                </div>
              </div>

              {completedStatus && finalVideoUrl ? (
                <div className="completedEditPanel">
                  <div className="completedEditHeader">
                    <div>
                      <span>Completed render actions</span>
                      <strong>Create a new editable session from this video</strong>
                    </div>
                  </div>
                  <div className="completedActionGrid">
                    <button
                      type="button"
                      className="secondaryButton"
                      onClick={() => startCurrentVideoEdit("regenerate_avatar")}
                      disabled={busy || currentActionBusy === "regenerate_avatar"}
                    >
                      {currentActionBusy === "regenerate_avatar" ? <Loader2 className="spin" size={16} /> : <RefreshCcw size={16} />}
                      Regenerate avatar
                    </button>
                    <div className="inlineActionGroup">
                      <input
                        value={currentFooterText}
                        onChange={(event) => setCurrentFooterText(event.target.value)}
                        placeholder="Footer CTA text"
                        aria-label="Footer CTA text"
                      />
                      <input
                        value={currentFooterUrl}
                        onChange={(event) => setCurrentFooterUrl(event.target.value)}
                        placeholder="Footer URL"
                        aria-label="Footer URL"
                      />
                      <button
                        type="button"
                        onClick={() => startCurrentVideoEdit("update_footer")}
                        disabled={busy || currentActionBusy === "update_footer"}
                      >
                        {currentActionBusy === "update_footer" ? <Loader2 className="spin" size={15} /> : <RefreshCcw size={15} />}
                        Regenerate footer
                      </button>
                    </div>
                    <div className="inlineActionGroup">
                      <select
                        value={currentEditLanguage}
                        onChange={(event) => setCurrentEditLanguage(event.target.value)}
                        aria-label="Retranslate current video language"
                      >
                        {LANGUAGE_OPTIONS.map((option) => (
                          <option key={option.code} value={option.code}>{option.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => startCurrentVideoEdit("retranslate")}
                        disabled={busy || currentActionBusy === "retranslate"}
                      >
                        {currentActionBusy === "retranslate" ? <Loader2 className="spin" size={15} /> : <Languages size={15} />}
                        Retranslate
                      </button>
                    </div>
                    <div className="inlineActionGroup">
                      <select
                        value={currentJoinVideoId}
                        onChange={(event) => setCurrentJoinVideoId(event.target.value)}
                        aria-label="Video to join with current render"
                      >
                        <option value="">Choose library video</option>
                        {joinCandidates.map((video) => (
                          <option key={video.id} value={video.id}>{video.title}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={joinCurrentVideo}
                        disabled={busy || !currentJoinVideoId || currentActionBusy === "join"}
                      >
                        {currentActionBusy === "join" ? <Loader2 className="spin" size={15} /> : <ListVideo size={15} />}
                        Join reel
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <StagedPreviewPanel
                status={status}
                resources={previewResources}
                selectedResource={selectedResource}
                timelineSeek={timelineSeek}
                onTimelineSeek={setTimelineSeek}
                onSelectResource={(resource) => setSelectedResourceId(resource.id)}
              />

              <div className="actionRow">
                <div className={`approvalPanel ${canContinue ? "ready" : ""}`}>
                  <div>
                    <span>{canContinue ? `${currentStepLabel} ready for review` : requiresUserAction ? "Approval required" : "Express pipeline running"}</span>
                    <strong>{canContinue ? `Approve ${nextStepLabel}` : activeStatus ? `${currentStepLabel || "Current stage"} in progress` : "No approval needed"}</strong>
                  </div>
                </div>
                <button className="primaryButton" onClick={processNext} disabled={!canContinue || busy}>
                  {busy ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />}
                  {canContinue ? `Approve and start ${nextStepLabel}` : "Approve next stage"}
                </button>
                <button className="secondaryButton" onClick={saveCurrentSession} disabled={!requestId || !status || busy}>
                  <Save size={16} />
                  {finalVideoUrl && savedUrl === finalVideoUrl ? "Saved" : "Save session"}
                </button>
              </div>

              {previewResources.length === 0 && completedBlocks.length > 0 ? (
                <div className="stepList">
                  {completedBlocks.map((block) => (
                    <StepCard key={firstString(block.step, block.label)} block={block} />
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        </section>

      <aside className={`libraryPanel ${libraryOpen ? "open" : "collapsed"}`} aria-label="Saved render library">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Library</p>
            <h2>Saved renders</h2>
          </div>
          <button
            className="iconButton"
            onClick={() => setLibraryOpen((open) => !open)}
            aria-label={libraryOpen ? "Collapse library" : "Expand library"}
            aria-expanded={libraryOpen}
          >
            <Database size={18} />
          </button>
        </div>
        <div className="libraryList" aria-hidden={!libraryOpen}>
          {library.length === 0 ? (
            <div className="placeholderBlock">No saved videos yet.</div>
          ) : (
            <>
              <div className="libraryBulkBar">
                <span>{selectedLibraryIds.length} selected</span>
                <button
                  type="button"
                  onClick={joinSelectedVideos}
                  disabled={selectedLibraryIds.length < 2 || busy || libraryActionBusy === "join"}
                >
                  {libraryActionBusy === "join" ? <Loader2 className="spin" size={15} /> : <ListVideo size={15} />}
                  Join reel
                </button>
              </div>
              {library.map((video) => {
            const libraryStatus = getLibraryStatus(video);
            const sourceUrl = video.sourceUrl || "";
            const sourceIsImage = isImageUrl(sourceUrl);
            const sourceIsVideo = sourceUrl && !sourceIsImage;
            const usableVideo = canUseLibraryVideo(video);
            const language = libraryLanguages[video.id] || LANGUAGE_OPTIONS[0].code;
            const feedUrl = video.feedSlug ? `/feed/${video.feedSlug}` : "";
            return (
            <article className="libraryCard" key={video.id}>
              <div className="librarySelectRow">
                <label>
                  <input
                    type="checkbox"
                    checked={selectedLibraryIds.includes(video.id)}
                    disabled={!usableVideo}
                    onChange={(event) => toggleLibrarySelection(video, event.target.checked)}
                  />
                  <span>Join</span>
                </label>
                {video.published && feedUrl ? (
                  <button
                    type="button"
                    className="libraryPublishToggle published"
                    onClick={() => unpublishVideo(video)}
                    disabled={busy || libraryActionBusy === `unpublish:${video.id}`}
                  >
                    {libraryActionBusy === `unpublish:${video.id}` ? <Loader2 className="spin" size={13} /> : <Share2 size={13} />}
                    Unpublish
                  </button>
                ) : (
                  <button
                    type="button"
                    className="libraryPublishToggle"
                    onClick={() => publishVideo(video)}
                    disabled={!usableVideo || busy || libraryActionBusy === `publish:${video.id}`}
                  >
                    {libraryActionBusy === `publish:${video.id}` ? <Loader2 className="spin" size={13} /> : <Share2 size={13} />}
                    Publish
                  </button>
                )}
              </div>
              <button className="libraryLoadButton" type="button" onClick={() => loadPreviousSession(video)}>
                {sourceIsVideo ? <video src={sourceUrl} muted playsInline /> : sourceIsImage ? <img src={sourceUrl} alt="" /> : (
                  <span className="libraryPlaceholder">
                    <Database size={24} />
                  </span>
                )}
                <span className="libraryCardBody">
                  <strong>{video.title}</strong>
                  <span>{video.mode.replaceAll("_", " ")}</span>
                  <small className={`statusBadge status-${libraryStatus.toLowerCase()}`}>{libraryStatus}</small>
                </span>
              </button>
              <div className="libraryTranslateRow">
                <select
                  value={language}
                  disabled={!usableVideo || busy}
                  onChange={(event) => setLibraryLanguages((current) => ({ ...current, [video.id]: event.target.value }))}
                  aria-label={`Retranslate ${video.title} language`}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>{option.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => startRetranslation(video)}
                  disabled={!usableVideo || busy || libraryActionBusy === `retranslate:${video.id}`}
                >
                  {libraryActionBusy === `retranslate:${video.id}` ? <Loader2 className="spin" size={15} /> : <Languages size={15} />}
                  Retranslate
                </button>
              </div>
              <div className="libraryActions">
                {sourceUrl ? (
                  <>
                    <a href={sourceUrl} target="_blank" rel="noreferrer">Open</a>
                    <a href={sourceUrl} download target="_blank" rel="noreferrer">
                      <Download size={14} />
                      Download
                    </a>
                    {feedUrl ? (
                      <a href={feedUrl} target="_blank" rel="noreferrer">
                        <Share2 size={14} />
                        Feed
                      </a>
                    ) : null}
                  </>
                ) : <button onClick={() => loadPreviousSession(video)}>Load</button>}
                <button onClick={() => removeVideo(video.id)} aria-label="Delete saved video">
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          );
          })}
            </>
          )}
        </div>
      </aside>
      </div>
    </main>
  );
}
