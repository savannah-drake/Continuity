// app/care/page.tsx: My care. Your medications (each with its own timeline and optional daily reminder),
// the people you see (a booking link from Zocdoc / Grow Therapy / Psychology Today is enough), and your visits,
// one-off or recurring. Visits and reminders go on Google Calendar when it's connected.
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useCopy } from "@/lib/i18n";
import { useMe, visitLine, fmtShort, fmtSlot, type MedTimeline, type CareMember, type Pharmacy } from "@/lib/useMe";
import { SuggestInput } from "@/components/Suggest";
import { Screen, Field, inputClass, BottomNav, DisplayTitle, SectionTitle, Scallop, MascotPeek, Avatar, statusTone, toneBg, inkBtn, outlineBtn, smallInkBtn, smallOutlineBtn, quietBtn, roundBtn } from "@/components/ui";
import { ExternalIcon, PhoneIcon, PlusIcon } from "@/components/icons";
import { findLinks } from "@/lib/findLinks";
import { PLANS } from "@/lib/copy";

const SITE_NAMES: Record<string, string> = { zocdoc: "Zocdoc", grow: "Grow Therapy", psychologytoday: "Psychology Today", therapyden: "TherapyDen", timelycare: "TimelyCare" };

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-9">
      <SectionTitle action={action}>{title}</SectionTitle>
      {children}
    </section>
  );
}

const linkBtn = smallOutlineBtn;
const rowList = "divide-y divide-line overflow-hidden rounded-[30px] bg-white";
const promptCard = "mb-5 rounded-[30px] bg-white p-5";

