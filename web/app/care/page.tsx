// app/care/page.tsx: My care. Your medications (each with its own timeline and optional daily reminder),
// the people you see (a booking link from Zocdoc / Grow Therapy / Psychology Today is enough), and your visits,
// one-off or recurring. Visits and reminders go on Google Calendar when it's connected.
"use client";
import { useState } from "react";
import Link from "next/link";
import { useCopy } from "@/lib/i18n";
import { useMe, fmtShort, fmtSlot, type MedTimeline, type CareMember } from "@/lib/useMe";
import { SuggestInput } from "@/components/Suggest";
import { Screen, Field, inputClass, BottomNav } from "@/components/ui";
import { ExternalIcon, PhoneIcon, PlusIcon } from "@/components/icons";

const SITE_NAMES: Record<string, string> = { zocdoc: "Zocdoc", grow: "Grow Therapy", psychologytoday: "Psychology Today", therapyden: "TherapyDen", timelycare: "TimelyCare" };

const dot = (status: string) => (status === "red" ? "bg-coral" : status === "yellow" ? "bg-attn" : "bg-live");

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[15px] font-bold text-navy">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const linkBtn = "inline-flex items-center gap-1 text-sm font-semibold text-brand";
const rowList = "divide-y divide-line rounded-2xl border border-line bg-white";

