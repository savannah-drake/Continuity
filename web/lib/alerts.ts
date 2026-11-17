// lib/alerts.ts: decide which refill/booking alerts are due and send each one once.
//   added      right after a medication is added or changed: the visit window in one line
//   visit_21/14/10  that many days left to see the psychiatrist (a good time to book)
//   book_now   every day in the last week before the visit deadline, until a psychiatry visit is in Continuity
//   out        every day once the supply has run out, until a visit is in
//   refill     a week before the refill is due (no visit needed)
// Runs daily from Vercel Cron (/api/cron/alerts) and right after a medication is saved.
import { query } from "./db";
import { getMe } from "./me";
import { copyFor, isLang, localeFor } from "./copy";
import { diffDays } from "./engine";
import { sendPush, sendEmail, type Alert } from "./notify";

export async function runAlerts(userId: number, opts: { justSaved?: number; test?: boolean } = {}) {
  const me = await getMe(userId);
  if (!me) return { sent: 0 };
  const lang = isLang(me.user.preferred_language) ? me.user.preferred_language : "en";
  const A = copyFor(lang).alerts;
  const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(localeFor(lang), { month: "short", day: "numeric" });
  const [prefs] = await query<{ alert_email: boolean; email: string | null }>(
`SELECT u.alert_email, u.email
FROM users u
WHERE u.user_id = $1`, [userId]);

  const deliver = async (a: Alert) => {
    const pushed = await sendPush(userId, a);
    const emailed = prefs?.alert_email && prefs.email ? await sendEmail(prefs.email, a, A.emailFooter) : false;
    return pushed > 0 || emailed;
  };
  if (opts.test) return { sent: (await deliver({ title: A.testTitle, body: A.testBody, url: "/" })) ? 1 : 0 };

  let sent = 0;
  for (const m of me.medications) {
    const due: { key: string; a: Alert }[] = [];
    const runsOut = day(m.supplyEndDate);
    if (m.bookApptBy && !m.visitBooked) {
      const visitBy = m.apptBy ?? m.supplyEndDate;
      const v = diffDays(me.today, visitBy); // days left to see the psychiatrist
      const out = m.supplyEndDate <= me.today;
      if (opts.justSaved === m.medicationId) {
        due.push({ key: `added:${visitBy}`, a: out
          ? { title: A.outTitle(m.label), body: A.outBody, url: "/call" }
          : { title: A.planTitle(m.label), body: m.bookApptBy <= me.today ? A.planBookNow(runsOut, day(visitBy)) : A.planBook(runsOut, day(visitBy)), url: "/care" } });
      } else if (out) {
        due.push({ key: `out:${me.today}`, a: { title: A.outTitle(m.label), body: A.outBody, url: "/call" } });
      } else if (v <= 7) {
        due.push({ key: `book_now:${me.today}`, a: { title: A.nowTitle(m.label), body: A.nowBody(runsOut, day(visitBy)), url: "/call" } });
      } else if ([21, 14, 10].includes(v)) {
        due.push({ key: `visit_${v}:${visitBy}`, a: { title: A.soonTitle(m.label, v), body: A.soonBody(day(visitBy), runsOut), url: "/care" } });
      }
    } else if (!m.bookApptBy && m.rxNeededBy) {
      const days = diffDays(me.today, m.rxNeededBy);
      if (opts.justSaved === m.medicationId) due.push({ key: `added:${m.rxNeededBy}`, a: { title: A.planTitle(m.label), body: A.planRefill(runsOut, day(m.rxNeededBy)), url: "/care" } });
      else if (days <= 7) due.push({ key: `refill:${m.rxNeededBy}`, a: { title: A.refillTitle(m.label), body: A.refillBody(day(m.rxNeededBy)), url: "/care" } });
    }
    for (const d of due) {
      // Claim the alert first so two runs at once can't both send it
      const claimed = await query(
`INSERT INTO alerts_sent (user_id, medication_id, alert_key)
VALUES ($1, $2, $3)
ON CONFLICT DO NOTHING
RETURNING alert_key`, [userId, m.medicationId, d.key]);
      if (!claimed.length) continue;
      if (await deliver(d.a)) sent += 1;
      else await query(
`DELETE FROM alerts_sent
WHERE user_id = $1
AND medication_id = $2
AND alert_key = $3`, [userId, m.medicationId, d.key]); // nowhere to send it yet: try again next run
    }
  }
  return { sent };
}

// Everyone who can receive alerts
export async function runAllAlerts() {
  const users = await query<{ user_id: number }>(
`SELECT DISTINCT u.user_id
FROM users u
LEFT JOIN push_subscriptions p ON p.user_id = u.user_id
WHERE p.endpoint IS NOT NULL
OR (u.alert_email AND u.email IS NOT NULL)`);
  let sent = 0;
  for (const u of users) sent += (await runAlerts(u.user_id).catch((e) => { console.error("alerts failed", u.user_id, e); return { sent: 0 }; })).sent;
  return { users: users.length, sent };
}
