// lib/origin.ts: the site's public address (for Google redirects) and the sign-in state cookie name.
import type { NextRequest } from "next/server";

export const OAUTH_COOKIE = "cn_oauth";

export function siteOrigin(req: NextRequest) {
  return (process.env.APP_URL || req.nextUrl.origin).replace(/\/$/, "");
}
