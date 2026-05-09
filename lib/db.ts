import crypto from "node:crypto";
import { readPersistentJson, writePersistentJson } from "@/lib/persistent-store";

const DB_KEY = "flashreels:db:v1";
const DB_FILE = "db.json";

export type FlashReelsMode = "text_to_video" | "image_list_to_video";

export interface FlashReelsUser {
  id: string;
  email: string;
  displayName: string;
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
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface FlashReelsDatabase {
  version: 1;
  users: FlashReelsUser[];
  videos: FlashReelsVideo[];
}

const EMPTY_DB: FlashReelsDatabase = {
  version: 1,
  users: [],
  videos: [],
};

let writeQueue = Promise.resolve();

export async function readDb(): Promise<FlashReelsDatabase> {
  const parsed = await readPersistentJson<Partial<FlashReelsDatabase>>(DB_KEY, DB_FILE, EMPTY_DB);
  return {
    version: 1,
    users: Array.isArray(parsed.users) ? parsed.users : [],
    videos: Array.isArray(parsed.videos) ? parsed.videos : [],
  };
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
    createdAt: user.createdAt,
  };
}

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
