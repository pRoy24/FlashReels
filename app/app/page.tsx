"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleDashed,
  Database,
  Film,
  Image as ImageIcon,
  ImagePlus,
  KeyRound,
  Loader2,
  LogOut,
  Music,
  Play,
  RefreshCcw,
  Save,
  Trash2,
  Volume2,
  Wand2,
} from "lucide-react";

type EnvironmentName = "staging" | "production";
type Mode = "text_to_video" | "image_list_to_video";
type ApiRecord = Record<string, unknown>;

interface User {
  id: string;
  email: string;
  displayName: string;
}

interface SetupStatus {
  activeEnvironment: EnvironmentName;
  ready: boolean;
  persistence?: {
    provider: string;
    persistent: boolean;
    redisEnv?: {
      url?: string;
      token?: string;
    };
  };
  environments: Record<EnvironmentName, {
    samsarConfigured: boolean;
    runwayConfigured: boolean;
    samsarSource: string;
    runwaySource: string;
    envVars: {
      samsar: string[];
      runway: string[];
    };
  }>;
}

interface LibraryVideo {
  id: string;
  title: string;
  mode: Mode;
  prompt: string;
  environment: EnvironmentName;
  sourceUrl: string;
  status: string;
  createdAt: string;
}

const TEXT_PROMPT = "A precise cinematic launch reel for a new product, built with clean motion, premium lighting, and confident pacing.";
const IMAGE_PROMPT = "Create a cohesive video from these images with smooth movement, editorial pacing, and consistent visual tone.";
const STAGE_ORDER = [
  "prompt_generation",
  "image_generation",
  "speech_generation",
  "music_generation",
  "ai_video_generation",
  "lip_sync_generation",
  "sound_effect_generation",
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

function buildDetailedStatusUrl(requestId: string, environment: EnvironmentName) {
  return `/api/samsar/step/status-detailed?request_id=${encodeURIComponent(requestId)}&environment=${environment}`;
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
  const currentResources = getRecord(getRecord(status.current_step_resources).resources);
  const completed = getRecord(status.completed_step_resources);
  const finalResources = getRecord(getRecord(completed.video_generation).resources);
  return firstString(
    sessionResult.url,
    sessionResult.remoteURL,
    sessionResult.videoLink,
    finalResources.result_url,
    finalResources.remote_url,
    finalResources.video_link,
    currentResources.result_url,
    currentResources.remote_url,
    status.result_url,
    status.remoteURL,
    status.remote_url,
    status.video_url,
    status.videoLink,
  );
}

function parseImageUrls(value: string) {
  return value
    .split(/\n|,/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function collectMediaUrls(value: unknown, result = new Set<string>()) {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value) || value.startsWith("data:image/")) {
      result.add(value);
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
    if (!resource.url || seen.has(resource.url)) {
      return;
    }
    const statusValue = resource.status || getStageStatus(session, resource.stage);
    if (!isStageComplete(session, resource.stage, statusValue)) {
      return;
    }
    seen.add(resource.url);
    resources.push({
      ...resource,
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

  const resultUrl = firstString(getRecord(session.result).url);
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

  return resources.sort((a, b) => a.startTime - b.startTime || STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
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
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const environment = setup?.activeEnvironment || "staging";
  const envStatus = setup?.environments[environment];

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const nextSetup = await readApi<SetupStatus>("/api/setup", {
        method: "POST",
        body: JSON.stringify({
          environment,
          samsarApiKey,
          runwayApiKey,
          setActive: true,
        }),
      });
      setSamsarApiKey("");
      setRunwayApiKey("");
      onUpdated(nextSetup);
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : "Unable to save setup.");
    } finally {
      setSaving(false);
    }
  }

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
          <StatusPill ready={Boolean(envStatus?.samsarConfigured)} label="Samsar API key" source={envStatus?.samsarSource} />
          <StatusPill ready={Boolean(envStatus?.runwayConfigured)} label="RunwayML API key" source={envStatus?.runwaySource} />
          <StatusPill
            ready={Boolean(setup?.persistence?.persistent)}
            label={setup?.persistence?.persistent ? "Vercel Redis" : "Local fallback"}
            source={setup?.persistence?.redisEnv?.url || setup?.persistence?.provider}
          />
        </div>

        <label>
          <span>Samsar.one API key</span>
          <input
            type="password"
            value={samsarApiKey}
            onChange={(event) => setSamsarApiKey(event.target.value)}
            placeholder={envStatus?.samsarConfigured ? "Configured" : "Paste key"}
          />
        </label>
        <label>
          <span>RunwayML API key</span>
          <input
            type="password"
            value={runwayApiKey}
            onChange={(event) => setRunwayApiKey(event.target.value)}
            placeholder={envStatus?.runwayConfigured ? "Configured" : "Paste key"}
          />
        </label>

        {error ? <div className="errorBox">{error}</div> : null}

        <button className="primaryButton" onClick={submit} disabled={saving || (!samsarApiKey && !runwayApiKey)}>
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

function StagedVideoPreview({
  resource,
  timelineSeek,
}: {
  resource: StagePreviewResource;
  timelineSeek: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || resource.kind !== "video") {
      return;
    }
    const nextTime = Math.max(0, timelineSeek - resource.startTime);
    if (Number.isFinite(nextTime) && Math.abs(video.currentTime - nextTime) > 0.5) {
      video.currentTime = nextTime;
    }
  }, [resource, timelineSeek]);

  if (resource.kind === "image") {
    return <img src={resource.url} alt="" />;
  }

  if (resource.kind === "audio") {
    return (
      <div className="audioPreviewHero">
        <Music size={42} />
        <strong>{resource.label}</strong>
        <span>{formatTime(resource.startTime)} - {formatTime(resource.endTime)}</span>
        <audio src={resource.url} controls />
      </div>
    );
  }

  return (
    <video
      key={resource.url}
      ref={videoRef}
      src={resource.url}
      controls
      playsInline
      onLoadedMetadata={() => {
        const video = videoRef.current;
        if (video) {
          video.currentTime = Math.max(0, timelineSeek - resource.startTime);
        }
      }}
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
          <StagedVideoPreview resource={selectedResource} timelineSeek={timelineSeek} />
        ) : (
          <div className="emptyPreview">
            <Film size={30} />
            <span>{status ? "Waiting for a playable stage resource" : "No render loaded"}</span>
          </div>
        )}
      </div>

      <div className="timelinePreview">
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
          onChange={(event) => onTimelineSeek(Number(event.target.value))}
          aria-label="Seek preview timeline"
        />
        <div className="timelineMarkers">
          {resources.map((resource) => (
            <button
              key={resource.id}
              type="button"
              title={resource.label}
              style={{
                left: `${Math.min(100, Math.max(0, (resource.startTime / timelineDuration) * 100))}%`,
                width: `${Math.max(2, ((resource.endTime - resource.startTime) / timelineDuration) * 100)}%`,
              }}
              onClick={() => {
                onSelectResource(resource);
                onTimelineSeek(resource.startTime);
              }}
            />
          ))}
        </div>
      </div>

      <div className="resourceShelf" aria-label="Completed stage resources">
        {resources.length > 0 ? resources.map((resource) => (
          <button
            key={resource.id}
            type="button"
            className={`resourceTile ${selectedResource?.id === resource.id ? "active" : ""}`}
            onClick={() => {
              onSelectResource(resource);
              onTimelineSeek(resource.startTime);
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

      {resources.some((resource) => resource.kind === "audio") ? (
        <div className="audioShelf">
          {resources.filter((resource) => resource.kind === "audio").map((resource) => (
            <div className="audioTrack" key={`audio-${resource.id}`}>
              <div>
                <strong>{resource.label}</strong>
                <span>{formatStageLabel(resource.stage)} - {formatTime(resource.startTime)}-{formatTime(resource.endTime)}</span>
              </div>
              <audio src={resource.url} controls />
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

export default function FlashReelsApp() {
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [mode, setMode] = useState<Mode>("text_to_video");
  const [environment, setEnvironment] = useState<EnvironmentName>("staging");
  const [prompt, setPrompt] = useState(TEXT_PROMPT);
  const [imageUrls, setImageUrls] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [duration, setDuration] = useState(10);
  const [enableSubtitles, setEnableSubtitles] = useState(true);
  const [requestId, setRequestId] = useState("");
  const [status, setStatus] = useState<ApiRecord | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [library, setLibrary] = useState<LibraryVideo[]>([]);
  const [savedUrl, setSavedUrl] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState("");
  const [timelineSeek, setTimelineSeek] = useState(0);

  const parsedImageUrls = useMemo(() => parseImageUrls(imageUrls), [imageUrls]);
  const statusText = getStatusText(status);
  const finalVideoUrl = getFinalVideoUrl(status);
  const step = getRecord(status?.step);
  const waitingForNext = Boolean(step.waiting_for_process_next || status?.waiting_for_process_next);
  const nextStep = firstString(step.next_step, status?.next_step);
  const currentStep = firstString(step.current_step, status?.current_step);
  const terminal = ["FAILED", "CANCELED", "CANCELLED"].includes(statusText.toUpperCase());
  const canContinue = statusText.toUpperCase() === "COMPLETED" && waitingForNext && Boolean(nextStep);
  const completedBlocks = useMemo(() => {
    const completed = getRecord(status?.completed_step_resources);
    return STAGE_ORDER
      .map((key) => getRecord(completed[key]))
      .filter((block) => Object.keys(block).length > 0);
  }, [status]);
  const previewResources = useMemo(() => collectPreviewResources(status), [status]);
  const selectedResource = useMemo(() => {
    if (previewResources.length === 0) {
      return null;
    }
    return previewResources.find((resource) => resource.id === selectedResourceId)
      || previewResources.find((resource) => timelineSeek >= resource.startTime && timelineSeek <= resource.endTime)
      || previewResources[previewResources.length - 1];
  }, [previewResources, selectedResourceId, timelineSeek]);

  const loadLibrary = useCallback(async () => {
    if (!user) {
      return;
    }
    const data = await readApi<{ videos: LibraryVideo[] }>("/api/library");
    setLibrary(data.videos);
  }, [user]);

  const pollStatus = useCallback(async () => {
    if (!requestId) {
      return;
    }
    setPolling(true);
    try {
      const data = await readApi<ApiRecord>(
        buildDetailedStatusUrl(requestId, environment),
      );
      setStatus(data);
      setError("");
    } catch (pollError) {
      setError(pollError instanceof Error ? pollError.message : "Unable to poll status.");
    } finally {
      setPolling(false);
    }
  }, [environment, requestId]);

  useEffect(() => {
    async function boot() {
      try {
        const [setupData, authData] = await Promise.all([
          readApi<SetupStatus>("/api/setup"),
          readApi<{ user: User | null }>("/api/auth/me"),
        ]);
        setSetup(setupData);
        setEnvironment(setupData.activeEnvironment);
        setUser(authData.user);
      } finally {
        setBooting(false);
      }
    }
    boot();
  }, []);

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
    if (!previewResources.some((resource) => resource.id === selectedResourceId)) {
      const nextResource = previewResources[previewResources.length - 1];
      setSelectedResourceId(nextResource.id);
      setTimelineSeek(nextResource.startTime);
    }
  }, [previewResources, selectedResourceId]);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setPrompt(nextMode === "text_to_video" ? TEXT_PROMPT : IMAGE_PROMPT);
    setStatus(null);
    setRequestId("");
    setSavedUrl("");
    setSelectedResourceId("");
    setTimelineSeek(0);
    setError("");
  }

  async function startRender() {
    setBusy(true);
    setError("");
    setStatus(null);
    setRequestId("");
    setSavedUrl("");
    setSelectedResourceId("");
    setTimelineSeek(0);
    try {
      const data = await readApi<ApiRecord>("/api/samsar/step/start", {
        method: "POST",
        body: JSON.stringify({
          mode,
          prompt,
          imageUrls: parsedImageUrls,
          aspectRatio,
          duration,
          enableSubtitles,
          environment,
        }),
      });
      const nextRequestId = getRequestId(data);
      if (!nextRequestId) {
        throw new Error("Samsar did not return a request id.");
      }
      setStatus(data);
      setRequestId(nextRequestId);
      const detailedData = await readApi<ApiRecord>(buildDetailedStatusUrl(nextRequestId, environment));
      setStatus(detailedData);
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
        body: JSON.stringify({ request_id: requestId, environment }),
      });
      const detailedData = await readApi<ApiRecord>(buildDetailedStatusUrl(getRequestId(data) || requestId, environment));
      setStatus(detailedData);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to continue to next step.");
    } finally {
      setBusy(false);
    }
  }

  async function saveFinalVideo() {
    if (!finalVideoUrl) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await readApi<{ video: LibraryVideo }>("/api/library", {
        method: "POST",
        body: JSON.stringify({
          title: prompt.slice(0, 72),
          mode,
          prompt,
          environment,
          sourceUrl: finalVideoUrl,
          samsarRequestId: requestId,
          samsarSessionId: getRequestId(status),
          status: statusText,
          metadata: { stepStatus: status },
        }),
      });
      setSavedUrl(finalVideoUrl);
      await loadLibrary();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save video.");
    } finally {
      setBusy(false);
    }
  }

  async function removeVideo(videoId: string) {
    await readApi(`/api/library/${encodeURIComponent(videoId)}`, { method: "DELETE" });
    await loadLibrary();
  }

  async function logout() {
    await readApi("/api/auth/logout", { method: "POST" });
    setUser(null);
    setLibrary([]);
  }

  if (booting) {
    return (
      <main className="appShell centerShell">
        <Loader2 className="spin" />
      </main>
    );
  }

  if (!setup?.ready) {
    return <SetupWizard setup={setup} onUpdated={(nextSetup) => { setSetup(nextSetup); setEnvironment(nextSetup.activeEnvironment); }} />;
  }

  if (!user) {
    return <AuthGate onAuth={setUser} />;
  }

  return (
    <main className="appShell">
      <header className="appTopbar">
        <div className="brandBlock">
          <Film size={20} />
          <div>
            <strong>FlashReels</strong>
            <span>Step video studio</span>
          </div>
        </div>

        <div className="modePill" aria-label="Generation mode">
          <button className={mode === "text_to_video" ? "active" : ""} onClick={() => switchMode("text_to_video")}>
            <Wand2 size={15} />
            Text to video
          </button>
          <button className={mode === "image_list_to_video" ? "active" : ""} onClick={() => switchMode("image_list_to_video")}>
            <ImagePlus size={15} />
            Image list to video
          </button>
        </div>

        <div className="topbarActions">
          <div className={`statusBadge status-${statusText.toLowerCase()}`}>
            {polling ? <Loader2 className="spin" size={16} /> : <CircleDashed size={16} />}
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
              <p className="eyebrow">Step video route</p>
              <h1>{mode === "text_to_video" ? "Text to video" : "Image list to video"}</h1>
            </div>
          </header>

          <div className="studioGrid">
            <section className="controlPanel">
              <label>
                <span>Prompt</span>
                <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={7} />
              </label>

              {mode === "image_list_to_video" ? (
                <label>
                  <span>Image URLs</span>
                  <textarea
                    value={imageUrls}
                    onChange={(event) => setImageUrls(event.target.value)}
                    rows={7}
                    placeholder="https://example.com/shot-01.jpg&#10;https://example.com/shot-02.jpg"
                  />
                </label>
              ) : null}

              <div className="fieldGrid">
                <label>
                  <span>Aspect</span>
                  <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as "16:9" | "9:16")}>
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                  </select>
                </label>
                <label>
                  <span>Duration</span>
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={duration}
                    onChange={(event) => setDuration(Number(event.target.value))}
                  />
                </label>
              </div>

              <label className="checkRow">
                <input type="checkbox" checked={enableSubtitles} onChange={(event) => setEnableSubtitles(event.target.checked)} />
                <span>Subtitles</span>
              </label>

              {error ? <div className="errorBox">{error}</div> : null}

              <button
                className="primaryButton"
                onClick={startRender}
                disabled={busy || !prompt || (mode === "image_list_to_video" && parsedImageUrls.length === 0)}
              >
                {busy ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
                Start step render
              </button>
            </section>

            <section className="previewPanel">
              <div className="previewHeader">
                <div>
                  <p className="eyebrow">Current request</p>
                  <h2>{requestId || "Not started"}</h2>
                  <span>{currentStep || "Compose a request to begin"}</span>
                </div>
                <button className="iconButton" onClick={pollStatus} disabled={!requestId || polling} aria-label="Refresh status">
                  {polling ? <Loader2 className="spin" size={17} /> : <RefreshCcw size={17} />}
                </button>
              </div>

              <StagedPreviewPanel
                status={status}
                resources={previewResources}
                selectedResource={selectedResource}
                timelineSeek={timelineSeek}
                onTimelineSeek={setTimelineSeek}
                onSelectResource={(resource) => setSelectedResourceId(resource.id)}
              />

              <div className="actionRow">
                <button className="secondaryButton" onClick={processNext} disabled={!canContinue || busy}>
                  {busy ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />}
                  Continue to next step
                </button>
                <button className="secondaryButton" onClick={saveFinalVideo} disabled={!finalVideoUrl || savedUrl === finalVideoUrl || busy}>
                  <Save size={16} />
                  {finalVideoUrl && savedUrl === finalVideoUrl ? "Saved" : "Save render"}
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
          ) : library.map((video) => (
            <article className="libraryCard" key={video.id}>
              <video src={video.sourceUrl} muted playsInline />
              <div>
                <strong>{video.title}</strong>
                <span>{video.mode.replaceAll("_", " ")}</span>
              </div>
              <div className="libraryActions">
                <a href={video.sourceUrl} target="_blank" rel="noreferrer">Open</a>
                <button onClick={() => removeVideo(video.id)} aria-label="Delete saved video">
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </aside>
      </div>
    </main>
  );
}
