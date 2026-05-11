import crypto from "node:crypto";
import os from "node:os";

import { getLocalEnvFileStatus, persistLocalEnvFile } from "@/lib/env-file";
import { apiError, getRequestOrigin, normalizeString, trimTrailingSlash } from "@/lib/http";
import { getPersistenceStatus, readPersistentJson, writePersistentJson } from "@/lib/persistent-store";

const STORE_KEY = "flashreels:secrets:v1";
const STORE_FILE = "secrets.json";
const ENCRYPTION_SEED_KEY = "flashreels:encryption-seed:v1";
const ENCRYPTION_SEED_FILE = "encryption-seed.json";
export const RUNTIME_KEYS_COOKIE_NAME = "flashreels_runtime_keys";
export const RUNTIME_KEYS_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

type SecretName = "samsarApiKey" | "runwayApiKey" | "serverSecret";

interface EncryptedSecret {
  iv: string;
  tag: string;
  value: string;
}

interface SecretStore {
  version: 1;
  updatedAt: string;
  keys: Partial<Record<SecretName, EncryptedSecret>>;
}

interface EncryptionSeedStore {
  version: 1;
  seed: string;
  createdAt: string;
}

interface RuntimeKeys {
  samsarApiKey: string;
  runwayApiKey: string;
  serverSecret: string;
  sources: Record<SecretName, string>;
}

interface SaveRuntimeKeysResult {
  status: ReturnType<typeof buildSetupStatus>;
  cookie?: {
    name: string;
    value: string;
    maxAge: number;
  };
}

const EMPTY_STORE: SecretStore = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  keys: {},
};

async function getPersistentEncryptionSeed() {
  const stored = await readPersistentJson<EncryptionSeedStore>(ENCRYPTION_SEED_KEY, ENCRYPTION_SEED_FILE, {
    version: 1,
    seed: "",
    createdAt: "",
  });
  if (stored.seed) {
    return stored.seed;
  }

  const nextSeed = {
    version: 1 as const,
    seed: crypto.randomBytes(32).toString("base64url"),
    createdAt: new Date().toISOString(),
  };
  await writePersistentJson(ENCRYPTION_SEED_KEY, ENCRYPTION_SEED_FILE, nextSeed);
  return nextSeed.seed;
}

async function getEncryptionKey() {
  const configuredSeed = process.env.FLASHREELS_SECRET || process.env.FLASHREELS_AUTH_SECRET;
  const seed = configuredSeed || (
    process.env.VERCEL === "1"
      ? await getPersistentEncryptionSeed()
      : `${os.hostname()}:${os.userInfo().username}:${process.cwd()}`
  );
  return crypto.createHash("sha256").update(seed).digest();
}

function getRuntimeCookieEncryptionKey() {
  const seed = process.env.FLASHREELS_AUTH_SECRET ||
    process.env.FLASHREELS_SECRET ||
    "flashreels-local-dev-auth-secret";
  return crypto.createHash("sha256").update(`runtime-cookie:${seed}`).digest();
}

function encrypt(value: string, key: Buffer): EncryptedSecret {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    value: encrypted.toString("base64url"),
  };
}

function decrypt(secret: EncryptedSecret | undefined, key: Buffer | null) {
  if (!secret) {
    return "";
  }
  if (!key) {
    return "";
  }
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(secret.iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(secret.tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.value, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

function parseCookies(header: string | null) {
  const result = new Map<string, string>();
  if (!header) {
    return result;
  }
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name) {
      result.set(name, decodeURIComponent(rest.join("=")));
    }
  }
  return result;
}

function normalizeStoredKeys(parsed: Partial<SecretStore> & { keys?: Record<string, unknown> }) {
  const legacyKeys = parsed.keys || {};
  const directKeys = legacyKeys as Partial<Record<SecretName, EncryptedSecret>>;
  return {
    ...(directKeys.samsarApiKey ? { samsarApiKey: directKeys.samsarApiKey } : {}),
    ...(directKeys.runwayApiKey ? { runwayApiKey: directKeys.runwayApiKey } : {}),
    ...(directKeys.serverSecret ? { serverSecret: directKeys.serverSecret } : {}),
  };
}

async function readStore(): Promise<SecretStore> {
  const parsed = await readPersistentJson<Partial<SecretStore> & { keys?: Record<string, unknown> }>(STORE_KEY, STORE_FILE, EMPTY_STORE);
  return {
    version: 1,
    updatedAt: parsed.updatedAt || new Date(0).toISOString(),
    keys: normalizeStoredKeys(parsed),
  };
}

async function writeStore(store: SecretStore) {
  await writePersistentJson(STORE_KEY, STORE_FILE, store);
}

function envValue(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return { value, source: name };
    }
  }
  return { value: "", source: "" };
}

