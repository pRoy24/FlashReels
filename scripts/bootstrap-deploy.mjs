#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultConfigPath = path.join(repoRoot, "deploy.json");
const DEFAULT_REDIS_PLAN = "free";
const REDIS_ENV_KEY_PAIRS = [
  ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ["REDIS_REST_API_URL", "REDIS_REST_API_TOKEN"],
];
const REDIS_URL_ENV_KEYS = [
  "REDIS_URL",
  "KV_URL",
  "REDISCLOUD_URL",
];

main();

function main() {
  const { targetName, options } = parseArgs(process.argv.slice(2));
  const config = readJson(options.config || defaultConfigPath);
  const target = resolveTarget(config, targetName);
  const scope = options.scope || process.env.VERCEL_SCOPE || process.env.VERCEL_TEAM || config.vercel?.defaultScope || "";
  const project = options.project || process.env.VERCEL_PROJECT || config.vercel?.defaultProject || "";
  const redisConfig = {
    integration: options.redisIntegration || config.vercel?.redis?.integration || "redis",
    resourceName: options.redisName || config.vercel?.redis?.resourceName || "flashreels-redis",
    plan: options.redisPlan || config.vercel?.redis?.plan || "",
    primaryRegion: options.redisRegion || config.vercel?.redis?.primaryRegion || "iad1",
    highAvailability: options.redisHighAvailability || config.vercel?.redis?.highAvailability || "None",
    eviction: booleanString(config.vercel?.redis?.eviction, "false"),
    prodPack: booleanString(config.vercel?.redis?.prodPack, "false"),
    autoUpgrade: booleanString(config.vercel?.redis?.autoUpgrade, "false"),
  };
  const token = readToken();

  console.log(`${options.dryRun ? "Dry run: " : ""}FlashReels deploy bootstrap`);
  console.log(`target: ${targetName} -> Vercel ${target.environment}`);
  console.log(`project: ${scope || "(active scope)"}/${project || "(linked project)"}`);
  console.log(`redis: ${redisConfig.integration} ${redisConfig.resourceName} (${redisConfig.plan || "provider default/free tier"}, ${redisConfig.primaryRegion})`);

  ensureVercelCliAuth({ token, options });
  ensureVercelProjectLinked({ scope, project, token, options });
  const targetEnvKeys = listTargetEnvKeys({ target, token, options });
  const redisEnv = existingRedisEnv(targetEnvKeys);
  if (redisEnv) {
    console.log(`Redis: existing ${redisEnv} found in Vercel env; reusing it.`);
  } else {
    ensureRedis({ redisConfig, target, scope, token, options });
  }

  console.log("\nNext steps:");
  console.log(`1. Redeploy ${targetName} so the running deployment sees the injected Redis env vars.`);
  console.log(`2. Run npm run deploy:migrate:production after Redis env vars are present to copy local feed/admin data into production Redis.`);
}

