import { promises as fs } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";

const DATA_DIR = path.join(process.cwd(), ".flashreels");

let redis: Redis | null | undefined;

function getRedisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
  if (!url || !token) {
    return null;
  }
  return { url, token };
}

function getRedis() {
  if (redis !== undefined) {
    return redis;
  }
  const config = getRedisConfig();
  redis = config ? new Redis(config) : null;
  return redis;
}

async function readLocalJson<T>(fileName: string, fallback: T): Promise<T> {
  const filePath = path.join(DATA_DIR, fileName);
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw || "null") ?? fallback;
  } catch {
    await fs.writeFile(filePath, `${JSON.stringify(fallback, null, 2)}\n`, { mode: 0o600 });
    return fallback;
  }
}

async function writeLocalJson<T>(fileName: string, value: T) {
  const filePath = path.join(DATA_DIR, fileName);
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

export async function readPersistentJson<T>(key: string, fileName: string, fallback: T): Promise<T> {
  const client = getRedis();
  if (client) {
    const value = await client.get<T>(key);
    return value ?? fallback;
  }
  return readLocalJson(fileName, fallback);
}

export async function writePersistentJson<T>(key: string, fileName: string, value: T) {
  const client = getRedis();
  if (client) {
    await client.set(key, value);
    return;
  }
  await writeLocalJson(fileName, value);
}

export function getPersistenceStatus() {
  const config = getRedisConfig();
  return {
    provider: config ? "vercel-redis" : "local-file",
    persistent: Boolean(config),
    redisEnv: {
      url: process.env.KV_REST_API_URL
        ? "KV_REST_API_URL"
        : process.env.UPSTASH_REDIS_REST_URL
          ? "UPSTASH_REDIS_REST_URL"
          : "",
      token: process.env.KV_REST_API_TOKEN
        ? "KV_REST_API_TOKEN"
        : process.env.UPSTASH_REDIS_REST_TOKEN
          ? "UPSTASH_REDIS_REST_TOKEN"
          : "",
    },
  };
}
