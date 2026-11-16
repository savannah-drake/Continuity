// /api/care-team (signed in): the providers you see. A booking link (Zocdoc, Grow Therapy, Psychology Today, a portal)
// is enough; name and phone are optional.
// GET -> { careTeam }   POST {providerName?, role, phone?, bookingUrl?, video?, notes?}   PATCH {memberId, ...}   DELETE ?id=3
import { NextRequest } from "next/server";
import { getSessionUserId, unauthorizedJson } from "@/lib/session";
import { getMe } from "@/lib/me";
import { cleanMember, addMember, updateMember, removeMember } from "@/lib/careTeam";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const me = await getMe(userId);
  return Response.json({ careTeam: me?.careTeam ?? [] });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const m = cleanMember(await req.json().catch(() => null));
  if (!m) return Response.json({ error: "need_link_name_or_phone" }, { status: 400 });
  return Response.json({ memberId: await addMember(userId, m) });
}

export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const b = await req.json().catch(() => null);
  const m = cleanMember(b);
  const id = Number(b?.memberId);
  if (!m || !Number.isInteger(id)) return Response.json({ error: "need_link_name_or_phone" }, { status: 400 });
  if (!(await updateMember(userId, id, m))) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || !(await removeMember(userId, id))) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