function parseArgs(args) {
  const options = {
    config: "",
    scope: "",
    project: "",
    dryRun: false,
    login: true,
    useGlobalToken: false,
    acceptMarketplaceTerms: true,
    redisIntegration: "",
    redisName: "",
    redisPlan: "",
    redisRegion: "",
    redisHighAvailability: "",
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
      case "dry-run":
        options.dryRun = true;
        break;
      case "no-login":
        options.login = false;
        break;
      case "use-global-token":
        options.useGlobalToken = true;
        break;
      case "accept-marketplace-terms":
        options.acceptMarketplaceTerms = true;
        break;
      case "no-accept-marketplace-terms":
        options.acceptMarketplaceTerms = false;
        break;
      case "redis-integration":
        options.redisIntegration = readValue();
        break;
      case "redis-name":
        options.redisName = readValue();
        break;
      case "redis-plan":
        options.redisPlan = readValue();
        break;
      case "redis-region":
        options.redisRegion = readValue();
        break;
      case "redis-high-availability":
        options.redisHighAvailability = readValue();
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

function booleanString(value, fallback) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function ensureVercelCliAuth({ token, options }) {
  if (options.dryRun || token || options.useGlobalToken) {
    console.log(token ? "Vercel auth: using token from env/file." : "Vercel auth: using active CLI login.");
    return;
  }
  const result = runVercel(["whoami"], {
    token: "",
    options,
    allowFailure: true,
    secrets: [],
  });
  if (result.status === 0) {
    console.log("Vercel auth: using active CLI login.");
    return;
  }
  if (!options.login) {
    fail("Missing Vercel token or active login. Set VERCEL_TOKEN, put it in .vercel-token, or omit --no-login.");
  }
  console.log("Vercel auth: starting login flow.");
  runVercelInteractive(["login"], { token: "", options });
}

function ensureVercelProjectLinked({ scope, project, token, options }) {
  const projectConfigPath = path.resolve(repoRoot, ".vercel/project.json");
  if (existsSync(projectConfigPath)) {
    console.log("Vercel project link: ok.");
    return;
  }
  if (options.dryRun) {
    console.log("Would link Vercel project locally.");
    return;
  }
  const args = ["link"];
  if (scope && project) {
    args.push("--yes", "--scope", scope, "--project", project);
  }
  console.log("Vercel project link: starting link flow.");
  runVercelInteractive(args, { token, options });
}

function listTargetEnvKeys({ target, token, options }) {
  if (options.dryRun) {
    return new Set();
  }
  const args = ["env", "list", target.environment, "--format", "json"];
  const result = runVercel(args, { token, options, allowFailure: true });
  const output = `${result.stdout}\n${result.stderr}`.trim();
  if (result.status !== 0) {
    fail(`Unable to list Vercel env keys for ${target.environment}.\n${redact(output, [token])}`);
  }
  try {
    return collectVercelEnvKeys(parseVercelJsonOutput(output));
  } catch (error) {
    fail(`Unable to parse Vercel env key list: ${error.message}`);
  }
}

function collectVercelEnvKeys(value, output = new Set()) {
  const validKey = /^[A-Za-z_][A-Za-z0-9_]*$/;
  if (Array.isArray(value)) {
    for (const item of value) collectVercelEnvKeys(item, output);
    return output;
  }
  if (!value || typeof value !== "object") {
    return output;
  }
  if (typeof value.key === "string" && validKey.test(value.key)) {
    output.add(value.key);
  }
  for (const prop of ["envs", "environmentVariables", "variables", "items", "results"]) {
    if (Object.prototype.hasOwnProperty.call(value, prop)) {
      collectVercelEnvKeys(value[prop], output);
    }
  }
  return output;
}

function existingRedisEnv(keys) {
  const urlKey = REDIS_URL_ENV_KEYS.find((key) => keys.has(key));
  if (urlKey) {
    return urlKey;
  }
  const pair = REDIS_ENV_KEY_PAIRS.find(([urlEnv, tokenEnv]) => keys.has(urlEnv) && keys.has(tokenEnv));
  return pair ? pair.join("/") : "";
}

function ensureRedis({ redisConfig, target, scope, token, options }) {
  const integrationProvider = redisConfig.integration.split("/")[0];
  const installArgs = buildRedisInstallArgs({ redisConfig, target, scope });

  if (options.dryRun) {
    if (options.acceptMarketplaceTerms) {
      console.log(`Would run: vercel integration accept-terms ${integrationProvider} --yes${scope ? ` --scope ${scope}` : ""}`);
    }
    console.log(`Would run: vercel ${installArgs.join(" ")}`);
    return;
  }

  if (options.acceptMarketplaceTerms) {
    console.log(`Marketplace terms: accepting terms for ${integrationProvider}.`);
    runVercel(["integration", "accept-terms", integrationProvider, "--yes", ...(scope ? ["--scope", scope] : [])], {
      token,
      options,
      allowFailure: true,
    });
  }

  console.log(`Redis: creating or connecting resource${redisConfig.plan ? ` on plan ${redisConfig.plan}` : ""}.`);
  const result = runVercel(installArgs, { token, options, allowFailure: true });
  const output = `${result.stdout}\n${result.stderr}`.trim();
  if (result.status === 0) {
    console.log("Redis resource created/connected. Vercel should inject REDIS_URL or Redis REST env vars.");
    return;
  }
  if (/already exists|resource.*exists|already.*connected|duplicate/i.test(output)) {
    console.log("Upstash Redis resource appears to already exist. Continuing.");
    return;
  }
  if (/terms|EULA|privacy|addendum|consent|authorization|attestation|browser/i.test(output)) {
    fail(
      `Redis setup requires Vercel Marketplace authorization.\n` +
        `Run: npx vercel@latest integration accept-terms ${integrationProvider} --yes${scope ? ` --scope ${scope}` : ""}\n` +
        `Then rerun: npm run deploy:setup:production\n\n${redact(output, [token])}`,
    );
  }
  if (/Billing plan not found/i.test(output)) {
    fail(
      `Redis setup failed because plan "${redisConfig.plan || "(provider default)"}" is not available.\n` +
        `This bootstrap uses the provider default/free tier unless --redis-plan is explicitly supplied.\n\n${redact(output, [token])}`,
    );
  }
  fail(`Redis setup failed.\n${redact(output, [token])}`);
}

function buildRedisInstallArgs({ redisConfig, target, scope }) {
  const common = [
    "integration",
    "add",
    redisConfig.integration,
    ...(redisConfig.plan ? ["--plan", redisConfig.plan] : []),
    "--name",
    redisConfig.resourceName,
    "--environment",
    target.environment,
  ];

  if (redisConfig.integration === "redis") {
    return [
      ...common,
      "--metadata",
      `Region=${redisConfig.primaryRegion}`,
      "--metadata",
      `HighAvailability=${redisConfig.highAvailability}`,
      ...(scope ? ["--scope", scope] : []),
    ];
  }

  return [
    ...common,
    "--metadata",
    `primaryRegion=${redisConfig.primaryRegion}`,
    "--metadata",
    `eviction=${redisConfig.eviction}`,
    "--metadata",
    `prodPack=${redisConfig.prodPack}`,
    "--metadata",
    `autoUpgrade=${redisConfig.autoUpgrade}`,
    ...(scope ? ["--scope", scope] : []),
  ];
}

function parseVercelJsonOutput(text) {
  for (let start = 0; start < text.length; start += 1) {
    const first = text[start];
    if (first !== "{" && first !== "[") continue;
    const stack = [];
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === "\"") inString = false;
        continue;
      }
      if (char === "\"") inString = true;
      else if (char === "{") stack.push("}");
      else if (char === "[") stack.push("]");
      else if (char === "}" || char === "]") {
        if (stack.pop() !== char) break;
        if (stack.length === 0) {
          return JSON.parse(text.slice(start, index + 1));
        }
      }
    }
  }
  throw new Error("Vercel CLI did not return JSON.");
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

