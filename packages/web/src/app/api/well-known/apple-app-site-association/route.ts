import { NextResponse } from "next/server";

// Serves /.well-known/apple-app-site-association (via the rewrite in
// next.config.ts). Apple's crawler fetches this file to verify that a
// domain is authorised to open in a given iOS app via Universal Links.
//
// Gated on the APPLE_TEAM_ID env var. Until that's set, this returns
// 404 — matching the "no iOS Universal Links yet" state. Once you pay
// for the Apple Developer account, set APPLE_TEAM_ID on Vercel (and
// optionally APPLE_BUNDLE_ID if it differs from the default), then
// Apple's crawler will pick up the file on the next validation cycle.
//
// Paths listed below must match the routes the mobile app registers
// in App.tsx's `linking.config.screens`. Keep in sync if you add more
// deep-link targets.

const DEFAULT_BUNDLE_ID = "com.marcz2007.GroupMatchmakerApp";

export async function GET() {
  const teamId = process.env.APPLE_TEAM_ID;

  if (!teamId) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const bundleId = process.env.APPLE_BUNDLE_ID || DEFAULT_BUNDLE_ID;

  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${teamId}.${bundleId}`,
          paths: [
            "/event/*",
            "/group/invite/*",
            "/reset-password",
          ],
        },
      ],
    },
  };

  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      // Apple's spec: must be application/json, no .json extension.
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
