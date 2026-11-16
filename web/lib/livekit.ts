// lib/livekit.ts: a LiveKit access token for an in-browser call, signed with node crypto (no SDK needed).
// The token also dispatches the voice agent into the room, with the caller's user id in the job metadata,
// so the agent knows whose plan to read. Needs LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.
import { createHmac, randomBytes } from "node:crypto";

const b64url = (v: object | Buffer) => (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString("base64url");

export const livekitConfigured = () =>
  Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);

export function callToken(opts: { userId: number; name?: string | null; lang: "en" | "es"; agentName?: string; ttlSec?: number }) {
  const key = process.env.LIVEKIT_API_KEY!;
  const secret = process.env.LIVEKIT_API_SECRET!;
  const room = `continuity-web-${opts.userId}-${randomBytes(4).toString("hex")}`;
  const identity = `user-${opts.userId}-${randomBytes(3).toString("hex")}`;
  const now = Math.floor(Date.now() / 1000);
  const metadata = JSON.stringify({ userId: opts.userId, channel: "web", lang: opts.lang, name: opts.name ?? null });
  const claims = {
    iss: key,
    sub: identity,
    nbf: now - 10,
    exp: now + (opts.ttlSec ?? 30 * 60),
    name: opts.name ?? "Continuity user",
    video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
    // Start the agent in this room as soon as the browser joins
    roomConfig: { agents: [{ agentName: opts.agentName || process.env.AGENT_NAME || "continuity-agent", metadata }] },
  };
  const unsigned = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(claims)}`;
  const sig = createHmac("sha256", secret).update(unsigned).digest("base64url");
  return { token: `${unsigned}.${sig}`, room, url: process.env.LIVEKIT_URL! };
}
