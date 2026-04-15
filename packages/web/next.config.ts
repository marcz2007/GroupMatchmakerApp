import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@grapple/shared"],
  // Route .well-known paths to internal route handlers so we can build
  // the AASA / assetlinks responses from env vars (APPLE_TEAM_ID,
  // ANDROID_APP_LINK_SHA256) rather than hard-coding secrets in the
  // repo. Next.js treats directories that start with "." as hidden and
  // won't route them directly, hence the rewrite.
  async rewrites() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        destination: "/api/well-known/apple-app-site-association",
      },
      {
        source: "/.well-known/assetlinks.json",
        destination: "/api/well-known/assetlinks.json",
      },
    ];
  },
};

export default nextConfig;