function runVercelInteractive(args, { token }) {
  const vercelBin = process.env.VERCEL_CLI_BIN || "npx";
  const vercelPrefix = process.env.VERCEL_CLI_BIN ? [] : ["--yes", "vercel@latest"];
  const child = spawnSync(vercelBin, [...vercelPrefix, ...args], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ...(token ? { VERCEL_TOKEN: token } : {}),
    },
  });
  if (child.error) {
    fail(`Unable to run Vercel CLI: ${child.error.message}`);
  }
  if (child.status !== 0) {
    fail(`Vercel CLI failed for: vercel ${args.join(" ")}`);
  }
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
  console.log(`Usage: node scripts/bootstrap-deploy.mjs [production|preview] [options]

Creates/connects FlashReels durable storage on Vercel using the official Redis integration by default.

Options:
  --scope <team>                  Vercel team/scope slug
  --project <name>                Vercel project name
  --dry-run                       Print planned actions
  --no-login                      Do not launch interactive Vercel login
  --use-global-token              Use active Vercel CLI login
  --accept-marketplace-terms      Accept Marketplace terms for Redis integration (default)
  --no-accept-marketplace-terms   Do not accept Marketplace terms automatically
  --redis-integration <id>        Redis integration slug, default upstash/upstash-kv
  --redis-name <name>             Redis resource name
  --redis-plan <plan>             Redis plan, default ${DEFAULT_REDIS_PLAN}
  --redis-region <region>         Redis primary region, default iad1
  --redis-high-availability <val> Redis HA setting for official Redis, default None
  --verbose                       Print extra Vercel command output
`);
  process.exit(exitCode);
}
