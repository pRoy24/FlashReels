#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
const localIndex = args.indexOf("--local");

if (localIndex === -1) {
  console.error("FlashReels local development requires a public callback tunnel.");
  console.error("Start with: npm run dev -- --local");
  process.exit(1);
}

args.splice(localIndex, 1);

function readArg(name, alias, fallback) {
  const longIndex = args.indexOf(name);
  if (longIndex !== -1 && args[longIndex + 1]) {
    return args[longIndex + 1];
  }

  const aliasIndex = args.indexOf(alias);
  if (aliasIndex !== -1 && args[aliasIndex + 1]) {
    return args[aliasIndex + 1];
  }

  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

const port = Number(readArg("--port", "-p", process.env.PORT || "3000"));
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("Invalid dev server port.");
  process.exit(1);
}

const TUNNEL_START_ATTEMPTS = 3;
const TUNNEL_RESTART_DELAY_MS = 3000;

let tunnel;
let nextProcess;
let shuttingDown = false;
let restarting = false;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatExit(code, signal) {
  if (signal) {
    return `signal ${signal}`;
  }
  return `code ${code ?? "unknown"}`;
}

function cleanTunnelMessage(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed &&
        !trimmed.startsWith("at ") &&
        !trimmed.startsWith("^") &&
        !trimmed.startsWith("throw err;") &&
        !trimmed.startsWith("Node.js v") &&
        !/node_modules\/localtunnel\/.*\.js:\d+/.test(trimmed)
      );
    })
    .join("\n");
}

function writeTunnelError(chunk) {
  const message = cleanTunnelMessage(chunk.toString());
  if (message) {
    process.stderr.write(`[localtunnel] ${message}\n`);
  }
}

function stopChild(child, signal = "SIGTERM") {
  if (!child || child.killed || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill(signal);
  });
}

async function shutdown(signal, exitCode = signal === "SIGINT" || signal === "SIGTERM" ? 0 : 1) {
  shuttingDown = true;
  await Promise.all([
    stopChild(nextProcess, signal),
    stopChild(tunnel, signal),
  ]);
  process.exit(exitCode);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

function startTunnelOnce() {
  const child = spawn("npx", ["-y", "localtunnel@2.0.2", "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let stderrBuffer = "";
    const timeout = setTimeout(() => reject(new Error("Timed out while starting the public callback tunnel.")), 30000);

    function inspectOutput(chunk) {
      const text = chunk.toString();
      process.stdout.write(text);
      const match = text.match(/https:\/\/[^\s]+/);
      if (match) {
        settled = true;
        clearTimeout(timeout);
        resolve({ process: child, publicUrl: match[0].replace(/\/+$/, "") });
      }
    }

    child.stdout.on("data", inspectOutput);
    child.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
      writeTunnelError(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code, signal) => {
      if (settled) {
        return;
      }
      clearTimeout(timeout);
      const detail = cleanTunnelMessage(stderrBuffer);
      reject(new Error(
        detail || `Public callback tunnel exited with ${formatExit(code, signal)}.`,
      ));
    });
  });
}

async function startTunnelWithRetry() {
  let lastError;
  for (let attempt = 1; attempt <= TUNNEL_START_ATTEMPTS; attempt += 1) {
    try {
      return await startTunnelOnce();
    } catch (error) {
      lastError = error;
      if (shuttingDown || attempt === TUNNEL_START_ATTEMPTS) {
        break;
      }
      console.error(`FlashReels public callback tunnel failed to start. Retrying (${attempt + 1}/${TUNNEL_START_ATTEMPTS})...`);
      await wait(1000 * attempt);
    }
  }
  throw lastError;
}

async function restartDevServer(reason) {
  if (shuttingDown || restarting) {
    return;
  }

  restarting = true;
  console.error(`${reason} Restarting FlashReels dev server with a fresh callback URL...`);
  await Promise.all([
    stopChild(nextProcess),
    stopChild(tunnel),
  ]);
  nextProcess = undefined;
  tunnel = undefined;
  restarting = false;
  await wait(TUNNEL_RESTART_DELAY_MS);
  await startDevServer();
}

async function startDevServer() {
  try {
    const startedTunnel = await startTunnelWithRetry();
    tunnel = startedTunnel.process;
    const publicUrl = startedTunnel.publicUrl;

    console.log(`FlashReels public callback URL: ${publicUrl}`);

    tunnel.on("exit", (code, signal) => {
      if (shuttingDown || restarting) {
        return;
      }
      void restartDevServer(`FlashReels public callback tunnel closed with ${formatExit(code, signal)}.`);
    });

    const nextArgs = ["next", "dev", "--webpack", "--port", String(port), ...args];
    nextProcess = spawn("npx", nextArgs, {
      stdio: "inherit",
      env: {
        ...process.env,
        FLASHREELS_PUBLIC_BASE_URL: publicUrl,
        FLASHREELS_LOCAL_TUNNEL: "1",
        PORT: String(port),
      },
    });

    nextProcess.on("exit", async (code, signal) => {
      if (shuttingDown || restarting) {
        return;
      }
      shuttingDown = true;
      await stopChild(tunnel);
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 0);
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unable to start FlashReels local tunnel.");
    await shutdown("SIGTERM", 1);
  }
}

await startDevServer();
