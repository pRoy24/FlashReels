import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["samsar-js"],
};

export default function config(phase) {
  if (phase === PHASE_DEVELOPMENT_SERVER && process.env.FLASHREELS_LOCAL_TUNNEL !== "1") {
    throw new Error("FlashReels local development requires `npm run dev -- --local` so Samsar can reach public adapter callbacks.");
  }

  return nextConfig;
}
