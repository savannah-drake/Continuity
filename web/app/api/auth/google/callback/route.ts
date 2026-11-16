// GET /api/auth/google/callback: Google sends people back here after they approve.
// Signs them in (creating an account the first time) and, if they allowed it, connects Google Calendar.
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { exchangeCode, readIdToken, saveConnection, CALENDAR_SCOPES } from "@/lib/google";
import { readSessionValue, sessionCookie, SESSION_COOKIE } from "@/lib/session";
import { syncGoogleBusy } from "@/lib/busy";
import { syncMedReminders } from "@/lib/medications";
import { OAUTH_COOKIE, siteOrigin } from "@/lib/origin";

export async function GET(req: NextRequest) {
  const origin = siteOrigin(req);
  const back = (path: string) => NextResponse.redirect(`${origin}${path}`);
  const p = req.nextUrl.searchParams;

  let saved: { nonce: string; calendar: boolean; next: string } | null = null;
  try { saved = JSON.parse(req.cookies.get(OAUTH_COOKIE)?.value ?? "null"); } catch { /* ignore */ }
  if (p.get("error")) return back(`/?signin=cancelled`);
  if (!saved || saved.nonce !== p.get("state") || !p.get("code")) return back(`/?signin=failed`);

  try {
    const tokens = await exchangeCode(p.get("code")!, `${origin}/api/auth/google/callback`);
    if (!tokens.id_token) throw new Error("no id_token");
    const g = readIdToken(tokens.id_token);

    // Already signed in (e.g. connecting the calendar from Profile)? Link Google to that account,
    // except the shared demo account: nobody's real Google account should get attached to it.
    const signedIn = readSessionValue(req.cookies.get(SESSION_COOKIE)?.value);
    const current = signedIn || null;
    let userId: number;
    let isNew = false;
    const [byGoogle] = await query<{ user_id: number }>(
`SELECT u.user_id
FROM users u
WHERE u.google_sub = $1`, [g.sub]);
    if (byGoogle) {
      userId = byGoogle.user_id;
    } else if (current) {
      await query(
`UPDATE users
SET google_sub = $2, email = coalesce(email, $3)
WHERE user_id = $1`, [current, g.sub, g.email ?? null]);
      userId = current;
    } else {
      const [created] = await query<{ user_id: number }>(
`INSERT INTO users (google_sub, email, display_name)
VALUES ($1, $2, $3)
RETURNING user_id`, [g.sub, g.email ?? null, g.name ?? null]);
      userId = created.user_id;
      isNew = true;
    }

    // Calendar: only if Google gave us a refresh token and the calendar permissions were actually granted
    const granted = (tokens.scope ?? "").split(" ");
    if (saved.calendar && tokens.refresh_token && CALENDAR_SCOPES.every((s) => granted.includes(s))) {
      await saveConnection(userId, tokens.refresh_token, tokens.scope);
      await syncGoogleBusy(userId, { force: true }).catch((e) => console.error("first calendar sync failed", e));
      await syncMedReminders(userId).catch((e) => console.error("first reminder sync failed", e));
    }

    // Has this person finished setup (insurance plan chosen)?
    const [u] = await query<{ insurance_plan: string | null }>(
`SELECT u.insurance_plan
FROM users u
WHERE u.user_id = $1`, [userId]);
    const nextPath = isNew || !u?.insurance_plan ? "/onboarding" : saved.next;
    const calendarNote = saved.calendar ? (granted.includes(CALENDAR_SCOPES[0]) ? "calendar=connected" : "calendar=declined") : "";
    const res = back(calendarNote ? `${nextPath}${nextPath.includes("?") ? "&" : "?"}${calendarNote}` : nextPath);
    res.cookies.set(sessionCookie(userId, origin.startsWith("https:")));
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  } catch (e) {
    console.error("google sign-in failed", e);
    return back(`/?signin=failed`);
  }
}
