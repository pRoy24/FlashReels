import crypto from "node:crypto";
import os from "node:os";

import { getLocalEnvFileStatus, persistLocalEnvFile } from "@/lib/env-file";
import { apiError, getRequestOrigin, normalizeString, trimTrailingSlash } from "@/lib/http";
import { getPersistenceStatus, readPersistentJson, writePersistentJson } from "@/lib/persistent-store";

const STORE_KEY = "flashreels:secrets:v1";
const STORE_FILE = "secrets.json";

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

const EMPTY_STORE: SecretStore = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  keys: {},
};

function getEncryptionKey() {
  const seed = (
    process.env.FLASHREELS_SECRET ||
    process.env.FLASHREELS_AUTH_SECRET ||
    `${os.hostname()}:${os.userInfo().username}:${process.cwd()}`
  );
  return crypto.createHash("sha256").update(seed).digest();
}

function hasStableEncryptionSeed() {
  return Boolean(process.env.FLASHREELS_SECRET || process.env.FLASHREELS_AUTH_SECRET);
}

function requireStableRemoteEncryptionSeed() {
  if (process.env.VERCEL === "1" && !hasStableEncryptionSeed()) {
    throw apiError("Set FLASHREELS_SECRET or FLASHREELS_AUTH_SECRET in Vercel before saving setup secrets.", 412);
  }
}

function encrypt(value: string): EncryptedSecret {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    value: encrypted.toString("base64url"),
  };
}

function decrypt(secret?: EncryptedSecret) {
  if (!secret) {
    return "";
  }
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
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

export async function saveRuntimeKeys(payload: Record<string, unknown>) {
  const samsarApiKey = normalizeString(payload.samsarApiKey);
  const runwayApiKey = normalizeString(payload.runwayApiKey);
  const serverSecret = normalizeString(payload.serverSecret);

  if (!samsarApiKey && !runwayApiKey && !serverSecret) {
    throw apiError("Provide at least one key or server secret to save.");
  }
  if (serverSecret) {
    validateServerSecret(serverSecret);
  }
  requireStableRemoteEncryptionSeed();

  const store = await readStore();
  store.keys = {
    ...store.keys,
    ...(samsarApiKey ? { samsarApiKey: encrypt(samsarApiKey) } : {}),
    ...(runwayApiKey ? { runwayApiKey: encrypt(runwayApiKey) } : {}),
    ...(serverSecret ? { serverSecret: encrypt(serverSecret) } : {}),
  };
  store.updatedAt = new Date().toISOString();
  await writeStore(store);
  await persistLocalEnvFile({ samsarApiKey, runwayApiKey, serverSecret });
  return getSetupStatus();
}

export async function getRuntimeKeys() {
  const store = await readStore();
  const samsarEnv = envValue(envNames("samsarApiKey"));
  const runwayEnv = envValue(envNames("runwayApiKey"));
  const serverSecretEnv = envValue(envNames("serverSecret"));
  const samsarApiKey = samsarEnv.value || decrypt(store.keys.samsarApiKey);
  const runwayApiKey = runwayEnv.value || decrypt(store.keys.runwayApiKey);
  const serverSecret = serverSecretEnv.value || decrypt(store.keys.serverSecret);

  return {
    samsarApiKey,
    runwayApiKey,
    serverSecret,
    sources: {
      samsarApiKey: samsarEnv.value ? samsarEnv.source : samsarApiKey ? "encrypted_store" : "",
      runwayApiKey: runwayEnv.value ? runwayEnv.source : runwayApiKey ? "encrypted_store" : "",
      serverSecret: serverSecretEnv.value ? serverSecretEnv.source : serverSecret ? "encrypted_store" : "",
    },
  };
}

export async function requireRuntimeKeys() {
  const keys = await getRuntimeKeys();
  if (!keys.samsarApiKey) {
    throw apiError("Samsar API key is not configured.", 412);
  }
  return keys;
}

export async function getSetupStatus() {
  const keys = await getRuntimeKeys();
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
