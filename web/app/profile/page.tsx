// app/profile/page.tsx: Your profile. See and change what Continuity uses to find care:
// name, plan, language, home ZIP, and your schedule (busy times only). Sign-in is per device for the demo.
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMe, getUserId } from "@/lib/useMe";
import { useCopy, useLang, setLang } from "@/lib/i18n";
import { PLANS } from "@/lib/copy";
import { Screen, Card, Button, ButtonLink, Field, Notice, BottomNav, inputClass } from "@/components/ui";

export default function ProfilePage() {
  const C = useCopy();
  const P = C.profile;
  const lang = useLang();
  const router = useRouter();
  const { me, state } = useMe();
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("");
  const [zip, setZip] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [busy, setBusy] = useState<number | null>(null);
  const [calNote, setCalNote] = useState<string | null>(null);
  const userId = typeof window !== "undefined" ? getUserId() : null;
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
  }, [me]);

  const loadCalendar = () => {
    if (!userId) return;
    fetch(`/api/calendar?userId=${userId}`).then((r) => r.json()).then((d) => setBusy(d.upcomingBusy ?? 0)).catch(() => {});
  };
  useEffect(loadCalendar, [userId]);

  async function save() {
    setStatus("saving");
    const res = await fetch("/api/users", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: Number(userId), displayName: name, insurancePlan: plan, preferredLanguage: lang, ...(zip ? { homeZip: zip } : {}) }),
    }).catch(() => null);
    setStatus(res?.ok ? "saved" : "error");
  }

  async function uploadCalendar(file: File) {
    const res = await fetch("/api/calendar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: Number(userId), ics: await file.text() }),
    }).catch(() => null);
    setCalNote(res?.ok ? P.calendarUpdated : C.onboarding.calendarFailed);
    loadCalendar();
  }

  async function removeCalendar() {
    await fetch(`/api/calendar?userId=${userId}`, { method: "DELETE" }).catch(() => {});
    setCalNote(null);
    loadCalendar();
  }

  function signOut() {
    try { localStorage.removeItem("continuity_user_id"); } catch { /* private mode */ }
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

      <Card className="mb-4 space-y-4">
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
            {(["en", "es"] as const).map((l) => (
              <button key={l} type="button" onClick={() => { setLang(l); setStatus("idle"); }}
                className={`flex-1 rounded-full border-2 py-2 text-sm font-bold ${lang === l ? "border-brand bg-brand text-white" : "border-line text-navy"}`}>
                {l === "en" ? "English" : "Español"}
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
      </Card>

      <Card className="mb-4">
        <p className="mb-1 font-bold text-navy">{P.calendar}</p>
        <p className="mb-3 text-sm text-muted">{busy ? P.calendarOn(busy) : P.calendarOff}</p>
        <label className="mb-2 block cursor-pointer rounded-xl border border-dashed border-line bg-white py-3 text-center text-sm font-bold text-navy">
          {P.calendarUpload}
          <input type="file" accept=".ics,text/calendar" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCalendar(f); e.target.value = ""; }} />
        </label>
        <div className="flex justify-between">
          <Link href="/schedule" className="text-sm font-semibold text-brand underline">{C.schedule.link}</Link>
          {busy ? <button type="button" onClick={removeCalendar} className="text-sm font-semibold text-muted underline">{P.calendarRemove}</button> : null}
        </div>
        {calNote && <p className="mt-2 text-sm text-muted">{calNote}</p>}
      </Card>

      <div className="mb-4"><Notice>{P.privacy}</Notice></div>

      <div className="mb-2 flex justify-between text-sm font-semibold">
        <Link href="/onboarding" className="text-brand underline">{P.redo}</Link>
        <button type="button" onClick={signOut} className="text-muted underline">{P.signOut}</button>
      </div>
      <BottomNav active="profile" />
    </Screen>
  );
}
