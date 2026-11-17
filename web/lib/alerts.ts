// lib/alerts.ts: decide which refill/booking alerts are due and send each one once.
//   added      right after a medication is added or changed: the visit window in one line
//   visit_21/14/10  that many days left to see the psychiatrist (a good time to book)
//   book_now   every day in the last week before the visit deadline, until a psychiatry visit is in Continuity
//   out        every day once the supply has run out, until a visit is in
//   refill     a week before the refill is due (no visit needed)
//   request_rx controlled medication, no visit needed: ask the prescriber 3 days before, then daily
//   stock      controlled medication, 1-3 days before running out: call the pharmacy to check it's in stock
//   pickup     on the run-out day, when a refill should be ready: "Did you pick it up?"
//   after_visit the day after a psychiatry visit: "Did they send your prescription?"
//   trusted    a day after running out with no visit booked: one email to your trusted person (no health details)
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
  const who = me.user.display_name || A.someone;
  // Send each alert once: claim it, send it, and un-claim it if there was nowhere to send it (try again next run)
  const once = async (medicationId: number, key: string, send: () => Promise<boolean>) => {
    const claimed = await query(
`INSERT INTO alerts_sent (user_id, medication_id, alert_key)
VALUES ($1, $2, $3)
ON CONFLICT DO NOTHING
RETURNING alert_key`, [userId, medicationId, key]);
    if (!claimed.length) return;
    if (await send()) sent += 1;
    else await query(
`DELETE FROM alerts_sent
WHERE user_id = $1
AND medication_id = $2
AND alert_key = $3`, [userId, medicationId, key]);
  };

  // The day after a psychiatry visit: "Did they send your prescription?" (until you answer)
  const pv = me.lastPsychVisit;
  if (!opts.justSaved && pv && pv.date < me.today && !me.medications.some((m) => m.rxSentOn && m.rxSentOn >= pv.date)) {
    await once(0, `after_visit:${pv.date}`, () => deliver({ title: A.afterVisitTitle, body: A.afterVisitBody, url: "/care?check=rx" }));
  }

  for (const m of me.medications) {
    const due: { key: string; a: Alert }[] = [];
    const runsOut = day(m.supplyEndDate);
    const toEnd = diffDays(me.today, m.supplyEndDate);
    const needsVisit = !!m.bookApptBy && !m.visitBooked;
    if (needsVisit) {
      const visitBy = m.apptBy ?? m.supplyEndDate;
      const v = diffDays(me.today, visitBy); // days left to see the psychiatrist
      const out = toEnd <= 0;
      if (opts.justSaved === m.medicationId) {
        due.push({ key: `added:${visitBy}`, a: out
          ? { title: A.outTitle(m.label), body: A.outBody, url: "/call" }
          : { title: A.planTitle(m.label), body: m.bookApptBy! <= me.today ? A.planBookNow(runsOut, day(visitBy)) : A.planBook(runsOut, day(visitBy)), url: "/care" } });
      } else if (out) {
        due.push({ key: `out:${me.today}`, a: { title: A.outTitle(m.label), body: A.outBody, url: "/call" } });
      } else if (v <= 7) {
        due.push({ key: `book_now:${me.today}`, a: { title: A.nowTitle(m.label), body: A.nowBody(runsOut, day(visitBy)), url: "/call" } });
      } else if ([21, 14, 10].includes(v)) {
        due.push({ key: `visit_${v}:${visitBy}`, a: { title: A.soonTitle(m.label, v), body: A.soonBody(day(visitBy), runsOut), url: "/care" } });
      }
    } else if (m.requestRxBy && !m.rxSentOn) {
      // Controlled medication, no visit needed: ask the prescriber for this month's prescription
      const days = diffDays(me.today, m.requestRxBy);
      if (opts.justSaved === m.medicationId) due.push({ key: `added:${m.requestRxBy}`, a: { title: A.planTitle(m.label), body: A.planRequestRx(runsOut, day(m.requestRxBy)), url: "/care" } });
      else if (days <= 0) due.push({ key: `request_rx:${me.today}`, a: { title: A.requestRxTitle, body: A.requestRxBody(day(m.requestRxBy)), url: "/care" } });
      else if (days <= 3) due.push({ key: `request_rx:${m.requestRxBy}`, a: { title: A.requestRxTitle, body: A.requestRxBody(day(m.requestRxBy)), url: "/care" } });
    } else if (!m.bookApptBy && !m.requestRxBy && m.rxNeededBy && !m.rxSentOn) {
      const days = diffDays(me.today, m.rxNeededBy);
      if (opts.justSaved === m.medicationId) due.push({ key: `added:${m.rxNeededBy}`, a: { title: A.planTitle(m.label), body: A.planRefill(runsOut, day(m.rxNeededBy)), url: "/care" } });
      else if (days <= 7) due.push({ key: `refill:${m.rxNeededBy}`, a: { title: A.refillTitle(m.label), body: A.refillBody(day(m.rxNeededBy)), url: "/care" } });
    }
    if (!opts.justSaved) {
      // Controlled medications: call the pharmacy 3 days out to check it's in stock (shortages are common)
      if (m.controlled && toEnd >= 1 && toEnd <= 3) {
        due.push({ key: `stock:${m.supplyEndDate}`, a: { title: A.stockTitle, body: A.stockBody(runsOut, m.pharmacy?.name ?? null), url: "/care" } });
      }
      // Run-out day (or just after) when a refill should be available: "Did you pick it up?"
      if (!needsVisit && toEnd <= 0 && toEnd >= -2) {
        due.push({ key: `pickup:${m.supplyEndDate}`, a: { title: A.pickupTitle, body: A.pickupBody, url: `/care?pickup=${m.medicationId}` } });
      }
      // Trusted person: once per supply, a day after running out with no visit booked
      if (me.trusted && needsVisit && toEnd <= -1) {
        const t = me.trusted;
        await once(m.medicationId, `trusted:${m.supplyEndDate}`, () =>
          sendEmail(t.email, { title: A.trustedTitle(who), body: A.trustedBody(who, t.contact_name), url: "/" }, A.trustedFooter(who)));
      }
    }
    for (const d of due) await once(m.medicationId, d.key, () => deliver(d.a));
  }
  return { sent };
}

// Everyone who can receive alerts
export async function runAllAlerts() {
  const users = await query<{ user_id: number }>(
`SELECT DISTINCT u.user_id
FROM users u
LEFT JOIN push_subscriptions p ON p.user_id = u.user_id
LEFT JOIN trusted_contacts t ON t.user_id = u.user_id
WHERE p.endpoint IS NOT NULL
OR (u.alert_email AND u.email IS NOT NULL)
OR t.email IS NOT NULL`);
  let sent = 0;
  for (const u of users) sent += (await runAlerts(u.user_id).catch((e) => { console.error("alerts failed", u.user_id, e); return { sent: 0 }; })).sent;
  return { users: users.length, sent };
}
