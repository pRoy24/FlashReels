#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, chmodSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import { Redis } from "@upstash/redis";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultConfigPath = path.join(repoRoot, "deploy.json");
const DB_KEY = "flashreels:db:v1";
const DEFAULT_DB_PATH = path.join(repoRoot, ".flashreels", "db.json");
const REDIS_REST_PAIRS = [
  ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ["REDIS_REST_API_URL", "REDIS_REST_API_TOKEN"],
  ["VERCEL_REDIS_REST_API_URL", "VERCEL_REDIS_REST_API_TOKEN"],
  ["REDIS_REST_URL", "REDIS_REST_TOKEN"],
  ["REDIS_API_URL", "REDIS_API_TOKEN"],
];
const REDIS_URL_ENV_KEYS = [
  "REDIS_URL",
  "KV_URL",
  "REDISCLOUD_URL",
  "REDIS_TLS_URL",
  "REDIS_URI",
  "REDIS_DATABASE_URL",
  "REDIS_CONNECTION_STRING",
  "VERCEL_REDIS_URL",
];
const REDIS_TIMEOUT_MS = 10000;

async function main() {
  const { targetName, options } = parseArgs(process.argv.slice(2));
  const config = readJson(options.config || defaultConfigPath);
  const target = resolveTarget(config, targetName);
  const scope = options.scope || process.env.VERCEL_SCOPE || process.env.VERCEL_TEAM || config.vercel?.defaultScope || "";
  const project = options.project || process.env.VERCEL_PROJECT || config.vercel?.defaultProject || "";
  const token = readToken();
  const db = readDb(options.dbFile || DEFAULT_DB_PATH);

  console.log("FlashReels production data migration");
  console.log(`target: ${targetName} -> Vercel ${target.environment}`);
  console.log(`project: ${scope || "(active scope)"}/${project || "(linked project)"}`);
  console.log(`source DB: ${path.relative(repoRoot, options.dbFile || DEFAULT_DB_PATH)}`);
  console.log(`records: ${db.users.length} users, ${db.videos.length} videos, ${db.whitelistEmails.length} whitelist emails`);

  if (options.dryRun) {
    console.log(`Would write Redis key ${DB_KEY}.`);
    return;
  }

  const env = pullVercelEnv({ target, token, options });
  const redisConfig = getRedisConfig(env);
  if (!redisConfig) {
    fail(
      "No writable Redis env was found in pulled Vercel env. " +
        "Run npm run deploy:setup:production, wait for Vercel to attach REDIS_URL or Redis REST vars, then rerun this migration.",
    );
  }

  console.log(`Redis: using ${redisConfig.kind === "rest" ? `${redisConfig.urlEnv}/${redisConfig.tokenEnv}` : redisConfig.urlEnv}.`);
  const redis = createRedisClient(redisConfig);
  await redis.set(DB_KEY, db);
  const saved = await redis.get(DB_KEY);
  const savedDb = normalizeDb(saved);
  if (savedDb.users.length !== db.users.length || savedDb.videos.length !== db.videos.length) {
    fail(
      `Redis read-back mismatch after write. Expected ${db.users.length} users/${db.videos.length} videos, ` +
        `got ${savedDb.users.length} users/${savedDb.videos.length} videos.`,
    );
  }

  console.log(`Production Redis updated: ${DB_KEY}`);
  console.log("Redeploy production if it has not already been redeployed after Redis was attached.");
}

function parseArgs(args) {
  const options = {
    config: "",
    scope: "",
    project: "",
    dbFile: "",
    dryRun: false,
    useGlobalToken: false,
    verbose: false,
  };
  let targetName = "";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--") && !targetName) {
      targetName = arg;
      continue;
    }

    const raw = arg.startsWith("--") ? arg.slice(2) : arg;
    const equalsIndex = raw.indexOf("=");
    const name = equalsIndex >= 0 ? raw.slice(0, equalsIndex) : raw;
    const inlineValue = equalsIndex >= 0 ? raw.slice(equalsIndex + 1) : undefined;
    const readValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      index += 1;
      if (index >= args.length) fail(`Missing value for --${name}.`);
      return args[index];
    };

    switch (name) {
      case "config":
        options.config = path.resolve(repoRoot, readValue());
        break;
      case "scope":
        options.scope = readValue();
        break;
      case "project":
        options.project = readValue();
        break;
      case "db-file":
        options.dbFile = path.resolve(repoRoot, readValue());
        break;
      case "dry-run":
        options.dryRun = true;
        break;
      case "use-global-token":
        options.useGlobalToken = true;
        break;
      case "verbose":
        options.verbose = true;
        break;
      case "help":
        usage(0);
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  if (!targetName) {
    targetName = "production";
  }
  if (!["production", "preview"].includes(targetName)) {
    fail(`Unknown target "${targetName}". Expected production or preview.`);
  }
  return { targetName, options };
}

