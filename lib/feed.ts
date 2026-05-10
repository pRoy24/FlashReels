import { createId, mutateDb, nowIso, readDb, type FlashReelsUser, type FlashReelsVideo } from "@/lib/db";
import { apiError } from "@/lib/http";

export interface FlashReelsFeedItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  videoUrl: string;
  posterUrl: string;
  authorName: string;
  publishedAt: string;
}

function normalizeTitle(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function cleanGenericJoinedTitle(title: string) {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (!/^joined reel:/i.test(normalized)) {
    return normalized;
  }

  const withoutPrefix = normalized.replace(/^joined reel:\s*/i, "");
  const parts = withoutPrefix
    .split(/\s+\+\s+/)
    .map((part) => part.replace(/^joined reel:\s*/i, "").trim())
    .filter(Boolean);
  const uniqueParts = Array.from(new Set(parts.map((part) => part.replace(/\s+/g, " "))));
  const genericParts = new Set([
    "avatar-regenerated reel",
    "footer-updated reel",
    "retranslated reel",
    "current",
  ]);
  const meaningfulParts = uniqueParts.filter((part) => !genericParts.has(part.toLowerCase()));

  if (meaningfulParts.length === 0) {
    return "Joined reel";
  }
  if (meaningfulParts.length === 1) {
    return meaningfulParts[0];
  }
  return `Joined reel: ${meaningfulParts.join(" + ")}`;
}

function getVideoTitle(video: FlashReelsVideo) {
  const title = normalizeTitle(video.feedTitle)
    || normalizeTitle(video.title)
    || normalizeTitle(video.prompt)
    || "Untitled FlashReel";
  return cleanGenericJoinedTitle(title);
}

function getFeedDescription(video: FlashReelsVideo) {
  const rawDescription = normalizeTitle(video.feedDescription)
    || normalizeTitle(video.prompt)
    || getVideoTitle(video);
  const description = cleanGenericJoinedTitle(rawDescription);
  return description.length > 180 ? `${description.slice(0, 177).trim()}...` : description;
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "flashreel";
}

function isImageUrl(value: string) {
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(value);
}

function getPosterUrl(video: FlashReelsVideo) {
  const posterUrl = normalizeTitle(video.feedPosterUrl);
  if (posterUrl) {
    return posterUrl;
  }
  const sourceUrl = normalizeTitle(video.sourceUrl);
  return sourceUrl && isImageUrl(sourceUrl) ? sourceUrl : "";
}

function makeUniqueSlug(videos: FlashReelsVideo[], title: string, videoId: string) {
  const base = `${slugify(title)}-${videoId.replace(/^vid_/, "").slice(0, 8)}`;
  let slug = base;
  let suffix = 2;
  const used = new Set(videos.map((video) => video.feedSlug).filter(Boolean));
  while (used.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

function isPublishable(video: FlashReelsVideo) {
  return Boolean(
    video.sourceUrl &&
    video.status?.toUpperCase() === "COMPLETED" &&
    !isImageUrl(video.sourceUrl),
  );
}

export function toFeedItem(video: FlashReelsVideo, user?: FlashReelsUser): FlashReelsFeedItem | null {
  if (!video.published || !video.feedSlug || !video.sourceUrl) {
    return null;
  }

  return {
    id: video.id,
    slug: video.feedSlug,
    title: getVideoTitle(video),
    description: getFeedDescription(video),
    videoUrl: video.sourceUrl,
    posterUrl: getPosterUrl(video),
    authorName: normalizeTitle(user?.displayName) || "FlashReels",
    publishedAt: video.publishedAt || video.updatedAt || video.createdAt,
  };
}

export async function listPublishedFeedItems() {
  const db = await readDb();
  return db.videos
    .map((video) => toFeedItem(video, db.users.find((user) => user.id === video.userId)))
    .filter((item): item is FlashReelsFeedItem => Boolean(item))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export async function findPublishedFeedItem(slug: string) {
  const db = await readDb();
  const video = db.videos.find((candidate) => candidate.published && candidate.feedSlug === slug);
  return video ? toFeedItem(video, db.users.find((user) => user.id === video.userId)) : null;
}

export async function publishLibraryVideo(userId: string, videoId: string) {
  return mutateDb((db) => {
    const video = db.videos.find((candidate) => candidate.id === videoId && candidate.userId === userId);
    if (!video) {
      throw apiError("Library video was not found.", 404);
    }
    if (!isPublishable(video)) {
      throw apiError("Only completed videos with a playable source URL can be published.");
    }

    const now = nowIso();
    const title = getVideoTitle(video);
    video.published = true;
    video.publishedAt = video.publishedAt || now;
    video.feedSlug = video.feedSlug || makeUniqueSlug(db.videos, title, video.id || createId("vid"));
    video.feedTitle = title;
    video.feedDescription = getFeedDescription(video);
    video.feedPosterUrl = getPosterUrl(video);
    video.updatedAt = now;

    const user = db.users.find((candidate) => candidate.id === userId);
    return {
      video,
      feed: toFeedItem(video, user),
    };
  });
}

export async function unpublishLibraryVideo(userId: string, videoId: string) {
  return mutateDb((db) => {
    const video = db.videos.find((candidate) => candidate.id === videoId && candidate.userId === userId);
    if (!video) {
      throw apiError("Library video was not found.", 404);
    }

    video.published = false;
    video.updatedAt = nowIso();

    return {
      video,
      feed: null,
    };
  });
}
