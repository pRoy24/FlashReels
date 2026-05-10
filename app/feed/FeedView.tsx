"use client";

import Link from "next/link";
import { ExternalLink, Film, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { FlashReelsFeedItem } from "@/lib/feed";

interface FeedViewProps {
  items: FlashReelsFeedItem[];
  focusedSlug?: string;
}

function formatPublishedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function FeedView({ items, focusedSlug }: FeedViewProps) {
  const [overlayVisible, setOverlayVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orderedItems = focusedSlug
    ? [...items].sort((a, b) => (a.slug === focusedSlug ? -1 : b.slug === focusedSlug ? 1 : 0))
    : items;

  function showOverlayTemporarily() {
    setOverlayVisible(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => setOverlayVisible(false), 1600);
  }

  useEffect(() => {
    showOverlayTemporarily();
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

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
          {orderedItems.map((item) => (
            <article className="publicFeedItem" key={item.id}>
              <div className="publicFeedVideoFrame">
                <video
                  src={item.videoUrl}
                  poster={item.posterUrl || undefined}
                  autoPlay
                  controls
                  loop
                  playsInline
                  preload="auto"
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
        </div>
      )}
    </main>
  );
}
