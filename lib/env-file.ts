import { promises as fs } from "node:fs";
import path from "node:path";

type LocalEnvSecretName = "samsarApiKey" | "runwayApiKey" | "serverSecret";

const ENV_NAMES: Record<LocalEnvSecretName, string> = {
  samsarApiKey: "FLASHREELS_SAMSAR_API_KEY",
  runwayApiKey: "FLASHREELS_RUNWAYML_API_KEY",
  serverSecret: "FLASHREELS_SERVER_SECRET",
};

const DEFAULT_ENV_FILE = ".env.local";

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function booleanEnv(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function getEnvFileName() {
  return normalizeString(process.env.FLASHREELS_ENV_FILE) || DEFAULT_ENV_FILE;
}

function isSafeEnvFileName(fileName: string) {
  return (
    fileName.startsWith(".env") &&
    !fileName.includes("/") &&
    !fileName.includes("\\") &&
    !fileName.includes("..")
  );
}

function getEnvFileWritePolicy() {
  const fileName = getEnvFileName();
  if (!isSafeEnvFileName(fileName)) {
    return {
      fileName,
      writable: false,
      reason: "FLASHREELS_ENV_FILE must be a project-local .env* file name.",
    };
  }

  if (process.env.VERCEL === "1") {
    return {
      fileName,
      writable: false,
      reason: "Vercel deployments cannot persist runtime writes to env files; configure KV or Upstash.",
    };
  }

  const explicit = booleanEnv(process.env.FLASHREELS_WRITE_ENV_FILE);
  if (explicit === false) {
    return {
      fileName,
      writable: false,
      reason: "Local env-file writes are disabled by FLASHREELS_WRITE_ENV_FILE.",
    };
  }

  if (explicit === true || process.env.NODE_ENV !== "production") {
    return {
      fileName,
      writable: true,
      reason: "",
    };
  }

  return {
    fileName,
    writable: false,
    reason: "Env-file writes are disabled in production unless FLASHREELS_WRITE_ENV_FILE=1.",
  };
}

function formatEnvValue(value: string) {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/"/g, "\\\"")
    .replace(/\$/g, "\\$")}"`;
}

function upsertEnvLines(raw: string, values: Partial<Record<LocalEnvSecretName, string>>) {
  const entries = Object.entries(values)
    .map(([name, value]) => [ENV_NAMES[name as LocalEnvSecretName], normalizeString(value)] as const)
    .filter(([, value]) => value);

  if (!entries.length) {
    return raw;
  }

  const nextLines = raw ? raw.replace(/\r\n/g, "\n").split("\n") : [];
  const seen = new Set<string>();

  for (let index = 0; index < nextLines.length; index += 1) {
    const match = nextLines[index].match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) {
      continue;
    }

    const entry = entries.find(([key]) => key === match[1]);
    if (entry) {
      const [key, value] = entry;
      nextLines[index] = `${key}=${formatEnvValue(value)}`;
      seen.add(key);
    }
  }

  const missing = entries.filter(([key]) => !seen.has(key));
  if (missing.length) {
    if (nextLines.length && nextLines[nextLines.length - 1] !== "") {
      nextLines.push("");
    }
    for (const [key, value] of missing) {
      nextLines.push(`${key}=${formatEnvValue(value)}`);
    }
  }

  return `${nextLines.join("\n").replace(/\n*$/, "")}\n`;
}

export function getLocalEnvFileStatus() {
  const policy = getEnvFileWritePolicy();
  return {
    target: policy.fileName,
    writable: policy.writable,
    reason: policy.reason,
  };
}

export async function persistLocalEnvFile(values: Partial<Record<LocalEnvSecretName, string>>) {
  const policy = getEnvFileWritePolicy();
  if (!policy.writable) {
    return {
      ...getLocalEnvFileStatus(),
      updated: false,
    };
  }

  const filePath = path.join(process.cwd(), policy.fileName);
  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    raw = "";
  }

  const next = upsertEnvLines(raw, values);
  await fs.writeFile(filePath, next, { mode: 0o600 });

  for (const [name, value] of Object.entries(values)) {
    const envName = ENV_NAMES[name as LocalEnvSecretName];
    const normalized = normalizeString(value);
    if (normalized) {
      process.env[envName] = normalized;
    }
  }

  return {
    ...getLocalEnvFileStatus(),
    updated: true,
  };
}
