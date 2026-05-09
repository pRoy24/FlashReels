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

let tunnel;
let nextProcess;

async function shutdown(signal) {
  if (nextProcess && !nextProcess.killed) {
    nextProcess.kill(signal);
  }
  if (tunnel && !tunnel.killed) {
    tunnel.kill(signal);
  }
  process.exit(signal === "SIGINT" || signal === "SIGTERM" ? 0 : 1);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  tunnel = spawn("npx", ["-y", "localtunnel@2.0.2", "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const publicUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out while starting the public callback tunnel.")), 30000);

    function inspectOutput(chunk) {
      const text = chunk.toString();
      process.stdout.write(text);
      const match = text.match(/https:\/\/[^\s]+/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0].replace(/\/+$/, ""));
      }
    }

    tunnel.stdout.on("data", inspectOutput);
    tunnel.stderr.on("data", (chunk) => process.stderr.write(chunk));
    tunnel.on("error", reject);
    tunnel.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Public callback tunnel exited with code ${code ?? "unknown"}.`));
    });
  });

  console.log(`FlashReels public callback URL: ${publicUrl}`);

  tunnel.removeAllListeners("exit");
  tunnel.on("exit", () => {
    console.error("FlashReels public callback tunnel closed.");
    if (nextProcess && !nextProcess.killed) {
      nextProcess.kill("SIGTERM");
    }
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
    if (tunnel && !tunnel.killed) {
      tunnel.kill("SIGTERM");
    }
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unable to start FlashReels local tunnel.");
  await shutdown("SIGTERM");
}
