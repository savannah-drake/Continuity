// POST /api/agent/actions (agent only, x-agent-key): things the voice agent can do for the caller, the same as tapping
// in My care. Body {userId, action, ...}:
//   refilled      {medicationId}                     "I picked up my refill" (countdown starts over)
//   rx_sent       {}                                 "My psychiatrist sent the prescription"
//   add_medication {label, daysLeft, refills?, needsVisit?}
//   send_link     {what: "booking" | "pharmacy" | "find", role?}   push/email a link to their phone
import { agentAuthorized, unauthorized } from "@/lib/agentApi";
import { markRefilled, markRxSent, upsertMedication, cleanMed, syncMedReminders } from "@/lib/medications";
import { getMe } from "@/lib/me";
import { notifyUser } from "@/lib/notify";
import { runAlerts } from "@/lib/alerts";
import { copyFor, isLang } from "@/lib/copy";

export async function POST(req: Request) {
  if (!agentAuthorized(req)) return unauthorized();
  const b = await req.json().catch(() => null);
  const userId = Number(b?.userId);
  if (!Number.isInteger(userId) || userId <= 0) return Response.json({ ok: false, reason: "no_user" }, { status: 400 });

  switch (b?.action) {
    case "refilled": {
      const ok = await markRefilled(userId, Number(b.medicationId));
      if (ok) await syncMedReminders(userId).catch(() => {});
      return Response.json({ ok, say: ok ? "Done: the countdown started over." : "Couldn't find that medication." });
    }
    case "rx_sent": {
      await markRxSent(userId);
      await syncMedReminders(userId).catch(() => {});
      return Response.json({ ok: true });
    }
    case "add_medication": {
      const m = cleanMed({
        label: b.label, daysSupplyRemaining: b.daysLeft, refillsRemaining: b.refills ?? 0,
        requiresAppointmentForRenewal: b.needsVisit ?? true, bookingLeadDays: 14, fillDays: 30,
      });
      if (!m) return Response.json({ ok: false, reason: "need_name_and_days" }, { status: 400 });
      const medicationId = await upsertMedication(userId, m);
      await syncMedReminders(userId).catch(() => {});
      await runAlerts(userId, { justSaved: medicationId }).catch(() => {});
      return Response.json({ ok: true, medicationId });
    }
    case "send_link": {
      const me = await getMe(userId);
      if (!me) return Response.json({ ok: false, reason: "no_user" }, { status: 404 });
      const lang = isLang(me.user.preferred_language) ? me.user.preferred_language : "en";
      const A = copyFor(lang).alerts;
      const role = b.role === "therapist" ? "therapist" : "psychiatrist";
      let alert: { title: string; body: string; url: string } | null = null;
      if (b.what === "pharmacy") {
        const p = me.pharmacies.find((x) => x.preferred) ?? me.pharmacies[0];
        if (!p) return Response.json({ ok: false, reason: "no_pharmacy", say: "Say they haven't added a pharmacy yet; they can in My care." });
        alert = { title: A.linkPharmacyTitle(p.pharmacy_name), body: p.phone ? A.linkPharmacyBody(p.phone) : (p.address ?? ""), url: "/care" };
      } else if (b.what === "booking") {
        const member = me.careTeam.find((c) => c.role === role && c.booking_url);
        alert = member
          ? { title: A.linkBookingTitle(member.provider_name), body: A.linkBookingBody, url: member.booking_url! }
          : { title: A.linkFindTitle, body: A.linkFindBody, url: "/care#find" };
      } else {
        alert = { title: A.linkFindTitle, body: A.linkFindBody, url: "/care#find" };
      }
      const sent = await notifyUser(userId, alert, A.emailFooter);
      return Response.json(sent ? { ok: true, sent: true }
        : { ok: false, sent: false, say: "Say notifications and email aren't on yet; they can turn them on in Profile, under Alerts. The link is also in My care." });
    }
    default:
      return Response.json({ ok: false, reason: "unknown_action" }, { status: 400 });
  }
}
