import crypto from "node:crypto";
import os from "node:os";

import { apiError, normalizeString, trimTrailingSlash } from "@/lib/http";
import type { FlashReelsEnvironment } from "@/lib/db";
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
  activeEnvironment: FlashReelsEnvironment;
  updatedAt: string;
  keys: Record<FlashReelsEnvironment, Partial<Record<SecretName, EncryptedSecret>>>;
}

const EMPTY_STORE: SecretStore = {
  version: 1,
  activeEnvironment: "staging",
  updatedAt: new Date(0).toISOString(),
  keys: {
    staging: {},
    production: {},
  },
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

function normalizeEnvironment(value: unknown): FlashReelsEnvironment {
  return normalizeString(value) === "production" ? "production" : "staging";
}

async function readStore(): Promise<SecretStore> {
  const parsed = await readPersistentJson<Partial<SecretStore>>(STORE_KEY, STORE_FILE, EMPTY_STORE);
  return {
    version: 1,
    activeEnvironment: normalizeEnvironment(parsed.activeEnvironment || process.env.FLASHREELS_ACTIVE_ENV),
    updatedAt: parsed.updatedAt || new Date(0).toISOString(),
    keys: {
      staging: parsed.keys?.staging || {},
      production: parsed.keys?.production || {},
    },
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

function envNames(environment: FlashReelsEnvironment, secret: SecretName) {
  if (secret === "samsarApiKey") {
    return environment === "production"
      ? ["FLASHREELS_PRODUCTION_SAMSAR_API_KEY", "SAMSAR_PRODUCTION_API_KEY", "SAMSAR_API_KEY"]
      : ["FLASHREELS_STAGING_SAMSAR_API_KEY", "SAMSAR_STAGING_API_KEY", "SAMSAR_API_KEY"];
  }

  return environment === "production"
    ? ["FLASHREELS_PRODUCTION_RUNWAYML_API_KEY", "RUNWAYML_PRODUCTION_API_SECRET", "RUNWAYML_API_SECRET", "RUNWAY_API_KEY"]
    : ["FLASHREELS_STAGING_RUNWAYML_API_KEY", "RUNWAYML_STAGING_API_SECRET", "RUNWAYML_API_SECRET", "RUNWAY_API_KEY"];
}

export async function saveRuntimeKeys(payload: Record<string, unknown>) {
  const environment = normalizeEnvironment(payload.environment);
  const samsarApiKey = normalizeString(payload.samsarApiKey);
  const runwayApiKey = normalizeString(payload.runwayApiKey);
  const setActive = payload.setActive !== false;

  if (!samsarApiKey && !runwayApiKey) {
    throw apiError("Provide at least one API key to save.");
  }

  const store = await readStore();
  store.keys[environment] = {
    ...store.keys[environment],
    ...(samsarApiKey ? { samsarApiKey: encrypt(samsarApiKey) } : {}),
    ...(runwayApiKey ? { runwayApiKey: encrypt(runwayApiKey) } : {}),
  };
  if (setActive) {
    store.activeEnvironment = environment;
  }
  store.updatedAt = new Date().toISOString();
  await writeStore(store);
  return getSetupStatus();
}

export async function setActiveEnvironment(environmentValue: unknown) {
  const environment = normalizeEnvironment(environmentValue);
  const store = await readStore();
  store.activeEnvironment = environment;
  store.updatedAt = new Date().toISOString();
  await writeStore(store);
  return environment;
}

export async function getActiveEnvironment() {
  const fromEnv = normalizeString(process.env.FLASHREELS_ACTIVE_ENV);
  if (fromEnv === "staging" || fromEnv === "production") {
    return fromEnv;
  }
  return (await readStore()).activeEnvironment;
}

export async function getRuntimeKeys(environmentValue?: unknown) {
  const environment = environmentValue ? normalizeEnvironment(environmentValue) : await getActiveEnvironment();
  const store = await readStore();
  const samsarEnv = envValue(envNames(environment, "samsarApiKey"));
  const runwayEnv = envValue(envNames(environment, "runwayApiKey"));
  const samsarApiKey = samsarEnv.value || decrypt(store.keys[environment].samsarApiKey);
  const runwayApiKey = runwayEnv.value || decrypt(store.keys[environment].runwayApiKey);

  return {
    environment,
    samsarApiKey,
    runwayApiKey,
    sources: {
      samsarApiKey: samsarEnv.value ? samsarEnv.source : samsarApiKey ? "encrypted_store" : "",
      runwayApiKey: runwayEnv.value ? runwayEnv.source : runwayApiKey ? "encrypted_store" : "",
    },
  };
}

export async function requireRuntimeKeys(environmentValue?: unknown) {
  const keys = await getRuntimeKeys(environmentValue);
  if (!keys.samsarApiKey) {
    throw apiError(`Samsar API key is not configured for ${keys.environment}.`, 412);
  }
  if (!keys.runwayApiKey) {
    throw apiError(`RunwayML API key is not configured for ${keys.environment}.`, 412);
  }
  return keys;
}

export async function getSetupStatus() {
  const activeEnvironment = await getActiveEnvironment();
  const environments: Record<FlashReelsEnvironment, {
    samsarConfigured: boolean;
    runwayConfigured: boolean;
    samsarSource: string;
    runwaySource: string;
    envVars: {
      samsar: string[];
      runway: string[];
    };
  }> = {
    staging: {
      samsarConfigured: false,
      runwayConfigured: false,
      samsarSource: "",
      runwaySource: "",
      envVars: {
        samsar: envNames("staging", "samsarApiKey"),
        runway: envNames("staging", "runwayApiKey"),
      },
    },
    production: {
      samsarConfigured: false,
      runwayConfigured: false,
      samsarSource: "",
      runwaySource: "",
      envVars: {
        samsar: envNames("production", "samsarApiKey"),
        runway: envNames("production", "runwayApiKey"),
      },
    },
  };

  for (const environment of ["staging", "production"] as const) {
    const keys = await getRuntimeKeys(environment);
    environments[environment].samsarConfigured = Boolean(keys.samsarApiKey);
    environments[environment].runwayConfigured = Boolean(keys.runwayApiKey);
    environments[environment].samsarSource = keys.sources.samsarApiKey;
    environments[environment].runwaySource = keys.sources.runwayApiKey;
  }

  return {
    activeEnvironment,
    environments,
    persistence: getPersistenceStatus(),
    ready: environments[activeEnvironment].samsarConfigured && environments[activeEnvironment].runwayConfigured,
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
