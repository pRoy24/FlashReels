"use client";

import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Film,
  Maximize2,
  Pause,
  Play,
  Share2,
  Volume2,
  VolumeX
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type { FlashReelsFeedItem } from "@/lib/feed";

interface FeedViewProps {
  items: FlashReelsFeedItem[];
  focusedSlug?: string;
}

type VideoProgress = {
  currentTime: number;
  duration: number;
};

const DEFAULT_FEED_VOLUME = 0.5;
const FEED_VOLUME_STORAGE_KEY = "flashreels:feed-video-volume";

function formatPublishedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function normalizeVolume(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value || "");
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : DEFAULT_FEED_VOLUME;
}

function formatVideoTime(value: number | undefined) {
  if (!value || !Number.isFinite(value)) {
    return "0:00";
  }
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function FeedView({ items, focusedSlug }: FeedViewProps) {
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(DEFAULT_FEED_VOLUME);
  const [progress, setProgress] = useState<Record<string, VideoProgress>>({});
  const [volumeOpen, setVolumeOpen] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const itemRefs = useRef<Record<string, HTMLElement | null>>({});
  const orderedItems = useMemo(
    () => focusedSlug
      ? [...items].sort((a, b) => (a.slug === focusedSlug ? -1 : b.slug === focusedSlug ? 1 : 0))
      : items,
    [focusedSlug, items]
  );
  const activeItem = orderedItems[activeIndex];

  function showOverlayTemporarily() {
    setOverlayVisible(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => setOverlayVisible(false), 1600);
  }

  useEffect(() => {
    const storedVolume = normalizeVolume(window.localStorage.getItem(FEED_VOLUME_STORAGE_KEY));
    setVolume(storedVolume);
    setMuted(storedVolume === 0);
    showOverlayTemporarily();
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setActiveIndex(0);
    setPlaying(true);
    setVolumeOpen(false);
  }, [focusedSlug, orderedItems.length]);

  useEffect(() => {
    if (orderedItems.length === 0) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const id = visible?.target.getAttribute("data-feed-id");
      const index = orderedItems.findIndex((item) => item.id === id);
      if (index >= 0) {
        setActiveIndex(index);
        setPlaying(true);
      }
    }, { threshold: [0.55, 0.72] });

    for (const item of orderedItems) {
      const node = itemRefs.current[item.id];
      if (node) {
        observer.observe(node);
      }
    }

    return () => observer.disconnect();
  }, [orderedItems]);

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
  }, [activeItem?.id, muted, orderedItems, playing, volume]);

  function selectItem(index: number) {
    if (orderedItems.length === 0) {
      return;
    }
    const nextIndex = (index + orderedItems.length) % orderedItems.length;
    const nextItem = orderedItems[nextIndex];
    setActiveIndex(nextIndex);
    setPlaying(true);
    setVolumeOpen(false);
    itemRefs.current[nextItem.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleEnded(index: number) {
    if (orderedItems.length > 1) {
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
      const nextVolume = volume > 0 ? volume : DEFAULT_FEED_VOLUME;
      window.localStorage.setItem(FEED_VOLUME_STORAGE_KEY, String(nextVolume));
      setVolume(nextVolume);
      setMuted(false);
      return;
    }
    setMuted(true);
  }

  function changeVolume(value: number) {
    const normalized = normalizeVolume(value);
    window.localStorage.setItem(FEED_VOLUME_STORAGE_KEY, String(normalized));
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
    const frame = video?.closest(".publicFeedVideoFrame") as HTMLElement | null;
    const target = frame || video;
    target?.requestFullscreen?.().catch(() => undefined);
  }

  const activeProgress = activeItem ? progress[activeItem.id] : undefined;
  const sliderProgress = activeProgress?.duration
    ? (activeProgress.currentTime / activeProgress.duration) * 100
    : 0;
  const volumeProgress = muted ? 0 : Math.round(volume * 100);

  return (
    <main
      className={`publicFeedShell ${overlayVisible ? "overlayVisible" : "overlayHidden"}`}
      onMouseMove={showOverlayTemporarily}
      onPointerDown={showOverlayTemporarily}
      onFocus={showOverlayTemporarily}
    >
      <header className="publicFeedHeader">
        <Link href="/" className="publicFeedBrand">
          <Film size={18} />
          FlashReels
        </Link>
        <Link href="/feed" className="publicFeedLink">All videos</Link>
      </header>
      {orderedItems.length === 0 ? (
        <section className="publicFeedEmpty">
          <Film size={34} />
          <h1>No published videos yet</h1>
          <p>Published FlashReels will appear here as a public feed.</p>
        </section>
      ) : (
        <div className="publicFeedTrack" aria-label="Published FlashReels feed">
          {orderedItems.map((item, index) => (
            <article
              className={`publicFeedItem ${index === activeIndex ? "active" : ""}`}
              data-feed-id={item.id}
              key={item.id}
              ref={(node) => {
                itemRefs.current[item.id] = node;
              }}
            >
              <div className="publicFeedVideoFrame">
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
              <div className="publicFeedMeta">
                <p>{item.authorName}{formatPublishedDate(item.publishedAt) ? ` - ${formatPublishedDate(item.publishedAt)}` : ""}</p>
                <h1>{item.title}</h1>
                <span>{item.description}</span>
                <div className="publicFeedActions">
                  <Link href={`/feed/${item.slug}`}>
                    <Share2 size={15} />
                    Share
                  </Link>
                  <a href={item.videoUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={15} />
                    Open video
                  </a>
                </div>
              </div>
            </article>
          ))}
          <div className="publicFeedControls" onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => selectItem(activeIndex - 1)} title="Previous video" aria-label="Previous video">
              <ChevronUp size={19} />
            </button>
            <button type="button" onClick={togglePlay} title={playing ? "Pause" : "Play"} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause size={19} /> : <Play size={19} />}
            </button>
            <div className={`publicFeedVolume ${volumeOpen ? "open" : ""}`}>
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
                <label className="publicFeedVolumePanel" title="Volume">
                  <input
                    aria-label="Volume"
                    max="100"
                    min="0"
                    onChange={(event) => changeVolume(Number(event.target.value) / 100)}
                    style={{ "--public-feed-volume": `${volumeProgress}%` } as CSSProperties}
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
          {activeItem && (
            <div className="publicFeedScrubber" onPointerDown={(event) => event.stopPropagation()}>
              <span>{formatVideoTime(activeProgress?.currentTime)}</span>
              <input
                aria-label="Seek video"
                max={activeProgress?.duration || 0}
                min="0"
                onChange={(event) => seekActiveVideo(Number(event.target.value))}
                style={{ "--public-feed-progress": `${sliderProgress}%` } as CSSProperties}
                type="range"
                value={activeProgress?.currentTime || 0}
              />
              <span>{formatVideoTime(activeProgress?.duration)}</span>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
