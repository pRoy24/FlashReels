import { NextResponse } from "next/server";

import { findPublishedFeedItem } from "@/lib/feed";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(value: string, maxChars = 30) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length === 3) {
      break;
    }
  }
  if (current && lines.length < 4) {
    lines.push(current);
  }
  return lines.slice(0, 4);
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = await findPublishedFeedItem(slug);
  if (!item) {
    return new NextResponse("Not found", { status: 404 });
  }

  const titleLines = wrapText(item.title);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#101113"/>
  <rect x="80" y="72" width="1040" height="486" rx="28" fill="#f5f1e8"/>
  <rect x="112" y="104" width="362" height="422" rx="18" fill="#1b1f24"/>
  <circle cx="293" cy="315" r="72" fill="#ff4f38"/>
  <polygon points="276,274 276,356 344,315" fill="#f5f1e8"/>
  <text x="528" y="178" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="700" fill="#ff4f38">FlashReels Feed</text>
  ${titleLines.map((line, index) => (
    `<text x="528" y="${258 + (index * 68)}" font-family="Inter, Arial, sans-serif" font-size="56" font-weight="800" fill="#101113">${escapeXml(line)}</text>`
  )).join("")}
  <text x="528" y="510" font-family="Inter, Arial, sans-serif" font-size="28" fill="#5d6570">by ${escapeXml(item.authorName)}</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
