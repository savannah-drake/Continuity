// DELETE /api/account (signed in): delete my account and all my data, revoke Google access, and sign out.
import { NextResponse } from "next/server";
import { getSessionUserId, unauthorizedJson, SESSION_COOKIE } from "@/lib/session";
import { deleteAccount } from "@/lib/account";

export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedJson();
  await deleteAccount(userId);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