function emptyRuntimeKeys(): RuntimeKeys {
  return {
    samsarApiKey: "",
    runwayApiKey: "",
    serverSecret: "",
    sources: {
      samsarApiKey: "",
      runwayApiKey: "",
      serverSecret: "",
    },
  };
}

function readRuntimeKeysCookie(request?: Request): RuntimeKeys {
  if (!request) {
    return emptyRuntimeKeys();
  }

  const cookie = parseCookies(request.headers.get("cookie")).get(RUNTIME_KEYS_COOKIE_NAME);
  if (!cookie) {
    return emptyRuntimeKeys();
  }

  try {
    const parsed = JSON.parse(Buffer.from(cookie, "base64url").toString("utf8")) as Partial<SecretStore>;
    const keys = normalizeStoredKeys(parsed);
    const encryptionKey = getRuntimeCookieEncryptionKey();
    const samsarApiKey = decrypt(keys.samsarApiKey, encryptionKey);
    const runwayApiKey = decrypt(keys.runwayApiKey, encryptionKey);
    const serverSecret = decrypt(keys.serverSecret, encryptionKey);
    return {
      samsarApiKey,
      runwayApiKey,
      serverSecret,
      sources: {
        samsarApiKey: samsarApiKey ? "browser_session" : "",
        runwayApiKey: runwayApiKey ? "browser_session" : "",
        serverSecret: serverSecret ? "browser_session" : "",
      },
    };
  } catch {
    return emptyRuntimeKeys();
  }
}

function serializeRuntimeKeysCookie(keys: Pick<RuntimeKeys, SecretName>) {
  const encryptionKey = getRuntimeCookieEncryptionKey();
  const store: SecretStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    keys: {
      ...(keys.samsarApiKey ? { samsarApiKey: encrypt(keys.samsarApiKey, encryptionKey) } : {}),
      ...(keys.runwayApiKey ? { runwayApiKey: encrypt(keys.runwayApiKey, encryptionKey) } : {}),
      ...(keys.serverSecret ? { serverSecret: encrypt(keys.serverSecret, encryptionKey) } : {}),
    },
  };
  return Buffer.from(JSON.stringify(store), "utf8").toString("base64url");
}

function envNames(secret: SecretName) {
  if (secret === "samsarApiKey") {
    return ["FLASHREELS_SAMSAR_API_KEY", "SAMSAR_API_KEY"];
  }
  if (secret === "serverSecret") {
    return ["FLASHREELS_SERVER_SECRET"];
  }
  return ["FLASHREELS_RUNWAYML_API_KEY", "RUNWAYML_API_SECRET", "RUNWAY_API_KEY"];
}

function validateServerSecret(secret: string) {
  if (secret.length < 24) {
    throw apiError("Server secret must be at least 24 characters.", 422);
  }
  if (/\s/.test(secret)) {
    throw apiError("Server secret must not contain whitespace.", 422);
  }

  const categories = [
    /[a-z]/.test(secret),
    /[A-Z]/.test(secret),
    /[0-9]/.test(secret),
    /[^A-Za-z0-9]/.test(secret),
  ].filter(Boolean).length;
  if (categories < 3) {
    throw apiError("Server secret must include at least three of: lowercase, uppercase, number, symbol.", 422);
  }
  if (/^(.)\1+$/.test(secret)) {
    throw apiError("Server secret is too repetitive.", 422);
  }
}

function shouldUseRuntimeKeysCookie() {
  const persistence = getPersistenceStatus();
  return process.env.VERCEL === "1" && !persistence.persistent;
}

function buildSetupStatus(keys: RuntimeKeys) {
  return {
    samsarConfigured: Boolean(keys.samsarApiKey),
    runwayConfigured: Boolean(keys.runwayApiKey),
    serverSecretConfigured: Boolean(keys.serverSecret),
    samsarSource: keys.sources.samsarApiKey,
    runwaySource: keys.sources.runwayApiKey,
    serverSecretSource: keys.sources.serverSecret,
    envVars: {
      samsar: envNames("samsarApiKey").slice(0, 1),
      runway: envNames("runwayApiKey").slice(0, 1),
      serverSecret: envNames("serverSecret"),
    },
    persistence: getPersistenceStatus(),
    envFile: getLocalEnvFileStatus(),
    publicBaseUrl: getConfiguredPublicBaseUrl(),
    ready: Boolean(keys.samsarApiKey),
  };
}

