import { NextResponse } from "next/server";

// Serves /.well-known/assetlinks.json (via the rewrite in
// next.config.ts). Google's crawler fetches this file to verify that
// a domain is authorised to open in a given Android app via App Links.
//
// Gated on the ANDROID_APP_LINK_SHA256 env var. Until that's set this
// returns 404. Get the fingerprint from `eas credentials` → Android →
// production, or from Play Console → Setup → App integrity → App
// signing. Use the APP SIGNING key, not the upload key — those are
// different.
//
// ANDROID_APP_LINK_SHA256 accepts either:
//   - a single "AA:BB:CC:..." fingerprint
//   - a comma-separated list if you rotate certs (old + new)
//
// Keep the package name in sync with app.json `android.package`.

const DEFAULT_PACKAGE_NAME = "com.marcz2007.GroupMatchmakerApp";

export async function GET() {
  const rawFingerprints = process.env.ANDROID_APP_LINK_SHA256;

  if (!rawFingerprints) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const fingerprints = rawFingerprints
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  if (fingerprints.length === 0) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const packageName =
    process.env.ANDROID_APP_LINK_PACKAGE || DEFAULT_PACKAGE_NAME;

  const body = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];

  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
