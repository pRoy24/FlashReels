import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { FeedView } from "@/app/feed/FeedView";
import { findPublishedFeedItem, listPublishedFeedItems } from "@/lib/feed";

function getRequestOrigin(headersList: Headers) {
  const host = headersList.get("x-forwarded-host") || headersList.get("host") || "localhost:3000";
  const protocol = headersList.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const item = await findPublishedFeedItem(slug);
  if (!item) {
    return {};
  }
  const origin = getRequestOrigin(await headers());
  const pageUrl = `${origin}/feed/${item.slug}`;
  const ogImageUrl = `${origin}/api/feed/${item.slug}/og`;

  return {
    title: `${item.title} | FlashReels`,
    description: item.description,
    openGraph: {
      title: item.title,
      description: item.description,
      url: pageUrl,
      siteName: "FlashReels",
      type: "video.other",
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: item.title }],
      videos: [{ url: item.videoUrl }],
    },
    twitter: {
      card: "summary_large_image",
      title: item.title,
      description: item.description,
      images: [ogImageUrl],
    },
  };
}

export default async function FeedVideoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = await findPublishedFeedItem(slug);
  if (!item) {
    notFound();
  }
  const items = await listPublishedFeedItems();
  return <FeedView items={items.length ? items : [item]} focusedSlug={slug} />;
}
