// lib/google.ts: Google sign-in and Google Calendar, with plain fetch (no extra packages).
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (Google Cloud > APIs & Services > Credentials > OAuth client, Web).
// Authorized redirect URI: <your site>/api/auth/google/callback  (e.g. http://localhost:3000/... and https://www.continuitynow.health/...)
import { query } from "./db";
import { encrypt, decrypt } from "./session";

export const SIGNIN_SCOPES = ["openid", "email", "profile"];
// Busy times only (no event titles) + create/update the visits Continuity adds
export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
];

const clientId = () => process.env.GOOGLE_CLIENT_ID ?? "";
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET ?? "";
export const googleConfigured = () => Boolean(clientId() && clientSecret());

export function authUrl(opts: { redirectUri: string; state: string; calendar: boolean; loginHint?: string }) {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: [...SIGNIN_SCOPES, ...(opts.calendar ? CALENDAR_SCOPES : [])].join(" "),
    state: opts.state,
    include_granted_scopes: "true",
    ...(opts.calendar ? { access_type: "offline", prompt: "consent" } : { prompt: "select_account" }),
    ...(opts.loginHint ? { login_hint: opts.loginHint } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string; id_token?: string };

export async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId(), client_secret: clientSecret(), redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!res.ok) throw new Error(`google token exchange ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// The id_token comes straight from Google over TLS in the code exchange, so reading its claims is safe here
// (we still check who it was issued for and that it hasn't expired).
export function readIdToken(idToken: string) {
  const claims = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
  if (claims.aud !== clientId()) throw new Error("id_token audience mismatch");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(claims.iss)) throw new Error("id_token issuer mismatch");
  if (claims.exp * 1000 < Date.now()) throw new Error("id_token expired");
  return { sub: String(claims.sub), email: claims.email as string | undefined, name: (claims.given_name || claims.name) as string | undefined };
}

// ---- Stored calendar connection

export async function saveConnection(userId: number, refreshToken: string, scopes?: string) {
  await query(
`INSERT INTO google_connections (user_id, refresh_token_enc, scopes, connected_at, last_synced_at, last_error)
VALUES ($1, $2, $3, now(), NULL, NULL)
ON CONFLICT (user_id) DO UPDATE SET refresh_token_enc = EXCLUDED.refresh_token_enc, scopes = EXCLUDED.scopes, connected_at = now(), last_synced_at = NULL, last_error = NULL`,
    [userId, encrypt(refreshToken), scopes ?? null]);
}

export async function getConnection(userId: number) {
  const [row] = await query<{ refresh_token_enc: string; scopes: string | null; last_synced_at: string | null; last_error: string | null }>(
`SELECT g.refresh_token_enc, g.scopes, g.last_synced_at, g.last_error
FROM google_connections g
WHERE g.user_id = $1`, [userId]);
  return row ?? null;
}

export async function removeConnection(userId: number) {
  const conn = await getConnection(userId);
  if (conn) {
    // Tell Google too, so the app no longer has access
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(conn.refresh_token_enc))}`, { method: "POST" });
    } catch { /* still remove locally */ }
  }
  await query(
`DELETE FROM google_connections
WHERE user_id = $1`, [userId]);
}

const accessCache = new Map<number, { token: string; exp: number }>();

export async function accessToken(userId: number): Promise<string | null> {
  const cached = accessCache.get(userId);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const conn = await getConnection(userId);
  if (!conn) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), refresh_token: decrypt(conn.refresh_token_enc), grant_type: "refresh_token" }),
  });
  if (!res.ok) {
    const why = (await res.text()).slice(0, 200);
    await query(
`UPDATE google_connections
SET last_error = $2
WHERE user_id = $1`, [userId, `refresh ${res.status}: ${why}`]);
    return null;
  }
  const t = (await res.json()) as TokenResponse;
  accessCache.set(userId, { token: t.access_token, exp: Date.now() + t.expires_in * 1000 });
  return t.access_token;
}

