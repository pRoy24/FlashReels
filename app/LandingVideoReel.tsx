"use client";

import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Film,
  Home,
  Maximize2,
  Pause,
  Play,
  Volume2,
  VolumeX
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type { FlashReelsFeedItem } from "@/lib/feed";

interface LandingVideoReelProps {
  items: FlashReelsFeedItem[];
}

type VideoProgress = {
  currentTime: number;
  duration: number;
};

const DEFAULT_LANDING_VOLUME = 0.7;
const LANDING_VOLUME_STORAGE_KEY = "flashreels:landing-video-volume";

function formatPublishedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function normalizeVolume(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value || "");
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : DEFAULT_LANDING_VOLUME;
}

function formatVideoTime(value: number | undefined) {
  if (!value || !Number.isFinite(value)) {
    return "0:00";
  }
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function LandingVideoReel({ items }: LandingVideoReelProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_LANDING_VOLUME);
  const [progress, setProgress] = useState<Record<string, VideoProgress>>({});
  const [volumeOpen, setVolumeOpen] = useState(false);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const panelRefs = useRef<Record<string, HTMLElement | null>>({});
  const activeItem = items[activeIndex];
  const activeProgress = activeItem ? progress[activeItem.id] : undefined;
  const sliderProgress = activeProgress?.duration
    ? (activeProgress.currentTime / activeProgress.duration) * 100
    : 0;
  const volumeProgress = muted ? 0 : Math.round(volume * 100);
  const itemIds = useMemo(() => items.map((item) => item.id).join("|"), [items]);

  useEffect(() => {
    const storedVolume = normalizeVolume(window.localStorage.getItem(LANDING_VOLUME_STORAGE_KEY));
    setVolume(storedVolume);
    setMuted(storedVolume === 0);
  }, []);

  useEffect(() => {
    if (items.length === 0) {
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const nextId = visible?.target.getAttribute("data-landing-video-id") || "";
      if (nextId) {
        const nextIndex = items.findIndex((item) => item.id === nextId);
        if (nextIndex >= 0) {
          setActiveIndex(nextIndex);
          setPlaying(true);
          setVolumeOpen(false);
        }
      }
    }, { threshold: [0.52, 0.68, 0.84] });

    for (const item of items) {
      const node = panelRefs.current[item.id];
      if (node) {
        observer.observe(node);
      }
    }

    return () => observer.disconnect();
  }, [itemIds, items]);

  useEffect(() => {
    const currentId = activeItem?.id;
    for (const [id, video] of Object.entries(videoRefs.current)) {
      if (!video) {
        continue;
      }
      video.volume = volume;
      video.muted = muted || volume === 0;
      if (id === currentId && playing) {
        if (video.ended) {
          video.currentTime = 0;
        }
        video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    }
  }, [activeItem?.id, itemIds, muted, playing, volume]);

  function selectItem(index: number) {
    if (items.length === 0) {
      return;
    }
    const nextIndex = (index + items.length) % items.length;
    const nextItem = items[nextIndex];
    setActiveIndex(nextIndex);
    setPlaying(true);
    setVolumeOpen(false);
    panelRefs.current[nextItem.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleEnded(index: number) {
    if (items.length > 1) {
      selectItem(index + 1);
      return;
    }
    setPlaying(false);
  }

  function updateProgress(itemId: string, video: HTMLVideoElement) {
    setProgress((current) => ({
      ...current,
      [itemId]: {
        currentTime: video.currentTime || 0,
        duration: Number.isFinite(video.duration) ? video.duration : 0
      }
    }));
  }

  function togglePlay() {
    const video = activeItem ? videoRefs.current[activeItem.id] : null;
    if (playing) {
      video?.pause();
      setPlaying(false);
      return;
    }
    if (video?.ended) {
      video.currentTime = 0;
    }
    setPlaying(true);
    video?.play().catch(() => setPlaying(false));
  }

  function toggleMuted() {
    if (muted || volume === 0) {
      const nextVolume = volume > 0 ? volume : DEFAULT_LANDING_VOLUME;
      window.localStorage.setItem(LANDING_VOLUME_STORAGE_KEY, String(nextVolume));
      setVolume(nextVolume);
      setMuted(false);
      return;
    }
    setMuted(true);
  }

  function changeVolume(value: number) {
    const normalized = normalizeVolume(value);
    window.localStorage.setItem(LANDING_VOLUME_STORAGE_KEY, String(normalized));
    setVolume(normalized);
    setMuted(normalized === 0);
  }

  function seekActiveVideo(time: number) {
    if (!activeItem) {
      return;
    }
    const video = videoRefs.current[activeItem.id];
    if (!video || !Number.isFinite(time)) {
      return;
    }
    video.currentTime = Math.max(0, Math.min(time, video.duration || time));
    updateProgress(activeItem.id, video);
  }

  function openFullscreen() {
    if (!activeItem) {
      return;
    }
    const video = videoRefs.current[activeItem.id];
    const frame = video?.closest(".landingVideoFrame") as HTMLElement | null;
    const target = frame || video;
    target?.requestFullscreen?.().catch(() => undefined);
  }

  function scrollHome() {
    const shell = document.querySelector<HTMLElement>(".landingShell");
    if (shell) {
      shell.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      document.getElementById("top")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.history.replaceState(null, "", "#top");
  }

  return (
    <section className="landingVideoReel" id="published-reels" aria-label="Published FlashReels">
      {items.length === 0 ? (
        <div className="landingVideoEmpty">
          <Film size={32} />
          <h2>No published reels yet</h2>
          <p>Published videos from the project will appear here as fullscreen playback panels.</p>
          <button className="landingVideoHome" type="button" onClick={scrollHome}>
            <Home size={16} />
            Home
          </button>
        </div>
      ) : (
        items.map((item, index) => (
          <article
            className={`landingVideoScene ${item.id === activeItem?.id ? "active" : ""}`}
            data-landing-video-id={item.id}
            key={item.id}
            ref={(node) => {
              panelRefs.current[item.id] = node;
            }}
          >
            <div className="landingVideoFrame">
              <video
                src={item.videoUrl}
                poster={item.posterUrl || undefined}
                autoPlay={index === activeIndex && playing}
                muted={muted || volume === 0}
                loop={false}
                playsInline
                preload={index === activeIndex || index === activeIndex + 1 ? "auto" : "metadata"}
                ref={(node) => {
                  videoRefs.current[item.id] = node;
                }}
                onClick={togglePlay}
                onDurationChange={(event) => updateProgress(item.id, event.currentTarget)}
                onEnded={() => handleEnded(index)}
                onLoadedMetadata={(event) => updateProgress(item.id, event.currentTarget)}
                onPause={() => {
                  if (index === activeIndex) {
                    setPlaying(false);
                  }
                }}
                onPlay={() => {
                  if (index === activeIndex) {
                    setPlaying(true);
                  }
                }}
                onTimeUpdate={(event) => updateProgress(item.id, event.currentTarget)}
              />
            </div>
            <div className="landingVideoShade" aria-hidden="true" />
            <div className="landingVideoChrome">
              <div className="landingVideoLinks">
                <button className="landingVideoHome" type="button" onClick={scrollHome} aria-label="Back to FlashReels intro">
                  <Home size={16} />
                  Home
                </button>
                <Link className="landingVideoHome" href="/feed">
                  <Film size={16} />
                  Feed
                </Link>
                <Link className="landingVideoHome" href="/app">
                  <ExternalLink size={16} />
                  App
                </Link>
              </div>
              <div className="landingVideoCounter">
                {String(index + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
              </div>
            </div>
            <div className="landingVideoMeta">
              <p>{item.authorName}{formatPublishedDate(item.publishedAt) ? ` - ${formatPublishedDate(item.publishedAt)}` : ""}</p>
              <h2>{item.title}</h2>
              <span>{item.description}</span>
              <Link href={`/feed/${item.slug}`}>
                <ExternalLink size={15} />
                Open feed view
              </Link>
            </div>
            <div className="landingVideoControls" onPointerDown={(event) => event.stopPropagation()}>
              <button type="button" onClick={() => selectItem(activeIndex - 1)} title="Previous video" aria-label="Previous video">
                <ChevronUp size={19} />
              </button>
              <button type="button" onClick={togglePlay} title={playing ? "Pause" : "Play"} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <Pause size={19} /> : <Play size={19} />}
              </button>
              <div className={`landingVideoVolume ${volumeOpen ? "open" : ""}`}>
                <button
                  type="button"
                  onClick={() => {
                    toggleMuted();
                    setVolumeOpen((current) => !current);
                  }}
                  title="Volume"
                  aria-label="Volume"
                  aria-expanded={volumeOpen}
                >
                  {muted || volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}
                </button>
                {volumeOpen && (
                  <label className="landingVideoVolumePanel" title="Volume">
                    <input
                      aria-label="Volume"
                      max="100"
                      min="0"
                      onChange={(event) => changeVolume(Number(event.target.value) / 100)}
                      style={{ "--landing-video-volume": `${volumeProgress}%` } as CSSProperties}
                      type="range"
                      value={volumeProgress}
                    />
                  </label>
                )}
              </div>
              <button type="button" onClick={openFullscreen} title="Full screen" aria-label="Full screen">
                <Maximize2 size={19} />
              </button>
              <button type="button" onClick={() => selectItem(activeIndex + 1)} title="Next video" aria-label="Next video">
                <ChevronDown size={19} />
              </button>
            </div>
            <div className="landingVideoScrubber" onPointerDown={(event) => event.stopPropagation()}>
              <span>{formatVideoTime(activeProgress?.currentTime)}</span>
              <input
                aria-label="Seek video"
                max={activeProgress?.duration || 0}
                min="0"
                onChange={(event) => seekActiveVideo(Number(event.target.value))}
                style={{ "--landing-video-progress": `${sliderProgress}%` } as CSSProperties}
                type="range"
                value={activeProgress?.currentTime || 0}
              />
              <span>{formatVideoTime(activeProgress?.duration)}</span>
            </div>
          </article>
        ))
      )}
    </section>
  );
}