function readJson(filePath) {
  if (!existsSync(filePath)) {
    fail(`Missing ${path.relative(repoRoot, filePath)}.`);
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Could not parse ${path.relative(repoRoot, filePath)}: ${error.message}`);
  }
}

function resolveTarget(config, targetName) {
  const target = config.targets?.[targetName];
  if (!target) {
    fail(`deploy.json is missing targets.${targetName}.`);
  }
  return {
    environment: target.environment || (targetName === "production" ? "production" : "preview"),
  };
}

function readToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  const tokenPaths = [
    path.join(repoRoot, ".vercel-token"),
    path.resolve(repoRoot, "..", ".vercel-token"),
  ];
  for (const tokenPath of tokenPaths) {
    if (existsSync(tokenPath)) {
      return readFileSync(tokenPath, "utf8").trim();
    }
  }
  return "";
}

function readDb(filePath) {
  if (!existsSync(filePath)) {
    fail(`Missing local FlashReels DB at ${filePath}.`);
  }
  try {
    return normalizeDb(JSON.parse(readFileSync(filePath, "utf8")));
  } catch (error) {
    fail(`Could not read ${filePath}: ${error.message}`);
  }
}

function normalizeDb(value) {
  const parsed = value && typeof value === "object" ? value : {};
  const users = Array.isArray(parsed.users)
    ? parsed.users.map((user, index) => ({
      ...user,
      role: user.role || (index === 0 ? "admin" : "user"),
    }))
    : [];
  return {
    version: 1,
    users,
    videos: Array.isArray(parsed.videos) ? parsed.videos : [],
    whitelistEmails: Array.isArray(parsed.whitelistEmails) ? parsed.whitelistEmails : [],
  };
}

function pullVercelEnv({ target, token, options }) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "flashreels-vercel-env-"));
  const envPath = path.join(dir, `${target.environment}.env`);
  try {
    chmodSync(dir, 0o700);
    runVercel([
      "env",
      "pull",
      envPath,
      "--environment",
      target.environment,
      "--yes",
    ], { token, options, secrets: [token] });
    const variables = parseEnv(readFileSync(envPath, "utf8"));
    return variables;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseEnv(source) {
  const variables = new Map();
  for (const line of source.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex < 0) continue;
    let key = line.slice(0, equalsIndex).trim();
    if (key.startsWith("export ")) key = key.slice("export ".length).trim();
    variables.set(key, parseEnvValue(line.slice(equalsIndex + 1)));
  }
  return variables;
}

function parseEnvValue(rawValue) {
  const value = rawValue.trimStart();
  if (!value) return "";
  if (value.startsWith('"')) {
    let output = "";
    for (let index = 1; index < value.length; index += 1) {
      const char = value[index];
      if (char === '"') return output;
      if (char === "\\") {
        index += 1;
        const escaped = value[index];
        if (escaped === "n") output += "\n";
        else if (escaped === "r") output += "\r";
        else if (escaped === "t") output += "\t";
        else output += escaped ?? "";
      } else {
        output += char;
      }
    }
    return output;
  }
  if (value.startsWith("'")) {
    const end = value.indexOf("'", 1);
    return end >= 0 ? value.slice(1, end) : value.slice(1);
  }
  const commentIndex = value.search(/\s#/);
  return (commentIndex >= 0 ? value.slice(0, commentIndex) : value).trimEnd();
}

function getRedisConfig(env) {
  for (const [urlEnv, tokenEnv] of REDIS_REST_PAIRS) {
    const url = env.get(urlEnv);
    const token = env.get(tokenEnv);
    if (url && token) {
      return { kind: "rest", url, token, urlEnv, tokenEnv };
    }
  }
  for (const urlEnv of REDIS_URL_ENV_KEYS) {
    const url = env.get(urlEnv);
    if (url) {
      return { kind: "url", url, urlEnv };
    }
  }
  return null;
}

function createRedisClient(config) {
  if (config.kind === "rest") {
    return new Redis({ url: config.url, token: config.token });
  }
  return new RedisUrlClient(config.url);
}

class RedisUrlClient {
  constructor(redisUrl) {
    this.redisUrl = redisUrl;
  }

  async get(key) {
    const value = await this.run(["GET", key]);
    if (value === null) {
      return null;
    }
    if (typeof value !== "string") {
      return value;
    }
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  async set(key, value) {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    return this.run(["SET", key, serialized]);
  }

  async run(command) {
    const url = new URL(this.redisUrl);
    const commands = [];
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

function sendRedisCommands(url, commands) {
  return new Promise((resolve, reject) => {
    const port = Number(url.port || (url.protocol === "rediss:" ? 6380 : 6379));
    const host = url.hostname;
    const socket = url.protocol === "rediss:"
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });
    const responses = [];
    let buffer = Buffer.alloc(0);
    let settled = false;

    const timeout = setTimeout(() => {
      failOnce(new Error(`Redis command timed out after ${Math.round(REDIS_TIMEOUT_MS / 1000)}s.`));
    }, REDIS_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeout);
      socket.removeAllListeners();
      socket.destroy();
    }

    function failOnce(error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    socket.once(url.protocol === "rediss:" ? "secureConnect" : "connect", () => {
      socket.write(Buffer.concat(commands.map(encodeRedisCommand)));
    });
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      try {
        while (responses.length < commands.length) {
          const parsed = parseResp(buffer);
          if (!parsed) return;
          responses.push(parsed.value);
          buffer = buffer.subarray(parsed.bytes);
        }
        if (!settled) {
          settled = true;
          cleanup();
          resolve(responses);
        }
      } catch (error) {
        failOnce(error);
      }
    });
    socket.once("error", failOnce);
  });
}

function encodeRedisCommand(args) {
  return Buffer.concat([
    Buffer.from(`*${args.length}\r\n`),
    ...args.flatMap((arg) => {
      const value = Buffer.from(String(arg));
      return [Buffer.from(`$${value.length}\r\n`), value, Buffer.from("\r\n")];
    }),
  ]);
}

function parseResp(buffer) {
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
    const values = [];
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

function runVercel(args, { token, options, allowFailure = false, input, secrets = [token] }) {
  const vercelBin = process.env.VERCEL_CLI_BIN || "npx";
  const vercelPrefix = process.env.VERCEL_CLI_BIN ? [] : ["--yes", "vercel@latest"];
  const child = spawnSync(vercelBin, [...vercelPrefix, ...args, "--non-interactive"], {
    cwd: repoRoot,
    encoding: "utf8",
    input,
    env: {
      ...process.env,
      ...(token ? { VERCEL_TOKEN: token } : {}),
      NO_COLOR: "1",
    },
  });
  if (child.error) {
    fail(`Unable to run Vercel CLI: ${child.error.message}`);
  }
  if (child.status !== 0 && !allowFailure) {
    fail(redact([child.stdout, child.stderr].filter(Boolean).join("\n"), secrets));
  }
  if (options.verbose && child.stdout.trim()) {
    console.log(redact(child.stdout.trim(), secrets));
  }
  return child;
}

function redact(text, secrets) {
  let output = text || "";
  for (const secret of secrets || []) {
    if (!secret || secret.length < 3) continue;
    output = output.split(secret).join("[redacted]");
  }
  return output;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function usage(exitCode) {
  console.log(`Usage: node scripts/migrate-production-data.mjs [production|preview] [options]

Copies the local FlashReels feed/admin database into the target Vercel Redis store.

Options:
  --db-file <path>       Source DB file, default .flashreels/db.json
  --scope <team>         Vercel team/scope slug
  --project <name>       Vercel project name
  --dry-run              Print planned write without touching Redis
  --use-global-token     Use active Vercel CLI login
  --verbose              Print extra Vercel command output
`);
  process.exit(exitCode);
}

main().catch((error) => {
  fail(error instanceof Error ? error.stack || error.message : String(error));
});