export async function saveRuntimeKeys(payload: Record<string, unknown>, request?: Request): Promise<SaveRuntimeKeysResult> {
  const samsarApiKey = normalizeString(payload.samsarApiKey);
  const runwayApiKey = normalizeString(payload.runwayApiKey);
  const serverSecret = normalizeString(payload.serverSecret);

  if (!samsarApiKey && !runwayApiKey && !serverSecret) {
    throw apiError("Provide at least one key or server secret to save.");
  }
  if (serverSecret) {
    validateServerSecret(serverSecret);
  }

  if (shouldUseRuntimeKeysCookie()) {
    const existing = readRuntimeKeysCookie(request);
    const nextKeys: RuntimeKeys = {
      samsarApiKey: samsarApiKey || existing.samsarApiKey,
      runwayApiKey: runwayApiKey || existing.runwayApiKey,
      serverSecret: serverSecret || existing.serverSecret,
      sources: {
        samsarApiKey: samsarApiKey || existing.samsarApiKey ? "browser_session" : "",
        runwayApiKey: runwayApiKey || existing.runwayApiKey ? "browser_session" : "",
        serverSecret: serverSecret || existing.serverSecret ? "browser_session" : "",
      },
    };
    return {
      status: buildSetupStatus(nextKeys),
      cookie: {
        name: RUNTIME_KEYS_COOKIE_NAME,
        value: serializeRuntimeKeysCookie(nextKeys),
        maxAge: RUNTIME_KEYS_COOKIE_MAX_AGE,
      },
    };
  }

  const encryptionKey = await getEncryptionKey();
  const store = await readStore();
  store.keys = {
    ...store.keys,
    ...(samsarApiKey ? { samsarApiKey: encrypt(samsarApiKey, encryptionKey) } : {}),
    ...(runwayApiKey ? { runwayApiKey: encrypt(runwayApiKey, encryptionKey) } : {}),
    ...(serverSecret ? { serverSecret: encrypt(serverSecret, encryptionKey) } : {}),
  };
  store.updatedAt = new Date().toISOString();
  await writeStore(store);
  await persistLocalEnvFile({ samsarApiKey, runwayApiKey, serverSecret });
  return { status: await getSetupStatus(request) };
}

export async function getRuntimeKeys(request?: Request): Promise<RuntimeKeys> {
  const store = await readStore();
  const samsarEnv = envValue(envNames("samsarApiKey"));
  const runwayEnv = envValue(envNames("runwayApiKey"));
  const serverSecretEnv = envValue(envNames("serverSecret"));
  const hasStoredSecrets = Boolean(store.keys.samsarApiKey || store.keys.runwayApiKey || store.keys.serverSecret);
  const encryptionKey = hasStoredSecrets ? await getEncryptionKey() : null;
  const samsarApiKey = samsarEnv.value || decrypt(store.keys.samsarApiKey, encryptionKey);
  const runwayApiKey = runwayEnv.value || decrypt(store.keys.runwayApiKey, encryptionKey);
  const serverSecret = serverSecretEnv.value || decrypt(store.keys.serverSecret, encryptionKey);
  const cookieKeys = readRuntimeKeysCookie(request);

  return {
    samsarApiKey: samsarApiKey || cookieKeys.samsarApiKey,
    runwayApiKey: runwayApiKey || cookieKeys.runwayApiKey,
    serverSecret: serverSecret || cookieKeys.serverSecret,
    sources: {
      samsarApiKey: samsarEnv.value ? samsarEnv.source : samsarApiKey ? "encrypted_store" : cookieKeys.sources.samsarApiKey,
      runwayApiKey: runwayEnv.value ? runwayEnv.source : runwayApiKey ? "encrypted_store" : cookieKeys.sources.runwayApiKey,
      serverSecret: serverSecretEnv.value ? serverSecretEnv.source : serverSecret ? "encrypted_store" : cookieKeys.sources.serverSecret,
    },
  };
}

export async function requireRuntimeKeys(request?: Request) {
  const keys = await getRuntimeKeys(request);
  if (!keys.samsarApiKey) {
    throw apiError("Samsar API key is not configured.", 412);
  }
  return keys;
}

export async function getSetupStatus(request?: Request) {
  return buildSetupStatus(await getRuntimeKeys(request));
}

export function getConfiguredPublicBaseUrl() {
  return trimTrailingSlash(process.env.FLASHREELS_PUBLIC_BASE_URL || "");
}

export function getAdapterBaseUrl(request: Request) {
  return getConfiguredPublicBaseUrl() || trimTrailingSlash(getRequestOrigin(request));
}

export function shouldUseCustomAdapters() {
  return process.env.FLASHREELS_ENABLE_CUSTOM_ADAPTERS === "true";
}

export function getSamsarSdkBaseUrl() {
  const root = trimTrailingSlash(process.env.SAMSAR_API_BASE_URL || "https://api.samsar.one");
  return root.endsWith("/v1") ? root : `${root}/v1`;
}

export function getRunwayBaseUrl() {
  return trimTrailingSlash(process.env.RUNWAY_API_BASE_URL || "https://api.dev.runwayml.com");
}

export function getRunwayVersion() {
  return process.env.RUNWAY_API_VERSION || "2024-11-06";
}
