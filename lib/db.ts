import crypto from "node:crypto";
import { readPersistentJson, writePersistentJson } from "@/lib/persistent-store";

const DB_KEY = "flashreels:db:v1";
const DB_FILE = "db.json";
const DB_SEED_ENV = "FLASHREELS_DB_SEED_B64";

export type FlashReelsMode = "image_list_to_video";

export interface FlashReelsUser {
  id: string;
  email: string;
  displayName: string;
  role?: "admin" | "user";
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlashReelsVideo {
  id: string;
  userId: string;
  title: string;
  mode: FlashReelsMode;
  prompt: string;
  sourceUrl: string;
  samsarRequestId?: string;
  samsarSessionId?: string;
  status: string;
  published?: boolean;
  publishedAt?: string;
  feedSlug?: string;
  feedTitle?: string;
  feedDescription?: string;
  feedPosterUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface FlashReelsDatabase {
  version: 1;
  users: FlashReelsUser[];
  videos: FlashReelsVideo[];
  whitelistEmails: string[];
}

const EMPTY_DB: FlashReelsDatabase = {
  version: 1,
  users: [],
  videos: [],
  whitelistEmails: [],
};

let writeQueue = Promise.resolve();

function parseSeededDb(): Partial<FlashReelsDatabase> {
  const encoded = process.env[DB_SEED_ENV];
  if (!encoded) {
    return EMPTY_DB;
  }

  try {
    const raw = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as Partial<FlashReelsDatabase>;
    return parsed && typeof parsed === "object" ? parsed : EMPTY_DB;
  } catch {
    return EMPTY_DB;
  }
}

function normalizeDb(parsed: Partial<FlashReelsDatabase>): FlashReelsDatabase {
  const seededWhitelist = parseEmailList(process.env.FLASHREELS_WHITELIST_EMAILS).concat(
    parseEmailList(process.env.FLASHREELS_ADMIN_EMAILS),
  );
  const whitelistEmails = Array.from(new Set([
    ...(Array.isArray(parsed.whitelistEmails) ? parsed.whitelistEmails.map(normalizeEmail) : []),
    ...seededWhitelist,
  ].filter(Boolean)));

  return {
    version: 1,
    users: Array.isArray(parsed.users) ? parsed.users : [],
    videos: Array.isArray(parsed.videos) ? parsed.videos : [],
    whitelistEmails,
  };
}

export async function readDb(): Promise<FlashReelsDatabase> {
  const parsed = await readPersistentJson<Partial<FlashReelsDatabase>>(DB_KEY, DB_FILE, EMPTY_DB);
  const normalized = normalizeDb(parsed);
  if (normalized.users.length === 0 && normalized.videos.length === 0) {
    return normalizeDb(parseSeededDb());
  }
  return normalized;
}

async function writeDb(db: FlashReelsDatabase) {
  await writePersistentJson(DB_KEY, DB_FILE, db);
}

export function mutateDb<T>(mutator: (db: FlashReelsDatabase) => T | Promise<T>): Promise<T> {
  const operation = writeQueue.then(async () => {
    const db = await readDb();
    const result = await mutator(db);
    await writeDb(db);
    return result;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function publicUser(user: FlashReelsUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role || "user",
    isAdmin: isAdminEmail(user.email) || user.role === "admin",
    createdAt: user.createdAt,
  };
}

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function parseEmailList(value: unknown) {
  if (typeof value !== "string") {
    return [];
  }
  return Array.from(new Set(value
    .split(/[\s,;]+/)
    .map(normalizeEmail)
    .filter((email) => email.includes("@"))));
}

export function isAdminEmail(email: string) {
  return parseEmailList(process.env.FLASHREELS_ADMIN_EMAILS).includes(normalizeEmail(email));
}
