// POST /api/call/token {lang} (signed in) -> { url, token, room } for "Talk to Continuity" in the browser.
import { getSessionUserId, unauthorizedJson } from "@/lib/session";
import { callToken, livekitConfigured } from "@/lib/livekit";
import { query } from "@/lib/db";
import { isLang, type Lang } from "@/lib/copy";

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  if (!livekitConfigured()) return Response.json({ error: "calls_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const [u] = await query<{ display_name: string | null; preferred_language: string | null }>(
`SELECT u.display_name, u.preferred_language
FROM users u
WHERE u.user_id = $1`, [userId]);
  const lang: Lang = isLang(body?.lang) ? body.lang : isLang(u?.preferred_language) ? u!.preferred_language : "en";
  return Response.json(callToken({ userId, name: u?.display_name, lang }));
}
