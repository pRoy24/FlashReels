import crypto from "node:crypto";
import os from "node:os";

import { apiError, trimTrailingSlash } from "@/lib/http";
import { getPersistenceStatus, readPersistentJson, writePersistentJson } from "@/lib/persistent-store";

const STORE_KEY = "flashreels:secrets:v1";
const STORE_FILE = "secrets.json";

type SecretName = "samsarApiKey" | "runwayApiKey";

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
  return ["FLASHREELS_RUNWAYML_API_KEY", "RUNWAYML_API_SECRET", "RUNWAY_API_KEY"];
}

export async function saveRuntimeKeys(payload: Record<string, unknown>) {
  const samsarApiKey = typeof payload.samsarApiKey === "string" ? payload.samsarApiKey.trim() : "";
  const runwayApiKey = typeof payload.runwayApiKey === "string" ? payload.runwayApiKey.trim() : "";

  if (!samsarApiKey && !runwayApiKey) {
    throw apiError("Provide at least one API key to save.");
  }

  const store = await readStore();
  store.keys = {
    ...store.keys,
    ...(samsarApiKey ? { samsarApiKey: encrypt(samsarApiKey) } : {}),
    ...(runwayApiKey ? { runwayApiKey: encrypt(runwayApiKey) } : {}),
  };
  store.updatedAt = new Date().toISOString();
  await writeStore(store);
  return getSetupStatus();
}

export async function getRuntimeKeys() {
  const store = await readStore();
  const samsarEnv = envValue(envNames("samsarApiKey"));
  const runwayEnv = envValue(envNames("runwayApiKey"));
  const samsarApiKey = samsarEnv.value || decrypt(store.keys.samsarApiKey);
  const runwayApiKey = runwayEnv.value || decrypt(store.keys.runwayApiKey);

  return {
    samsarApiKey,
    runwayApiKey,
    sources: {
      samsarApiKey: samsarEnv.value ? samsarEnv.source : samsarApiKey ? "encrypted_store" : "",
      runwayApiKey: runwayEnv.value ? runwayEnv.source : runwayApiKey ? "encrypted_store" : "",
    },
  };
}

export async function requireRuntimeKeys() {
  const keys = await getRuntimeKeys();
  if (!keys.samsarApiKey) {
    throw apiError("Samsar API key is not configured.", 412);
  }
  if (!keys.runwayApiKey) {
    throw apiError("RunwayML API key is not configured.", 412);
  }
  return keys;
}

export async function getSetupStatus() {
  const keys = await getRuntimeKeys();
  return {
    samsarConfigured: Boolean(keys.samsarApiKey),
    runwayConfigured: Boolean(keys.runwayApiKey),
    samsarSource: keys.sources.samsarApiKey,
    runwaySource: keys.sources.runwayApiKey,
    envVars: {
      samsar: envNames("samsarApiKey").slice(0, 1),
      runway: envNames("runwayApiKey").slice(0, 1),
    },
    persistence: getPersistenceStatus(),
    ready: Boolean(keys.samsarApiKey && keys.runwayApiKey),
  };
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
