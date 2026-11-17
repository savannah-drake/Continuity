// lib/notify.ts: deliver an alert. Push goes to every phone/browser the person turned notifications on for;
// email goes to their Google sign-in address if they turned "Email me too" on.
// Env: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@...), RESEND_API_KEY, ALERT_FROM_EMAIL
import webpush from "web-push";
import { query } from "./db";

export type Alert = { title: string; body: string; url: string };

let vapidReady = false;
function setupVapid() {
  if (vapidReady) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:alerts@example.com", pub, priv);
  vapidReady = true;
  return true;
}

export async function sendPush(userId: number, a: Alert) {
  if (!setupVapid()) return 0;
  const subs = await query<{ endpoint: string; p256dh: string; auth: string }>(
`SELECT p.endpoint, p.p256dh, p.auth
FROM push_subscriptions p
WHERE p.user_id = $1`, [userId]);
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(a), { TTL: 24 * 3600 });
      sent += 1;
    } catch (e: any) {
      // The phone unsubscribed or the app was removed: forget that address
      if (e?.statusCode === 404 || e?.statusCode === 410) await query(
`DELETE FROM push_subscriptions
WHERE endpoint = $1`, [s.endpoint]);
      else console.error("push failed", e?.statusCode || e, String(e?.body ?? "").slice(0, 300));
    }
  }
  return sent;
}

export async function sendEmail(to: string, a: Alert, footer: string) {
  const key = process.env.RESEND_API_KEY, from = process.env.ALERT_FROM_EMAIL;
  if (!key || !from) return false;
  const link = new URL(a.url, process.env.APP_URL || "http://localhost:3000").toString();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: a.title, text: `${a.body}\n\n${link}\n\n${footer}` }),
  }).catch(() => null);
  if (!res?.ok) console.error("email failed", res?.status, await res?.text().catch(() => ""));
  return !!res?.ok;
}

// Push to every device they turned on, plus email if they turned that on. Returns true if anything went out.
export async function notifyUser(userId: number, a: Alert, emailFooter = "") {
  const pushed = await sendPush(userId, a).catch(() => 0);
  const [u] = await query<{ alert_email: boolean; email: string | null }>(
`SELECT u.alert_email, u.email
FROM users u
WHERE u.user_id = $1`, [userId]).catch(() => []);
  const emailed = u?.alert_email && u.email ? await sendEmail(u.email, a, emailFooter).catch(() => false) : false;
  return pushed > 0 || emailed;
}