export default function CarePage() {
  const C = useCopy();
  const K = C.care;
  const { me, state, reload } = useMe();
  const [medForm, setMedForm] = useState<null | { id?: number; m: MedDraft }>(null);
  const [personForm, setPersonForm] = useState<null | PersonDraft>(null);
  const [visitForm, setVisitForm] = useState<null | VisitDraft>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // After "Book" opens Zocdoc / Grow / etc. in another tab, ask on return whether they booked
  const [bookingWith, setBookingWith] = useState<number | null>(null);
  const [findKind, setFindKind] = useState<"psychiatrist" | "therapist">("psychiatrist");
  const [findPlan, setFindPlan] = useState<string | null>(null);
  const [askBooked, setAskBooked] = useState<number | null>(null);
  const [pharmForm, setPharmForm] = useState<null | { id?: number; name: string; phone: string; address: string }>(null);
  // Pharmacy search near your ZIP (CMS NPI Registry)
  const [pharmSearch, setPharmSearch] = useState<null | { zip: string; q: string; loading: boolean; results: { npi: string; name: string; address: string; phone: string | null; miles?: number }[] }>(null);
  const [pharmTimer, setPharmTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  async function searchPharmacies(zip?: string, q?: string) {
    setPharmSearch((s) => ({ zip: zip ?? s?.zip ?? "", q: q ?? s?.q ?? "", loading: true, results: s?.results ?? [] }));
    const params = new URLSearchParams();
    if (zip) params.set("zip", zip);
    if (q) params.set("q", q);
    const d = await fetch(`/api/pharmacies/search?${params}`).then((r) => r.json()).catch(() => ({ pharmacies: [] }));
    setPharmSearch((s) => ({ zip: d.zip ?? zip ?? "", q: s?.q ?? "", loading: false, results: d.pharmacies ?? [] }));
  }
  const [personEdit, setPersonEdit] = useState<null | { id: number; d: PersonDraft }>(null);
  // Check-ins: "Did you pick up your refill?" and, after a psychiatry visit, "Did they send your prescription?"
  const [hidden, setHidden] = useState<string[]>([]);
  const [rxNotYet, setRxNotYet] = useState(false);
  const [pickupFor, setPickupFor] = useState<number | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = Number(q.get("pickup"));
    if (id) setPickupFor(id);
  }, []);
  // Calendar events like "Appointment with Antionette Holt" that might be visits (only when auto-import is on)
  const [suggestions, setSuggestions] = useState<{ eventId: string; name: string; startsAt: string }[]>([]);
  const autoImport = !!me?.user.auto_import_visits;
  useEffect(() => {
    if (!autoImport) return;
    fetch("/api/visits/suggestions").then((r) => (r.ok ? r.json() : { suggestions: [] })).then((d) => setSuggestions(d.suggestions ?? [])).catch(() => {});
  }, [autoImport]);
  useEffect(() => {
    if (!bookingWith) return;
    const onBack = () => { if (document.visibilityState === "visible") { setAskBooked(bookingWith); setBookingWith(null); } };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => { document.removeEventListener("visibilitychange", onBack); window.removeEventListener("focus", onBack); };
  }, [bookingWith]);

  if (state === "loading") return <Screen nav><p className="text-muted">{C.booking.loading}</p><BottomNav active="care" /></Screen>;
  if (state !== "ready" || !me) {
    return <Screen nav><p className="text-muted">{C.auth.signedOutNote}</p><Link href="/" className={`${smallInkBtn} mt-3`}>{C.auth.google}</Link><BottomNav active="care" /></Screen>;
  }

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true); setNote(null);
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setNote(K.error); return null; }
    reload();
    return res.json().catch(() => ({}));
  }

  const plan = findPlan ?? me.user.insurance_plan ?? "";
  const links = findLinks({ plan, kind: findKind, zip: me.user.home_zip });
  const find = (["psychologytoday", "zocdoc", "grow", "therapyden"] as const).map((key) => ({ key, href: links[key], filtered: links.filtered[key] }));

  return (
    <Screen nav>
      <div className="mb-7 text-center">
        <DisplayTitle text={K.title} />
        <p className="mx-auto mt-2 max-w-[280px] text-[15px] leading-relaxed text-muted">{K.sub}</p>
      </div>
      {note && <p className="mb-5 rounded-2xl bg-mint px-4 py-3 text-sm font-semibold text-navy" role="status">{note}</p>}

      {/* Back from the booking site: save the visit they just booked */}
      {askBooked && (() => {
        const who = me.careTeam.find((c) => c.member_id === askBooked);
        if (!who) return null;
        return (
          <div className={promptCard}>
            <p className="text-[16px] font-bold text-navy">{K.didYouBook(memberName(who, K.roles))}</p>
            <p className="mb-3 text-sm text-muted">{K.didYouBookHelp}</p>
            <div className="flex flex-wrap gap-2.5">
              <button className={smallInkBtn} onClick={() => {
                setVisitForm({ ...emptyVisit(who.member_id), video: who.video }); setAskBooked(null);
                setTimeout(() => document.getElementById("visit-form")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
              }}>{K.yesAddIt}</button>
              <button className={smallOutlineBtn} onClick={() => setAskBooked(null)}>{K.notYet}</button>
            </div>
          </div>
        );
      })()}

      {/* "Is this a visit?" for booking-email events we couldn't place */}
      {suggestions.map((s) => (
        <div key={s.eventId} className={promptCard}>
          <p className="text-[16px] font-bold text-navy">{K.isThisVisit(s.name, fmtSlot(s.startsAt))}</p>
          <p className="mb-3 text-sm text-muted">{K.isThisVisitHelp}</p>
          <div className="flex flex-wrap gap-2.5">
            {(["therapist", "psychiatrist", null] as const).map((role) => (
              <button key={String(role)} disabled={busy} className={role ? smallInkBtn : smallOutlineBtn} onClick={async () => {
                const r = await send("/api/visits/suggestions", "POST", { eventId: s.eventId, role });
                if (r) setSuggestions((list) => list.filter((x) => x.eventId !== s.eventId));
              }}>{role === "therapist" ? K.asTherapist : role === "psychiatrist" ? K.asPsychiatrist : K.notAVisit}</button>
            ))}
          </div>
        </div>
      ))}

      {/* After a psychiatry visit: did the prescription go out? */}
      {(() => {
        const pv = me.lastPsychVisit;
        if (!pv || hidden.includes("rx") || me.medications.length === 0 || me.medications.some((m) => m.rxSentOn && m.rxSentOn >= pv.date)) return null;
        const office = me.careTeam.find((c) => c.role === "psychiatrist" && c.phone && (!pv.who || c.provider_name === pv.who)) ?? me.careTeam.find((c) => c.role === "psychiatrist" && c.phone);
        const soonest = me.medications[0];
        return (
          <div className="mb-5">
          <MascotPeek>
          <div className="rounded-[30px] bg-white p-5">
            <p className="pr-16 text-[16px] font-bold text-navy">{K.afterVisitQ(pv.who)}</p>
            {!rxNotYet ? (
              <div className="mt-3 flex flex-wrap gap-2.5">
                <button className={smallInkBtn} disabled={busy} onClick={async () => { if (await send("/api/medications/rx-sent", "POST")) setHidden((h) => [...h, "rx"]); }}>{K.yesSent}</button>
                <button className={smallOutlineBtn} onClick={() => setRxNotYet(true)}>{K.notSent}</button>
              </div>
            ) : (
              <div className="mt-2 text-sm">
                <p className="font-semibold text-navy">{K.callScriptTitle}</p>
                <p className="mb-3 rounded-2xl bg-mist p-3 text-navy">{K.callScript(fmtShort(pv.date), fmtShort(soonest.supplyEndDate))}</p>
                <div className="flex flex-wrap gap-2.5">
                  {office?.phone && <a href={`tel:${office.phone}`} className={smallInkBtn}><PhoneIcon size={16} />{K.callOffice}</a>}
                  <button className={quietBtn} onClick={() => setHidden((h) => [...h, "rx"])}>{K.cancel}</button>
                </div>
              </div>
            )}
          </div>
          </MascotPeek>
          </div>
        );
      })()}

      {/* Run-out day: did you pick up the refill? */}
      {me.medications.filter((m) => !hidden.includes(`pickup${m.medicationId}`) && (pickupFor === m.medicationId || (m.daysLeft <= 1 && !(m.bookApptBy && !m.visitBooked) && !(m.requestRxBy && !m.rxSentOn)))).map((m) => (
        <div key={`pickup${m.medicationId}`} className={promptCard}>
          <p className="text-[16px] font-bold text-navy">{K.didPickUp(m.label)}</p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button className={smallInkBtn} disabled={busy} onClick={async () => { if (await send("/api/medications/refilled", "POST", { medicationId: m.medicationId })) { setHidden((h) => [...h, `pickup${m.medicationId}`]); setNote(K.pickedUpDone); } }}>{K.yesPickedUp}</button>
            {m.pharmacy?.phone && <a href={`tel:${m.pharmacy.phone}`} className={linkBtn}><PhoneIcon size={16} />{K.callPharmacy(m.pharmacy.name)}</a>}
            <button className={smallOutlineBtn} onClick={() => setHidden((h) => [...h, `pickup${m.medicationId}`])}>{K.notYet}</button>
          </div>
        </div>
      ))}

      {/* Medications */}
      <Section title={K.meds} action={!medForm && <button className={linkBtn} onClick={() => setMedForm({ m: emptyMed() })}><PlusIcon size={16} />{K.addMed}</button>}>
        {me.medications.length === 0 && !medForm && <p className="text-sm text-muted">{K.medsEmpty}</p>}
        {me.medications.length > 0 && (
          <div className="flex flex-col gap-3">
            {me.medications.map((m) => {
              const tone = statusTone(m.status);
              return (
              <div key={m.medicationId} className={`flex flex-col gap-3.5 rounded-[30px] p-5 ${toneBg[tone]}`}>
                <div className="flex items-center gap-3.5">
                  <Scallop size={76} tone={tone === "rose" ? "butter" : "white"}>
                    <p className="font-display text-[28px] font-bold leading-none text-navy">{Math.max(0, m.daysLeft)}</p>
                    <p className="text-[11px] font-bold text-navy">{C.home.daysLeftBadge}</p>
                  </Scallop>
                  <div className="min-w-0 flex-1">
                    {m.status === "red" && <span className="mb-1.5 inline-block rounded-full bg-navy px-2.5 py-0.5 text-[11px] font-bold text-white">{C.home.urgent}</span>}
                    <p className="font-display text-[23px] font-semibold leading-tight text-navy">{m.label}</p>
                    <p className="mt-1 text-[13px] leading-snug text-navy/80">
                      {K.runsOut(fmtShort(m.supplyEndDate))}
                      {m.rxSentOn ? ` · ${K.rxSentLine(m.pharmacy?.name ?? null)}`
                        : m.bookApptBy && !m.visitBooked ? ` · ${visitLine(m, me.today, K, fmtShort)}`
                        : m.requestRxBy && m.nextAction === "request_rx" ? ` · ${K.requestRxBy(fmtShort(m.requestRxBy))}` : ""}
                    </p>
                  </div>
                </div>
                {m.controlled && <p className="rounded-2xl bg-white/55 px-3.5 py-3 text-[13px] leading-relaxed text-navy">{K.controlledNote}</p>}
                {(m.pharmacy || m.reminderTime) && (
                  <p className="text-[13px] text-navy/75">
                    {m.pharmacy && <>{K.medPharmacy}: {m.pharmacy.name}</>}
                    {m.pharmacy && m.reminderTime && " · "}
                    {m.reminderTime && K.reminderAt(m.reminderTime)}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button className={smallInkBtn} disabled={busy}
                    onClick={async () => { if (await send("/api/medications/refilled", "POST", { medicationId: m.medicationId })) setNote(K.pickedUpDone); }}>{K.pickedUp}</button>
                  {m.pharmacy?.phone && <a href={`tel:${m.pharmacy.phone}`} className={smallOutlineBtn} aria-label={K.callPharmacy(m.pharmacy.name)}><PhoneIcon size={15} />{K.call}</a>}
                  {/* An online refill only works when there's a refill left (never for controlled medications) */}
                  {m.pharmacy?.refillUrl && !m.controlled && (m.refillsRemaining > 0 || !!m.rxSentOn) && (
                    <a href={m.pharmacy.refillUrl} target="_blank" rel="noopener noreferrer" className={smallOutlineBtn}>{K.refillOnline}<ExternalIcon size={13} /></a>
                  )}
                  <button className={smallOutlineBtn} onClick={() => setMedForm({ id: m.medicationId, m: medToDraft(m) })}>{K.editMed}</button>
                  <button className={quietBtn} disabled={busy} onClick={() => send(`/api/medications?id=${m.medicationId}`, "DELETE")}>{K.removeMed}</button>
                </div>
              </div>
              );
            })}
          </div>
        )}
        {medForm && (
          <MedEditor draft={medForm.m} pharmacies={me.pharmacies} busy={busy} onCancel={() => setMedForm(null)}
            onSave={async (d) => {
              const ok = await send("/api/medications", medForm.id ? "PATCH" : "POST", { ...draftToMed(d), ...(medForm.id ? { medicationId: medForm.id } : {}) });
              if (ok) setMedForm(null);
            }} />
        )}
      </Section>

      {/* Pharmacies */}
      <Section title={K.pharmacies} action={!pharmForm && !pharmSearch && <button className={linkBtn} onClick={() => searchPharmacies()}><PlusIcon size={16} />{K.addPharmacy}</button>}>
        {me.pharmacies.length === 0 && !pharmForm && !pharmSearch && <p className="text-sm text-muted">{K.pharmaciesEmpty}</p>}
        {pharmSearch && (
          <div className="mt-3 rounded-[30px] bg-white p-5">
            <div className="mb-3 grid grid-cols-[1fr_7rem] gap-2">
              <input className={inputClass} aria-label={K.pharmacyFilter} placeholder={K.pharmacyFilter} value={pharmSearch.q}
                onChange={(e) => {
                  const q = e.target.value;
                  setPharmSearch({ ...pharmSearch, q });
                  if (pharmTimer) clearTimeout(pharmTimer);
                  setPharmTimer(setTimeout(() => searchPharmacies(pharmSearch.zip || undefined, q), 300));
                }} />
              <input className={inputClass} aria-label={K.pharmacyZip} inputMode="numeric" maxLength={5} placeholder="ZIP" value={pharmSearch.zip}
                onChange={(e) => { const z = e.target.value.replace(/\D/g, "").slice(0, 5); setPharmSearch({ ...pharmSearch, zip: z }); if (z.length === 5) searchPharmacies(z, pharmSearch.q); }} />
            </div>
            {pharmSearch.loading ? <p className="text-sm text-muted">{K.pharmacySearching}</p> : (() => {
              const list = pharmSearch.results;
              const saved = new Set(me.pharmacies.map((p) => p.pharmacy_name.toLowerCase() + "|" + (p.address ?? "").toLowerCase()));
              return list.length === 0 ? <p className="text-sm text-muted">{K.pharmacyNone(pharmSearch.zip)}</p> : (
                <>
                  <p className="mb-2 text-xs text-muted">{pharmSearch.zip ? K.pharmacyNear(pharmSearch.zip) : K.pharmacyNearYou}</p>
                  <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                    {list.map((p) => (
                      <li key={p.npi} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-navy">{p.name}</p>
                          <p className="truncate text-xs text-muted">{p.miles != null ? `${p.miles} mi · ` : ""}{p.address}{p.phone ? ` · ${p.phone}` : ""}</p>
                        </div>
                        {saved.has(p.name.toLowerCase() + "|" + p.address.toLowerCase())
                          ? <span className="shrink-0 text-xs text-muted">{K.pharmacyAdded}</span>
                          : <button className={`${smallInkBtn} shrink-0`} disabled={busy}
                              onClick={() => send("/api/pharmacies", "POST", { name: p.name, phone: p.phone, address: p.address })}>{K.addPharmacy}</button>}
                      </li>
                    ))}
                  </ul>
                </>
              );
            })()}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={smallOutlineBtn} onClick={() => { setPharmSearch(null); setPharmForm({ name: "", phone: "", address: "" }); }}>{K.pharmacyManual}</button>
              <button className={smallInkBtn} onClick={() => setPharmSearch(null)}>{K.done}</button>
            </div>
            <p className="mt-2 text-[11px] text-muted">{K.pharmacySource}</p>
          </div>
        )}
        {me.pharmacies.length > 0 && (
          <ul className={rowList}>
            {me.pharmacies.map((p) => (
              <li key={p.pharmacy_id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-navy">{p.pharmacy_name}{p.preferred && <span className="ml-2 rounded-full bg-mint px-2 py-0.5 text-[11px] font-bold text-navy">{K.preferred}</span>}</p>
                  {p.address && <p className="truncate text-sm text-muted">{p.address}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {p.phone && <a href={`tel:${p.phone}`} className={roundBtn} aria-label={K.callPharmacy(p.pharmacy_name)}><PhoneIcon size={17} /></a>}
                  {!p.preferred && <button className={smallOutlineBtn} disabled={busy} onClick={() => send("/api/pharmacies", "PATCH", { pharmacyId: p.pharmacy_id, preferred: true })}>{K.makePreferred}</button>}
                  <button className={smallOutlineBtn} onClick={() => { setPharmSearch(null); setPharmForm({ id: p.pharmacy_id, name: p.pharmacy_name, phone: p.phone ?? "", address: p.address ?? "" }); }}>{K.edit}</button>
                  <button className={quietBtn} disabled={busy} onClick={() => send(`/api/pharmacies?id=${p.pharmacy_id}`, "DELETE")}>{K.remove}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {pharmForm && (
          <form className="mt-3 space-y-4 rounded-[30px] bg-white p-5" onSubmit={async (e) => {
            e.preventDefault();
            if (!pharmForm.name.trim()) return;
            const ok = pharmForm.id
              ? await send("/api/pharmacies", "PATCH", { pharmacyId: pharmForm.id, name: pharmForm.name, phone: pharmForm.phone, address: pharmForm.address })
              : await send("/api/pharmacies", "POST", pharmForm);
            if (ok) setPharmForm(null);
          }}>
            <Field label={K.pharmacyName}><input className={inputClass} value={pharmForm.name} onChange={(e) => setPharmForm({ ...pharmForm, name: e.target.value })} placeholder="CVS Pharmacy, N Decatur Rd" /></Field>
            <Field label={K.pharmacyPhone}><input className={inputClass} type="tel" value={pharmForm.phone} onChange={(e) => setPharmForm({ ...pharmForm, phone: e.target.value })} /></Field>
            <Field label={K.pharmacyAddress}><input className={inputClass} value={pharmForm.address} onChange={(e) => setPharmForm({ ...pharmForm, address: e.target.value })} /></Field>
            <Buttons busy={busy} onCancel={() => setPharmForm(null)} />
          </form>
        )}
      </Section>

      {/* People you see */}
      <Section title={K.team} action={!personForm && <button className={linkBtn} onClick={() => setPersonForm(emptyPerson())}><PlusIcon size={16} />{K.addPerson}</button>}>
        {me.careTeam.length === 0 && !personForm && <p className="text-sm text-muted">{K.teamEmpty}</p>}
        {me.careTeam.length > 0 && (
          <ul className={rowList}>
            {me.careTeam.map((c) => (
              <li key={c.member_id} className="flex items-center gap-3 px-4 py-3.5">
                <Avatar name={memberName(c, K.roles)} role={c.role} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-navy">{memberName(c, K.roles)}</p>
                  <p className="text-sm text-muted">{K.roles[c.role as keyof typeof K.roles] ?? c.role}{c.source_site && SITE_NAMES[c.source_site] ? ` · ${SITE_NAMES[c.source_site]}` : ""}{c.video ? ` · ${K.video}` : ""}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {c.booking_url && <a href={c.booking_url} target="_blank" rel="noopener noreferrer" className={smallInkBtn}
                    onClick={() => { setAskBooked(null); setTimeout(() => setBookingWith(c.member_id), 300); }}>{K.book}<ExternalIcon size={14} /></a>}
                  {c.phone && <a href={`tel:${c.phone}`} className={roundBtn} aria-label={K.call}><PhoneIcon size={17} /></a>}
                  <button className={smallOutlineBtn} onClick={() => setPersonEdit({ id: c.member_id, d: { bookingUrl: c.booking_url ?? "", role: (c.role as PersonDraft["role"]) ?? "other", providerName: c.provider_name ?? "", phone: c.phone ?? "", video: c.video } })}>{K.edit}</button>
                  <button className={quietBtn} disabled={busy} onClick={() => send(`/api/care-team?id=${c.member_id}`, "DELETE")}>{K.remove}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {personEdit && (
          <PersonEditor key={personEdit.id} draft={personEdit.d} busy={busy} onCancel={() => setPersonEdit(null)}
            onSave={async (d) => { const ok = await send("/api/care-team", "PATCH", { ...d, memberId: personEdit.id }); if (ok) setPersonEdit(null); }} />
        )}
        {personForm && (
          <PersonEditor draft={personForm} busy={busy} onCancel={() => setPersonForm(null)}
            onSave={async (d) => { const ok = await send("/api/care-team", "POST", d); if (ok) setPersonForm(null); }} />
        )}

        <div id="find" className="mt-5 scroll-mt-6 rounded-[30px] bg-lavender p-5">
          <p className="font-display text-[20px] font-semibold text-navy">{K.find}</p>
          <p className="mb-3 text-[13px] text-navy/75">{K.findHelp}</p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <select aria-label={K.role} className={inputClass} value={findKind} onChange={(e) => setFindKind(e.target.value as "psychiatrist" | "therapist")}>
              <option value="psychiatrist">{K.roles.psychiatrist}</option>
              <option value="therapist">{K.roles.therapist}</option>
            </select>
            <select aria-label={C.profile.plan} className={inputClass} value={plan} onChange={(e) => setFindPlan(e.target.value)}>
              {[...new Set([plan, ...PLANS])].filter(Boolean).map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {find.map((f) => (
              <a key={f.key} href={f.href} target="_blank" rel="noopener noreferrer" className={linkBtn}
                title={f.filtered ? K.filteredBy(plan) : K.notFiltered}>
                {K.findSites[f.key]}<ExternalIcon size={14} />
              </a>
            ))}
          </div>
          <p className="mt-3 text-xs text-navy/70">{K.filterNote(find.filter((f) => f.filtered).map((f) => K.findSites[f.key]).join(", "), plan)}</p>
        </div>
      </Section>

      {/* Visits */}
      <Section title={K.visits} action={!visitForm && <button className={linkBtn} onClick={() => me.careTeam.length ? setVisitForm(emptyVisit(me.careTeam[0].member_id)) : setNote(K.needTeam)}><PlusIcon size={16} />{K.addVisit}</button>}>
        {me.appointments.length === 0 && !visitForm && <p className="text-sm text-muted">{K.visitsEmpty}</p>}
        {me.appointments.length > 0 && (
          <ul className={rowList}>
            {me.appointments.map((a) => (
              <li key={`${a.visit_id ?? "s" + a.slot_id}-${a.slot_start}`} className="flex items-center gap-3 px-4 py-3.5">
                <Avatar name={a.provider_name} role={a.provider_type} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-navy">{a.provider_name}</p>
                  <p className="text-sm text-muted">{fmtSlot(a.slot_start)}{a.recurring ? ` · ${K.recurring}` : ""}{a.imported ? ` · ${K.fromCalendar}` : ""}</p>
                </div>
                {a.visit_id && (
                  <button className={`${quietBtn} shrink-0`} disabled={busy} onClick={() => send(`/api/visits?id=${a.visit_id}`, "DELETE")}>
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
type MedDraft = { label: string; days: number; refills: number; expires: string; needsVisit: boolean; lead: number; reminder: string; fillDays: number; pharmacyId: number | null };
const emptyMed = (): MedDraft => ({ label: "", days: 30, refills: 0, expires: "", needsVisit: true, lead: 14, reminder: "", fillDays: 30, pharmacyId: null });
const medToDraft = (m: MedTimeline): MedDraft => ({ label: m.label, days: m.daysLeft, refills: m.refillsRemaining, expires: m.rxExpiresOn ?? "", needsVisit: m.requiresAppointmentForRenewal, lead: m.bookingLeadDays, reminder: m.reminderTime ?? "", fillDays: m.fillDays, pharmacyId: m.pharmacyId });
const draftToMed = (d: MedDraft) => ({
  label: d.label, daysSupplyRemaining: d.days, refillsRemaining: d.refills, rxExpiresOn: d.expires || null,
  requiresAppointmentForRenewal: d.needsVisit, bookingLeadDays: d.lead, reminderTime: d.reminder || null,
  fillDays: d.fillDays, pharmacyId: d.pharmacyId,
});

function Buttons({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  const K = useCopy().care;
  return (
    <div className="flex gap-3 pt-1">
      <button type="submit" disabled={busy} className={`${inkBtn} flex-1`}>{K.save}</button>
      <button type="button" onClick={onCancel} className={`${outlineBtn} flex-1`}>{K.cancel}</button>
    </div>
  );
}

function MedEditor({ draft, pharmacies, busy, onSave, onCancel }: { draft: MedDraft; pharmacies: Pharmacy[]; busy: boolean; onSave: (d: MedDraft) => void; onCancel: () => void }) {
  const K = useCopy().care;
  const [d, setD] = useState(draft);
  return (
    <form className="mt-3 space-y-4 rounded-[30px] bg-white p-5" onSubmit={(e) => { e.preventDefault(); if (d.label.trim()) onSave(d); }}>
      <Field label={K.medName}><SuggestInput value={d.label} onChange={(v) => setD({ ...d, label: v })} placeholder="Adderall 20 mg" label={K.medName} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={K.medDays}><input className={inputClass} type="number" min={0} value={d.days} onChange={(e) => setD({ ...d, days: Number(e.target.value) })} /></Field>
        <Field label={K.medRefills}><input className={inputClass} type="number" min={0} value={d.refills} onChange={(e) => setD({ ...d, refills: Number(e.target.value) })} /></Field>
      </div>
      <Field label={K.medFillDays}><input className={inputClass} type="number" min={1} max={180} value={d.fillDays} onChange={(e) => setD({ ...d, fillDays: Number(e.target.value) })} /></Field>
      <Field label={K.medExpires}><input className={inputClass} type="date" value={d.expires} onChange={(e) => setD({ ...d, expires: e.target.value })} /></Field>
      {pharmacies.length > 0 && (
        <Field label={K.medPharmacy}>
          <select className={inputClass} value={d.pharmacyId ?? ""} onChange={(e) => setD({ ...d, pharmacyId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">{K.usePreferred}</option>
            {pharmacies.map((p) => <option key={p.pharmacy_id} value={p.pharmacy_id}>{p.pharmacy_name}</option>)}
          </select>
        </Field>
      )}
      <label className="flex items-center gap-2 text-sm text-navy">
        <input type="checkbox" className="h-4 w-4 accent-[#2A2438]" checked={d.needsVisit} onChange={(e) => setD({ ...d, needsVisit: e.target.checked })} />
        {K.medNeedsVisit}
      </label>
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
    <form className="mt-3 space-y-4 rounded-[30px] bg-white p-5" onSubmit={(e) => { e.preventDefault(); if (d.bookingUrl.trim() || d.providerName.trim() || d.phone.trim()) onSave(d); }}>
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
        <input type="checkbox" className="h-4 w-4 accent-[#2A2438]" checked={d.video} onChange={(e) => setD({ ...d, video: e.target.checked })} />
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
    <form id="visit-form" className="mt-3 space-y-4 rounded-[30px] bg-white p-5" onSubmit={(e) => { e.preventDefault(); if (d.when) onSave(d); }}>
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
        <input type="checkbox" className="h-4 w-4 accent-[#2A2438]" checked={d.video} onChange={(e) => setD({ ...d, video: e.target.checked })} />
        {K.video}
      </label>
      <Buttons busy={busy} onCancel={onCancel} />
    </form>
  );
}