async function gcal(userId: number, path: string, init: RequestInit = {}) {
  const token = await accessToken(userId);
  if (!token) return null;
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`google calendar ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? {} : res.json();
}

// Upcoming events on the main calendar, for auto-import of booking confirmations (only when the user turned it on).
// Recurring events come back as single instances (singleEvents). Callers must not store titles or details.
export type CalEvent = {
  id: string; recurringEventId?: string; status?: string; summary?: string; description?: string; location?: string;
  organizer?: { email?: string }; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
  source?: { title?: string; url?: string }; eventType?: string;
};
export async function listEvents(userId: number, from: Date, to: Date): Promise<CalEvent[] | null> {
  const out: CalEvent[] = [];
  let pageToken = "";
  for (let page = 0; page < 5; page++) {
    const qs = new URLSearchParams({
      timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250",
      fields: "nextPageToken,items(id,recurringEventId,status,summary,description,location,organizer(email),start,end,source,eventType)",
      ...(pageToken ? { pageToken } : {}),
    });
    const data = await gcal(userId, `/calendars/primary/events?${qs}`);
    if (!data) return null;
    out.push(...((data.items ?? []) as CalEvent[]));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return out;
}

// Busy start/end times on the user's main calendar (no titles or details)
export async function freeBusy(userId: number, from: Date, to: Date) {
  const data = await gcal(userId, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: "primary" }] }),
  });
  if (!data) return null;
  const busy = (data.calendars?.primary?.busy ?? []) as { start: string; end: string }[];
  return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

export type CalendarVisit = {
  title: string; details?: string; start: Date; durationMin: number; timeZone?: string;
  repeatEveryWeeks?: number | null; repeatUntil?: string | null; location?: string;
  rrule?: string;              // e.g. "RRULE:FREQ=DAILY" (overrides repeatEveryWeeks)
  reminderMinutes?: number[];  // popup reminders before the start; default: 1 day and 1 hour
};

const toLocal = (d: Date, tz: string) => {
  // "2026-11-18T15:00:00" in the given time zone (Google pairs it with timeZone)
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
};

function eventBody(v: CalendarVisit) {
  const tz = v.timeZone || "America/New_York";
  const end = new Date(v.start.getTime() + v.durationMin * 60_000);
  const rule = v.rrule ? [v.rrule] : v.repeatEveryWeeks
    ? [`RRULE:FREQ=WEEKLY;INTERVAL=${v.repeatEveryWeeks}${v.repeatUntil ? `;UNTIL=${v.repeatUntil.replace(/-/g, "")}T235959Z` : ""}`]
    : undefined;
  return {
    summary: v.title,
    description: v.details,
    location: v.location,
    start: { dateTime: toLocal(v.start, tz), timeZone: tz },
    end: { dateTime: toLocal(end, tz), timeZone: tz },
    ...(rule ? { recurrence: rule } : {}),
    reminders: { useDefault: false, overrides: (v.reminderMinutes ?? [24 * 60, 60]).map((minutes) => ({ method: "popup", minutes })) },
    source: { title: "Continuity", url: process.env.APP_URL || "https://www.continuitynow.health" },
  };
}

export async function createEvent(userId: number, v: CalendarVisit): Promise<string | null> {
  const data = await gcal(userId, "/calendars/primary/events", { method: "POST", body: JSON.stringify(eventBody(v)) });
  return data?.id ?? null;
}

export async function updateEvent(userId: number, eventId: string, v: CalendarVisit) {
  await gcal(userId, `/calendars/primary/events/${encodeURIComponent(eventId)}`, { method: "PUT", body: JSON.stringify(eventBody(v)) });
}

export async function deleteEvent(userId: number, eventId: string) {
  try {
    await gcal(userId, `/calendars/primary/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
  } catch (e) {
    if (!String(e).includes(" 410") && !String(e).includes(" 404")) throw e; // already gone is fine
  }
}
