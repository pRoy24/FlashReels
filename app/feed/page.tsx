import type { Metadata } from "next";

import { FeedView } from "@/app/feed/FeedView";
import { listPublishedFeedItems } from "@/lib/feed";

export const metadata: Metadata = {
  title: "FlashReels Feed",
  description: "Public videos published from FlashReels.",
  openGraph: {
    title: "FlashReels Feed",
    description: "Public videos published from FlashReels.",
    type: "website",
  },
};

export default async function FeedPage() {
  const items = await listPublishedFeedItems();
  return <FeedView items={items} />;
}
