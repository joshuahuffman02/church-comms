import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep local preview artifacts away from the live production build. Running
  // `next dev` alongside `next start` must not invalidate the live CSS chunks.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  // This app is intentionally previewed from the church LAN as well as
  // localhost. Permit those dev origins so client interactions and HMR work
  // during visual QA; production origin checks are unaffected.
  allowedDevOrigins: ["127.0.0.1", "192.168.164.157"],
};

export default nextConfig;
