import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import { Redis } from "@upstash/redis";

import { apiError } from "@/lib/http";

const DATA_DIR = path.join(process.cwd(), ".flashreels");
const REDIS_TIMEOUT_MS = 5000;

type RedisRestConfig = {
  kind: "rest";
  url: string;
  token: string;
  urlEnv: string;
  tokenEnv: string;
};

type RedisUrlConfig = {
  kind: "url";
  url: string;
  urlEnv: string;
};

type RedisConfig = RedisRestConfig | RedisUrlConfig;

type RedisClient = {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<unknown>;
};

type RespValue = string | number | null | RespValue[];

let redis: RedisClient | null | undefined;

function envValue(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return { name, value };
    }
  }
  return null;
}

function getRedisConfig() {
  const restPairs = [
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
    ["REDIS_REST_API_URL", "REDIS_REST_API_TOKEN"],
    ["VERCEL_REDIS_REST_API_URL", "VERCEL_REDIS_REST_API_TOKEN"],
  ] as const;

  for (const [urlName, tokenName] of restPairs) {
    const url = process.env[urlName]?.trim();
    const token = process.env[tokenName]?.trim();
    if (url && token) {
      return { kind: "rest", url, token, urlEnv: urlName, tokenEnv: tokenName } satisfies RedisRestConfig;
    }
  }

  const redisUrl = envValue(["REDIS_URL", "KV_URL", "REDISCLOUD_URL", "REDIS_TLS_URL"]);
  if (redisUrl) {
    return { kind: "url", url: redisUrl.value, urlEnv: redisUrl.name } satisfies RedisUrlConfig;
  }

  const host = envValue(["REDIS_HOST", "REDIS_ENDPOINT"]);
  if (host) {
    const port = envValue(["REDIS_PORT"])?.value || "6379";
    const username = envValue(["REDIS_USERNAME"])?.value || "";
    const password = envValue(["REDIS_PASSWORD"])?.value || "";
    const protocol = process.env.REDIS_TLS === "1" || process.env.REDIS_TLS === "true" ? "rediss" : "redis";
    const auth = password
      ? `${username ? encodeURIComponent(username) : ""}:${encodeURIComponent(password)}@`
      : "";
    return {
      kind: "url",
      url: `${protocol}://${auth}${host.value}:${port}`,
      urlEnv: `${host.name}+REDIS_PORT`,
    } satisfies RedisUrlConfig;
  }

  return null;
}

function getRedis() {
  if (redis !== undefined) {
    return redis;
  }
  const config = getRedisConfig();
  redis = config ? createRedisClient(config) : null;
  return redis;
}

function createRedisClient(config: RedisConfig): RedisClient {
  if (config.kind === "rest") {
    return new Redis({ url: config.url, token: config.token });
  }
  return new RedisUrlClient(config.url);
}

class RedisUrlClient implements RedisClient {
  constructor(private readonly redisUrl: string) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await this.run(["GET", key]);
    if (value === null) {
      return null;
    }
    if (typeof value !== "string") {
      return value as T;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  async set<T>(key: string, value: T): Promise<unknown> {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    return this.run(["SET", key, serialized]);
  }

  private async run(command: string[]) {
    const url = new URL(this.redisUrl);
    const commands: string[][] = [];
    const username = decodeURIComponent(url.username || "");
    const password = decodeURIComponent(url.password || "");
    const database = url.pathname.replace(/^\/+/, "");

    if (password) {
      commands.push(username ? ["AUTH", username, password] : ["AUTH", password]);
    }
    if (database) {
      commands.push(["SELECT", database]);
    }
    commands.push(command);

    const responses = await sendRedisCommands(url, commands);
    return responses[responses.length - 1];
  }
}

function sendRedisCommands(url: URL, commands: string[][]): Promise<RespValue[]> {
  return new Promise((resolve, reject) => {
    const port = Number(url.port || (url.protocol === "rediss:" ? 6380 : 6379));
    const host = url.hostname;
    const socket = url.protocol === "rediss:"
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });
    const responses: RespValue[] = [];
    let buffer = Buffer.alloc(0);
    let settled = false;

    const timeout = setTimeout(() => {
      fail(new Error(`Redis command timed out after ${Math.round(REDIS_TIMEOUT_MS / 1000)}s.`));
    }, REDIS_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeout);
      socket.removeAllListeners();
      socket.destroy();
    }

