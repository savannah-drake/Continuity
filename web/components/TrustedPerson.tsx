// components/TrustedPerson.tsx: Profile → Trusted person. One person who gets a single heads-up email if you've run out
// of a medication and haven't booked a visit for a day. They get a short note when you add them. No health details, ever.
"use client";
import { useState } from "react";
import { useCopy } from "@/lib/i18n";
import { Field, inputClass } from "@/components/ui";

export function TrustedPerson({ current, onChange }: { current: { contact_name: string; email: string } | null; onChange: () => void }) {
  const A = useCopy().alerts;
  const [name, setName] = useState(current?.contact_name ?? "");
  const [email, setEmail] = useState(current?.email ?? "");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: { preventDefault(): void }) {
    e.preventDefault();
    setBusy(true); setNote(null);
    const res = await fetch("/api/trusted", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setNote(useCopyError); return; }
    const d = await res.json().catch(() => ({}));
    setNote(d.introSent ? A.trustedSaved(name.trim()) : current?.email === email.trim().toLowerCase() ? null : A.trustedSavedNoEmail);
    onChange();
  }

  async function remove() {
    setBusy(true);
    await fetch("/api/trusted", { method: "DELETE" }).catch(() => null);
    setBusy(false); setName(""); setEmail(""); setNote(null);
    onChange();
  }

  return (
    <section className="mb-8">
      <h2 className="mb-1 text-[15px] font-bold text-navy">{A.trustedHeading}</h2>
      <p className="mb-3 text-sm text-muted">{A.trustedSub}</p>
      <form onSubmit={save} className="space-y-3 rounded-2xl border border-line bg-white px-4 py-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={A.trustedName}><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label={A.trustedEmail}><input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        </div>
        <div className="flex gap-5 text-sm font-semibold">
          <button type="submit" disabled={busy} className="text-brand">{A.trustedSave}</button>
          {current && <button type="button" disabled={busy} onClick={remove} className="text-muted">{A.trustedRemove}</button>}
        </div>
        {note && <p className="text-sm text-muted" role="status">{note}</p>}
      </form>
    </section>
  );
}

const useCopyError = "Check the name and email and try again.";
