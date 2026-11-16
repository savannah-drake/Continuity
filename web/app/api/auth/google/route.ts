// GET /api/auth/google?calendar=1&next=/profile
// Starts Google sign-in. calendar=1 also asks for Google Calendar (busy times + adding your visits and reminders).
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { authUrl, googleConfigured } from "@/lib/google";
import { OAUTH_COOKIE, siteOrigin } from "@/lib/origin";

export async function GET(req: NextRequest) {
  if (!googleConfigured()) return Response.json({ error: "google_not_configured" }, { status: 500 });
  const calendar = req.nextUrl.searchParams.get("calendar") === "1";
  const nextPath = req.nextUrl.searchParams.get("next") || "/";
  const safeNext = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
  const nonce = randomBytes(16).toString("base64url");

  const res = NextResponse.redirect(authUrl({
    redirectUri: `${siteOrigin(req)}/api/auth/google/callback`,
    state: nonce,
    calendar,
  }));
  res.cookies.set({
    name: OAUTH_COOKIE,
    value: JSON.stringify({ nonce, calendar, next: safeNext }),
    httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: 600,
  });
  return res;
}