    function fail(error: unknown) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    }

    socket.once(url.protocol === "rediss:" ? "secureConnect" : "connect", () => {
      socket.write(Buffer.concat(commands.map(encodeRedisCommand)));
    });
    socket.on("data", (chunk) => {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      buffer = Buffer.concat([buffer, data]);
      try {
        while (responses.length < commands.length) {
          const parsed = parseResp(buffer);
          if (!parsed) {
            return;
          }
          responses.push(parsed.value);
          buffer = buffer.subarray(parsed.bytes);
        }
        if (!settled) {
          settled = true;
          cleanup();
          resolve(responses);
        }
      } catch (error) {
        fail(error);
      }
    });
    socket.once("error", fail);
  });
}

function encodeRedisCommand(args: string[]) {
  return Buffer.concat([
    Buffer.from(`*${args.length}\r\n`),
    ...args.flatMap((arg) => {
      const value = Buffer.from(arg);
      return [Buffer.from(`$${value.length}\r\n`), value, Buffer.from("\r\n")];
    }),
  ]);
}

function parseResp(buffer: Buffer): { value: RespValue; bytes: number } | null {
  if (buffer.length < 1) {
    return null;
  }
  const prefix = String.fromCharCode(buffer[0]);
  const lineEnd = buffer.indexOf("\r\n");
  if (lineEnd === -1) {
    return null;
  }
  const line = buffer.subarray(1, lineEnd).toString();
  const bodyStart = lineEnd + 2;

  if (prefix === "+") {
    return { value: line, bytes: bodyStart };
  }
  if (prefix === "-") {
    throw new Error(`Redis error: ${line}`);
  }
  if (prefix === ":") {
    return { value: Number(line), bytes: bodyStart };
  }
  if (prefix === "$") {
    const length = Number(line);
    if (length === -1) {
      return { value: null, bytes: bodyStart };
    }
    const end = bodyStart + length;
    if (buffer.length < end + 2) {
      return null;
    }
    return {
      value: buffer.subarray(bodyStart, end).toString(),
      bytes: end + 2,
    };
  }
  if (prefix === "*") {
    const count = Number(line);
    if (count === -1) {
      return { value: null, bytes: bodyStart };
    }
    const values: RespValue[] = [];
    let offset = bodyStart;
    for (let index = 0; index < count; index += 1) {
      const parsed = parseResp(buffer.subarray(offset));
      if (!parsed) {
        return null;
      }
      values.push(parsed.value);
      offset += parsed.bytes;
    }
    return { value: values, bytes: offset };
  }

  throw new Error(`Unsupported Redis response type: ${prefix}`);
}

function isVercelDeployment() {
  return process.env.VERCEL === "1";
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
  if (isVercelDeployment()) {
    return fallback;
  }
  return readLocalJson(fileName, fallback);
}

export async function writePersistentJson<T>(key: string, fileName: string, value: T) {
  const client = getRedis();
  if (client) {
    await client.set(key, value);
    return;
  }
  if (isVercelDeployment()) {
    throw apiError("Persistent storage is not configured. Connect Vercel Redis/Upstash Redis so REDIS_URL, KV_REST_API_URL/KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN is available, or set FLASHREELS_SAMSAR_API_KEY directly in Vercel environment variables.", 412);
  }
  await writeLocalJson(fileName, value);
}

export function getPersistenceStatus() {
  const config = getRedisConfig();
  const vercel = isVercelDeployment();
  return {
    provider: config ? config.kind === "rest" ? "redis-rest" : "redis-url" : "local-file",
    persistent: Boolean(config) || !vercel,
    remoteSafe: Boolean(config),
    reason: config
      ? "Secrets and library data are stored in Redis."
      : vercel
        ? "Connect Vercel Redis/Upstash Redis and redeploy so REDIS_URL or Redis REST env vars are available, or set FLASHREELS_SAMSAR_API_KEY as a Vercel environment variable."
        : "Secrets and library data are stored in the local .flashreels directory.",
    redisEnv: {
      url: config?.kind === "rest" ? config.urlEnv : config?.kind === "url" ? config.urlEnv : "",
      token: config?.kind === "rest" ? config.tokenEnv : "",
    },
  };
}
