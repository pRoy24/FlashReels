import { NextResponse } from "next/server";

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

export function jsonError(error: unknown, fallbackStatus = 500) {
  const status = typeof (error as { status?: unknown })?.status === "number"
    ? (error as { status: number }).status
    : fallbackStatus;
  const message = error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json({ message }, { status });
}

export function apiError(message: string, status = 400) {
  const error = new Error(message);
  (error as Error & { status: number }).status = status;
  return error;
}

export function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function getRequestOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  const host = request.headers.get("host");
  if (host) {
    const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

export function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
