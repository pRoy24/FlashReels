/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["samsar-js"],
  allowedDevOrigins: ["127.0.0.1", "*.loca.lt"],
};

export default nextConfig;
