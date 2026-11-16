// app/profile/page.tsx: Your profile. See and change what Continuity uses to find care:
// name, plan, language, home ZIP, and your calendar (Google Calendar, or an uploaded file; busy times only).
"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMe, signOut as endSession } from "@/lib/useMe";
import { localeFor } from "@/lib/copy";
import { useCopy, useLang, setLang } from "@/lib/i18n";
import { PLANS } from "@/lib/copy";
import { AlertSettings } from "@/components/AlertSettings";
import { Screen, Button, ButtonLink, Field, BottomNav, inputClass } from "@/components/ui";

type CalStatus = { upcomingBusy: number; fileBusy?: number; google?: { connected: boolean; lastSynced?: string | null; needsReconnect?: boolean } };

export default function ProfilePageWrapper() {
  return <Suspense fallback={null}><ProfilePage /></Suspense>;
}

function ProfilePage() {
  const C = useCopy();
  const P = C.profile;
  const lang = useLang();
  const router = useRouter();
  const { me, state } = useMe();
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("");
  const [zip, setZip] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [cal, setCal] = useState<CalStatus | null>(null);
  const [autoImport, setAutoImport] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const params = useSearchParams();
  const S = C.calendarSync;
  const [calNote, setCalNote] = useState<string | null>(
    params.get("calendar") === "connected" ? S.connectedNote : params.get("calendar") === "declined" ? S.declinedNote : null);
  // Profile photo: shrunk to 160px and kept in this browser only (never uploaded)
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => { try { setPhoto(localStorage.getItem("continuity_photo")); } catch { /* private mode */ } }, []);
  function pickPhoto(file: File) {
    const img = new Image();
    img.onload = () => {
      const size = 160, c = document.createElement("canvas");
      c.width = size; c.height = size;
      const side = Math.min(img.width, img.height);
      c.getContext("2d")!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      const url = c.toDataURL("image/jpeg", 0.85);
      try { localStorage.setItem("continuity_photo", url); } catch { /* full or private */ }
      setPhoto(url);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  }
  function removePhoto() { try { localStorage.removeItem("continuity_photo"); } catch {} setPhoto(null); }

  useEffect(() => {
    if (!me) return;
    setName(me.user.display_name ?? "");
    setPlan(me.user.insurance_plan ?? "");
    setZip(me.user.home_zip ?? "");
    setAutoImport(!!me.user.auto_import_visits);
  }, [me]);

  const loadCalendar = () => {
    fetch("/api/calendar").then((r) => (r.ok ? r.json() : null)).then((d) => d && setCal(d)).catch(() => {});
  };
  useEffect(loadCalendar, []);

  async function save() {
    setStatus("saving");
    const res = await fetch("/api/users", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name, insurancePlan: plan, preferredLanguage: lang, ...(zip ? { homeZip: zip } : {}) }),
    }).catch(() => null);
    setStatus(res?.ok ? "saved" : "error");
  }

  async function uploadCalendar(file: File) {
    const res = await fetch("/api/calendar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ics: await file.text() }),
    }).catch(() => null);
    setCalNote(res?.ok ? P.calendarUpdated : C.onboarding.calendarFailed);
    loadCalendar();
  }

  async function removeCalendar() {
    await fetch("/api/calendar", { method: "DELETE" }).catch(() => {});
    setCalNote(null);
    loadCalendar();
  }

  async function toggleAutoImport(on: boolean) {
    setAutoImport(on);
    setImportNote(null);
    const res = await fetch("/api/users", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoImportVisits: on }),
    }).catch(() => null);
    if (!res?.ok) { setAutoImport(!on); return; }
    const d = await res.json().catch(() => ({}));
    if (on) setImportNote(d.skipped === "not_connected" ? S.reconnect : d.skipped === "error" ? C.care.error : S.importChecked(d.checked ?? 0, d.matched ?? 0));
  }

  async function disconnectGoogle() {
    await fetch("/api/auth/calendar", { method: "DELETE" }).catch(() => {});
    setCalNote(null);
    loadCalendar();
  }

  async function signOut() {
    await endSession();
    router.push("/");
  }

  if (state === "loading") return <Screen nav><p className="text-muted">{C.booking.loading}</p><BottomNav active="profile" /></Screen>;
  if (state !== "ready" || !me) {
    return (
      <Screen nav>
        <h1 className="mb-4 text-[26px] font-bold text-navy">{P.title}</h1>
        <p className="mb-4 text-muted">{P.none}</p>
        <ButtonLink href="/onboarding">{P.redo}</ButtonLink>
        <BottomNav active="profile" />
      </Screen>
    );
  }

  return (
    <Screen nav>
      <div className="mb-5 flex items-center gap-4">
        <label className="relative flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-mist text-2xl font-bold text-navy">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : (name || "?").trim().charAt(0).toUpperCase()}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickPhoto(f); e.target.value = ""; }} />
        </label>
        <div>
          <h1 className="text-[26px] font-bold text-navy">{P.title}</h1>
          <p className="text-sm text-muted">{P.sub}</p>
          <p className="mt-1 text-xs text-muted">
            {photo ? P.photoChange : P.photo} {photo && <button type="button" onClick={removePhoto} className="ml-2 underline">{P.photoRemove}</button>}
          </p>
        </div>
      </div>
      <p className="-mt-3 mb-4 text-[11px] text-muted">{P.photoNote}</p>

      <div className="mb-8 space-y-4">
        <Field label={P.name}>
          <input className={inputClass} value={name} onChange={(e) => { setName(e.target.value); setStatus("idle"); }} />
        </Field>
        <Field label={P.plan}>
          <select className={inputClass} value={plan} onChange={(e) => { setPlan(e.target.value); setStatus("idle"); }}>
            {[...new Set([plan, ...PLANS])].filter(Boolean).map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label={P.language}>
          <div className="flex gap-2">
            {(["en", "es", "zh"] as const).map((l) => (
              <button key={l} type="button" onClick={() => { setLang(l); setStatus("idle"); }}
                className={`flex-1 rounded-full border-2 py-2 text-sm font-bold ${lang === l ? "border-brand bg-brand text-white" : "border-line text-navy"}`}>
                {l === "en" ? "English" : l === "es" ? "Español" : "中文"}
              </button>
            ))}
          </div>
        </Field>
        <Field label={P.zip} help={P.zipHelp}>
          <input className={inputClass} inputMode="numeric" maxLength={5} value={zip}
            onChange={(e) => { setZip(e.target.value.replace(/\D/g, "")); setStatus("idle"); }} placeholder="30322" />
        </Field>
        <Button onClick={save} disabled={status === "saving"}>{status === "saving" ? P.saving : P.save}</Button>
        {status === "saved" && <p className="text-sm font-bold text-forest">{P.saved}</p>}
        {status === "error" && <p className="text-sm font-bold text-attn-text">{P.error}</p>}
      </div>

      <section className="mb-8">
        <h2 className="mb-2 text-[15px] font-bold text-navy">{S.title}</h2>
        <div className="rounded-2xl border border-line bg-white px-4 py-3">
          {cal?.google?.connected ? (
            <>
              <p className="font-semibold text-navy">{cal.google.needsReconnect ? S.reconnect : S.connected}</p>
              {cal.google.lastSynced && !cal.google.needsReconnect && (
                <p className="text-sm text-muted">{S.lastSynced(new Date(cal.google.lastSynced).toLocaleString(localeFor(lang), { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" }))}</p>
              )}
              <div className="mt-2 flex gap-5 text-sm font-semibold">
                {cal.google.needsReconnect && <a href="/api/auth/google?calendar=1&next=/profile" className="text-brand">{S.connect}</a>}
                <button type="button" onClick={disconnectGoogle} className="text-muted">{S.disconnect}</button>
              </div>
              <label className="mt-4 flex items-start gap-3 border-t border-line pt-3 text-sm text-navy">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#5AA9D8]" checked={autoImport} onChange={(e) => toggleAutoImport(e.target.checked)} />
                <span><span className="font-semibold">{S.importTitle}</span><br /><span className="text-muted">{S.importExplain}</span></span>
              </label>
              {autoImport && <button type="button" onClick={() => toggleAutoImport(true)} className="mt-2 text-sm font-semibold text-brand">{S.checkNow}</button>}
              {importNote && <p className="mt-2 text-sm text-muted">{importNote}</p>}
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">{S.explain}</p>
              <a href="/api/auth/google?calendar=1&next=/profile" className="flex h-11 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{S.connect}</a>
            </>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <label className="cursor-pointer font-semibold text-brand">
            {P.calendarUpload}
            <input type="file" accept=".ics,text/calendar" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCalendar(f); e.target.value = ""; }} />
          </label>
          {cal?.fileBusy ? <button type="button" onClick={removeCalendar} className="text-muted">{P.calendarRemove}</button> : null}
          <Link href="/schedule" className="font-semibold text-navy">{C.schedule.link}</Link>
        </div>
        {calNote && <p className="mt-2 text-sm text-muted">{calNote}</p>}
      </section>
      {me && <AlertSettings emailOn={!!me.user.alert_email} email={me.user.email} />}

      <p className="mb-6 text-xs text-muted">{P.privacy}</p>

      <div className="mb-2 flex justify-between text-sm font-semibold">
        <Link href="/onboarding" className="text-brand underline">{P.redo}</Link>
        <button type="button" onClick={signOut} className="text-muted underline">{P.signOut}</button>
      </div>
      <BottomNav active="profile" />
    </Screen>
  );
}