export default function CarePage() {
  const C = useCopy();
  const K = C.care;
  const { me, state, reload } = useMe();
  const [medForm, setMedForm] = useState<null | { id?: number; m: MedDraft }>(null);
  const [personForm, setPersonForm] = useState<null | PersonDraft>(null);
  const [visitForm, setVisitForm] = useState<null | VisitDraft>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state === "loading") return <Screen nav><p className="text-muted">{C.booking.loading}</p><BottomNav active="care" /></Screen>;
  if (state !== "ready" || !me) {
    return <Screen nav><p className="text-muted">{C.auth.signedOutNote}</p><Link href="/" className={`${linkBtn} mt-3`}>{C.auth.google}</Link><BottomNav active="care" /></Screen>;
  }

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true); setNote(null);
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setNote(K.error); return null; }
    reload();
    return res.json().catch(() => ({}));
  }

  const zip = me.user.home_zip || "30322";
  const find = [
    { key: "psychologytoday", href: `https://www.psychologytoday.com/us/psychiatrists/${zip}` },
    { key: "zocdoc", href: "https://www.zocdoc.com/psychiatrists" },
    { key: "grow", href: "https://growtherapy.com/" },
    { key: "therapyden", href: "https://www.therapyden.com/" },
  ] as const;

  return (
    <Screen nav>
      <h1 className="text-[26px] font-bold text-navy">{K.title}</h1>
      <p className="mb-6 text-sm text-muted">{K.sub}</p>
      {note && <p className="mb-4 text-sm text-navy" role="status">{note}</p>}

      {/* Medications */}
      <Section title={K.meds} action={!medForm && <button className={linkBtn} onClick={() => setMedForm({ m: emptyMed() })}><PlusIcon size={16} />{K.addMed}</button>}>
        {me.medications.length === 0 && !medForm && <p className="text-sm text-muted">{K.medsEmpty}</p>}
        {me.medications.length > 0 && (
          <ul className={rowList}>
            {me.medications.map((m) => (
              <li key={m.medicationId} className="flex items-start gap-3 px-4 py-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot(m.status)}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy">{m.label}</p>
                  <p className="text-sm text-muted">
                    {K.daysLeftShort(m.daysLeft)} · {K.runsOut(fmtShort(m.supplyEndDate))}
                    {m.bookApptBy && !m.visitBooked ? ` · ${K.bookBy(fmtShort(m.bookApptBy))}` : ""}
                  </p>
                  {m.reminderTime && <p className="text-xs text-muted">{K.reminderAt(m.reminderTime)}</p>}
                </div>
                <div className="flex shrink-0 gap-3 text-sm">
                  <button className="font-semibold text-brand" onClick={() => setMedForm({ id: m.medicationId, m: medToDraft(m) })}>{K.editMed}</button>
                  <button className="text-muted" disabled={busy} onClick={() => send(`/api/medications?id=${m.medicationId}`, "DELETE")}>{K.removeMed}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {medForm && (
          <MedEditor draft={medForm.m} busy={busy} onCancel={() => setMedForm(null)}
            onSave={async (d) => {
              const ok = await send("/api/medications", medForm.id ? "PATCH" : "POST", { ...draftToMed(d), ...(medForm.id ? { medicationId: medForm.id } : {}) });
              if (ok) setMedForm(null);
            }} />
        )}
      </Section>

      {/* People you see */}
      <Section title={K.team} action={!personForm && <button className={linkBtn} onClick={() => setPersonForm(emptyPerson())}><PlusIcon size={16} />{K.addPerson}</button>}>
        {me.careTeam.length === 0 && !personForm && <p className="text-sm text-muted">{K.teamEmpty}</p>}
        {me.careTeam.length > 0 && (
          <ul className={rowList}>
            {me.careTeam.map((c) => (
              <li key={c.member_id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-navy">{memberName(c, K.roles)}</p>
                  <p className="text-sm text-muted">{K.roles[c.role as keyof typeof K.roles] ?? c.role}{c.source_site && SITE_NAMES[c.source_site] ? ` · ${SITE_NAMES[c.source_site]}` : ""}{c.video ? ` · ${K.video}` : ""}</p>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-sm">
                  {c.booking_url && <a href={c.booking_url} target="_blank" rel="noopener noreferrer" className={linkBtn}>{K.book}<ExternalIcon size={14} /></a>}
                  {c.phone && <a href={`tel:${c.phone}`} className={linkBtn} aria-label={K.call}><PhoneIcon size={16} /></a>}
                  <button className="text-muted" disabled={busy} onClick={() => send(`/api/care-team?id=${c.member_id}`, "DELETE")}>{K.remove}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {personForm && (
          <PersonEditor draft={personForm} busy={busy} onCancel={() => setPersonForm(null)}
            onSave={async (d) => { const ok = await send("/api/care-team", "POST", d); if (ok) setPersonForm(null); }} />
        )}

        <div className="mt-4">
          <p className="text-sm font-semibold text-navy">{K.find}</p>
          <p className="mb-2 text-xs text-muted">{K.findHelp}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {find.map((f) => (
              <a key={f.key} href={f.href} target="_blank" rel="noopener noreferrer" className={linkBtn}>
                {K.findSites[f.key]}<ExternalIcon size={14} />
              </a>
            ))}
            <Link href={`/providers?${new URLSearchParams({ plan: me.user.insurance_plan || "", type: "psychiatrist" })}`} className={linkBtn}>{K.findSites.continuity}</Link>
          </div>
        </div>
      </Section>

      {/* Visits */}
      <Section title={K.visits} action={!visitForm && <button className={linkBtn} onClick={() => me.careTeam.length ? setVisitForm(emptyVisit(me.careTeam[0].member_id)) : setNote(K.needTeam)}><PlusIcon size={16} />{K.addVisit}</button>}>
        {me.appointments.length === 0 && !visitForm && <p className="text-sm text-muted">{K.visitsEmpty}</p>}
        {me.appointments.length > 0 && (
          <ul className={rowList}>
            {me.appointments.map((a) => (
              <li key={`${a.visit_id ?? "s" + a.slot_id}-${a.slot_start}`} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-navy">{a.provider_name}</p>
                  <p className="text-sm text-muted">{fmtSlot(a.slot_start)}{a.recurring ? ` · ${K.recurring}` : ""}</p>
                </div>
                {a.visit_id && (
                  <button className="shrink-0 text-sm text-muted" disabled={busy} onClick={() => send(`/api/visits?id=${a.visit_id}`, "DELETE")}>
                    {a.recurring ? K.cancelSeries : K.cancelVisit}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {visitForm && (
          <VisitEditor draft={visitForm} team={me.careTeam} roles={K.roles} busy={busy} onCancel={() => setVisitForm(null)}
            onSave={async (d) => {
              const r = await send("/api/visits", "POST", {
                memberId: d.memberId, startsAt: new Date(d.when).toISOString(), durationMin: d.length, video: d.video,
                repeatEveryWeeks: d.repeat || null, repeatUntil: d.until || null,
              });
              if (r) {
                setVisitForm(null);
                setNote(r.calendar === "added" ? K.addedToCalendar : r.calendar === "failed" ? K.calendarFailed : K.notOnCalendar);
              }
            }} />
        )}
      </Section>
      <BottomNav active="care" />
    </Screen>
  );
}

function memberName(c: CareMember, roles: Record<string, string>) {
  if (c.provider_name) return c.provider_name;
  const site = c.source_site && SITE_NAMES[c.source_site];
  return site ? `${roles[c.role] ?? c.role} (${site})` : roles[c.role] ?? c.role;
}

// ---- Medication editor
type MedDraft = { label: string; days: number; refills: number; expires: string; needsVisit: boolean; lead: number; reminder: string };
const emptyMed = (): MedDraft => ({ label: "", days: 30, refills: 0, expires: "", needsVisit: true, lead: 14, reminder: "" });
const medToDraft = (m: MedTimeline): MedDraft => ({ label: m.label, days: m.daysLeft, refills: m.refillsRemaining, expires: m.rxExpiresOn ?? "", needsVisit: m.requiresAppointmentForRenewal, lead: m.bookingLeadDays, reminder: m.reminderTime ?? "" });
const draftToMed = (d: MedDraft) => ({
  label: d.label, daysSupplyRemaining: d.days, refillsRemaining: d.refills, rxExpiresOn: d.expires || null,
  requiresAppointmentForRenewal: d.needsVisit, bookingLeadDays: d.lead, reminderTime: d.reminder || null,
});

function Buttons({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  const K = useCopy().care;
  return (
    <div className="flex gap-3 pt-1">
      <button type="submit" disabled={busy} className="h-11 flex-1 rounded-full bg-brand text-sm font-bold text-white disabled:opacity-60">{K.save}</button>
      <button type="button" onClick={onCancel} className="h-11 flex-1 rounded-full border border-line text-sm font-bold text-navy">{K.cancel}</button>
    </div>
  );
}

function MedEditor({ draft, busy, onSave, onCancel }: { draft: MedDraft; busy: boolean; onSave: (d: MedDraft) => void; onCancel: () => void }) {
  const K = useCopy().care;
  const [d, setD] = useState(draft);
  return (
    <form className="mt-3 space-y-4 rounded-2xl border border-line bg-white p-4" onSubmit={(e) => { e.preventDefault(); if (d.label.trim()) onSave(d); }}>
      <Field label={K.medName}><SuggestInput value={d.label} onChange={(v) => setD({ ...d, label: v })} placeholder="Adderall 20 mg" label={K.medName} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={K.medDays}><input className={inputClass} type="number" min={0} value={d.days} onChange={(e) => setD({ ...d, days: Number(e.target.value) })} /></Field>
        <Field label={K.medRefills}><input className={inputClass} type="number" min={0} value={d.refills} onChange={(e) => setD({ ...d, refills: Number(e.target.value) })} /></Field>
      </div>
      <Field label={K.medExpires}><input className={inputClass} type="date" value={d.expires} onChange={(e) => setD({ ...d, expires: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm text-navy">
        <input type="checkbox" className="h-4 w-4 accent-[#5AA9D8]" checked={d.needsVisit} onChange={(e) => setD({ ...d, needsVisit: e.target.checked })} />
        {K.medNeedsVisit}
      </label>
      {d.needsVisit && <Field label={K.medLead}><input className={inputClass} type="number" min={1} value={d.lead} onChange={(e) => setD({ ...d, lead: Number(e.target.value) })} /></Field>}
      <Field label={K.medReminder} help={K.medReminderHelp}><input className={inputClass} type="time" value={d.reminder} onChange={(e) => setD({ ...d, reminder: e.target.value })} /></Field>
      <Buttons busy={busy} onCancel={onCancel} />
    </form>
  );
}

// ---- Person editor (a link is enough)
type PersonDraft = { bookingUrl: string; role: "psychiatrist" | "therapist" | "other"; providerName: string; phone: string; video: boolean };
const emptyPerson = (): PersonDraft => ({ bookingUrl: "", role: "psychiatrist", providerName: "", phone: "", video: false });

function PersonEditor({ draft, busy, onSave, onCancel }: { draft: PersonDraft; busy: boolean; onSave: (d: PersonDraft) => void; onCancel: () => void }) {
  const K = useCopy().care;
  const [d, setD] = useState(draft);
  return (
    <form className="mt-3 space-y-4 rounded-2xl border border-line bg-white p-4" onSubmit={(e) => { e.preventDefault(); if (d.bookingUrl.trim() || d.providerName.trim() || d.phone.trim()) onSave(d); }}>
      <Field label={K.link} help={K.linkHelp}>
        <input className={inputClass} type="url" inputMode="url" value={d.bookingUrl} onChange={(e) => setD({ ...d, bookingUrl: e.target.value })} placeholder="https://www.zocdoc.com/doctor/…" />
      </Field>
      <Field label={K.role}>
        <select className={inputClass} value={d.role} onChange={(e) => setD({ ...d, role: e.target.value as PersonDraft["role"] })}>
          {(["psychiatrist", "therapist", "other"] as const).map((r) => <option key={r} value={r}>{K.roles[r]}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={K.name}><input className={inputClass} value={d.providerName} onChange={(e) => setD({ ...d, providerName: e.target.value })} /></Field>
        <Field label={K.phone}><input className={inputClass} type="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-navy">
        <input type="checkbox" className="h-4 w-4 accent-[#5AA9D8]" checked={d.video} onChange={(e) => setD({ ...d, video: e.target.checked })} />
        {K.video}
      </label>
      <Buttons busy={busy} onCancel={onCancel} />
    </form>
  );
}

// ---- Visit editor (one-off or recurring)
type VisitDraft = { memberId: number; when: string; length: number; video: boolean; repeat: number; until: string };
function emptyVisit(memberId: number): VisitDraft {
  const t = new Date(Date.now() + 24 * 3600 * 1000);
  t.setMinutes(0, 0, 0);
  const local = new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return { memberId, when: local, length: 50, video: false, repeat: 0, until: "" };
}

function VisitEditor({ draft, team, roles, busy, onSave, onCancel }:
  { draft: VisitDraft; team: CareMember[]; roles: Record<string, string>; busy: boolean; onSave: (d: VisitDraft) => void; onCancel: () => void }) {
  const K = useCopy().care;
  const [d, setD] = useState(draft);
  return (
    <form className="mt-3 space-y-4 rounded-2xl border border-line bg-white p-4" onSubmit={(e) => { e.preventDefault(); if (d.when) onSave(d); }}>
      <Field label={K.visitWith}>
        <select className={inputClass} value={d.memberId} onChange={(e) => setD({ ...d, memberId: Number(e.target.value) })}>
          {team.map((c) => <option key={c.member_id} value={c.member_id}>{memberName(c, roles)}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <Field label={K.visitWhen}><input className={inputClass} type="datetime-local" value={d.when} onChange={(e) => setD({ ...d, when: e.target.value })} /></Field>
        <Field label={K.visitLength}><input className={inputClass} type="number" min={10} step={5} value={d.length} onChange={(e) => setD({ ...d, length: Number(e.target.value) })} /></Field>
      </div>
      <Field label={K.visitRepeat}>
        <select className={inputClass} value={d.repeat} onChange={(e) => setD({ ...d, repeat: Number(e.target.value) })}>
          <option value={0}>{K.repeatNone}</option>
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{K.repeatEvery(n)}</option>)}
        </select>
      </Field>
      {d.repeat > 0 && <Field label={K.repeatUntil}><input className={inputClass} type="date" value={d.until} onChange={(e) => setD({ ...d, until: e.target.value })} /></Field>}
      <label className="flex items-center gap-2 text-sm text-navy">
        <input type="checkbox" className="h-4 w-4 accent-[#5AA9D8]" checked={d.video} onChange={(e) => setD({ ...d, video: e.target.checked })} />
        {K.video}
      </label>
      <Buttons busy={busy} onCancel={onCancel} />
    </form>
  );
}
