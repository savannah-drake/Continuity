// lib/session.ts: who is signed in. A signed, HttpOnly cookie holds the user id (no database lookup needed).
// Needs SESSION_SECRET (any long random string) in .env.local and Vercel.
import { createHmac, createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "cn_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET is missing or too short");
  return s;
}
const b64url = (b: Buffer) => b.toString("base64url");
const sign = (payload: string) => b64url(createHmac("sha256", secret()).update(payload).digest());

export function makeSessionValue(userId: number) {
  const payload = b64url(Buffer.from(JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + MAX_AGE })));
  return `${payload}.${sign(payload)}`;
}

export function readSessionValue(value: string | undefined | null): number | null {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!Number.isInteger(uid) || uid <= 0 || exp < Date.now() / 1000) return null;
    return uid;
  } catch { return null; }
}

// Server-side: the signed-in user's id, or null
export async function getSessionUserId(): Promise<number | null> {
  const jar = await cookies();
  return readSessionValue(jar.get(SESSION_COOKIE)?.value);
}

export const sessionCookie = (userId: number, secure: boolean) => ({
  name: SESSION_COOKIE, value: makeSessionValue(userId),
  httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: MAX_AGE,
});

export const unauthorizedJson = () => Response.json({ error: "signed_out" }, { status: 401 });

// AES-256-GCM for secrets we must keep (Google refresh tokens). Key is derived from SESSION_SECRET.
const encKey = () => createHash("sha256").update(`${secret()}:tokens`).digest();
export function encrypt(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", encKey(), iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map(b64url).join(".");
}
export function decrypt(blob: string) {
  const [iv, tag, data] = blob.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}
