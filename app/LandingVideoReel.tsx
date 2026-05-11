"use client";

import Link from "next/link";
import { ExternalLink, Film, Home } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { FlashReelsFeedItem } from "@/lib/feed";

interface LandingVideoReelProps {
  items: FlashReelsFeedItem[];
}

function formatPublishedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

export function LandingVideoReel({ items }: LandingVideoReelProps) {
  const [activeId, setActiveId] = useState(items[0]?.id || "");
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const panelRefs = useRef<Record<string, HTMLElement | null>>({});

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
        setActiveId(nextId);
      }
    }, { threshold: [0.52, 0.68, 0.84] });

    for (const item of items) {
      const node = panelRefs.current[item.id];
      if (node) {
        observer.observe(node);
      }
    }

    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    for (const [id, video] of Object.entries(videoRefs.current)) {
      if (!video) {
        continue;
      }
      video.muted = true;
      if (id === activeId) {
        video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    }
  }, [activeId, items]);

  return (
    <section className="landingVideoReel" id="published-reels" aria-label="Published FlashReels">
      {items.length === 0 ? (
        <div className="landingVideoEmpty">
          <Film size={32} />
          <h2>No published reels yet</h2>
          <p>Published videos from the project will appear here as fullscreen playback panels.</p>
          <Link href="#top">
            <Home size={16} />
            Home
          </Link>
        </div>
      ) : (
        items.map((item, index) => (
          <article
            className={`landingVideoScene ${item.id === activeId ? "active" : ""}`}
            data-landing-video-id={item.id}
            key={item.id}
            ref={(node) => {
              panelRefs.current[item.id] = node;
            }}
          >
            <video
              src={item.videoUrl}
              poster={item.posterUrl || undefined}
              autoPlay={index === 0}
              loop
              muted
              playsInline
              preload={index < 2 ? "auto" : "metadata"}
              ref={(node) => {
                videoRefs.current[item.id] = node;
              }}
            />
            <div className="landingVideoShade" aria-hidden="true" />
            <div className="landingVideoChrome">
              <Link className="landingVideoHome" href="#top" aria-label="Back to FlashReels intro">
                <Home size={16} />
                Home
              </Link>
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
          </article>
        ))
      )}
    </section>
  );
}
