// /api/trusted (signed in): one trusted person who gets a heads-up email if you've run out of a medication and haven't
// booked a visit. PUT {name, email} saves them (and sends them a short note saying you added them). DELETE removes them.
import { getSessionUserId, unauthorizedJson } from "@/lib/session";
import { query } from "@/lib/db";
import { sendEmail } from "@/lib/notify";
import { copyFor, isLang } from "@/lib/copy";

export async function PUT(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const b = await req.json().catch(() => null);
  const name = typeof b?.name === "string" ? b.name.trim().slice(0, 60) : "";
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase().slice(0, 120) : "";
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "bad_contact" }, { status: 400 });
  const [before] = await query<{ email: string }>(
`SELECT t.email
FROM trusted_contacts t
WHERE t.user_id = $1`, [userId]);
  await query(
`INSERT INTO trusted_contacts (user_id, contact_name, email)
VALUES ($1, $2, $3)
ON CONFLICT (user_id) DO UPDATE SET contact_name = EXCLUDED.contact_name, email = EXCLUDED.email`, [userId, name, email]);
  let introSent = false;
  if (before?.email !== email) {
    const [u] = await query<{ display_name: string | null; preferred_language: string | null }>(
`SELECT u.display_name, u.preferred_language
FROM users u
WHERE u.user_id = $1`, [userId]);
    const A = copyFor(isLang(u?.preferred_language) ? u.preferred_language : "en").alerts;
    const who = u?.display_name || A.someone;
    introSent = await sendEmail(email, { title: A.trustedIntroTitle(who), body: A.trustedIntroBody(who, name), url: "/" }, A.trustedFooter(who));
  }
  return Response.json({ ok: true, introSent });
}

export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  await query(
`DELETE FROM trusted_contacts
WHERE user_id = $1`, [userId]);
  return Response.json({ ok: true });
}
