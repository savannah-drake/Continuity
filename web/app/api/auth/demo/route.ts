// GET /api/auth/demo: "Try the demo" signs this device in as the sample student (Maya).
// Only works when DEMO_USER_ID is set (e.g. DEMO_USER_ID=1). Leave it unset to turn the demo off.
import { NextRequest, NextResponse } from "next/server";
import { sessionCookie } from "@/lib/session";
import { siteOrigin } from "@/lib/origin";

export async function GET(req: NextRequest) {
  const demo = Number(process.env.DEMO_USER_ID);
  const origin = siteOrigin(req);
  if (!Number.isInteger(demo) || demo <= 0) return NextResponse.redirect(`${origin}/`);
  const res = NextResponse.redirect(`${origin}/`);
  res.cookies.set(sessionCookie(demo, origin.startsWith("https:")));
  return res;
}
