// app/providers/page.tsx: "Therapists / Psychiatrists nearby" (Ivy's Provider Care mockup)
// + Typesense geo (distance from the user, radius filter, soonest/nearest) + language filter.
// URL: /providers?plan=Aetna%20Student%20Health&type=psychiatrist&before=2026-11-25
"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useCopy, useLang } from "@/lib/i18n";
import { useMe, fmtSlot, fmtShort } from "@/lib/useMe";
import { Screen, Card, Pill, Avatar, Notice, BottomNav, Eyebrow } from "@/components/ui";

type Slot = { slot_id: number; slot_start: string; duration_min: number; telehealth: boolean };
type Provider = {
  provider_id: number; provider_name: string; specialty: string; address: string; languages: string[];
  insurance_plans: string[]; telehealth: boolean; distance_miles: number; slots: Slot[];
};
const RADII = [0, 5, 10, 25]; // 0 = any distance

export default function ProvidersPage() {
  const R = useCopy().results;
  return (
    <Suspense fallback={<Screen><p className="text-muted">{R.loading}</p></Screen>}>
      <Results />
    </Suspense>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-bold ${on ? "bg-navy text-white" : "border border-line bg-white text-navy"}`}>
      {children}
    </button>
  );
}

function Results() {
  const R = useCopy().results;
  const lang = useLang();
  const params = useSearchParams();
  const router = useRouter();
  const { me } = useMe();
  const plan = params.get("plan") || me?.user.insurance_plan || "";
  const type = (params.get("type") as "therapist" | "psychiatrist") || "psychiatrist";
  const before = params.get("before") ?? "";

  const [sort, setSort] = useState<"soonest" | "nearest">("soonest");
  const [radius, setRadius] = useState(0);
  const [spanish, setSpanish] = useState(false);
  useEffect(() => { if (lang === "es") setSpanish(true); }, [lang]);

  const lat = me?.user.home_lat ?? null;
  const lng = me?.user.home_lng ?? null;

  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setProviders(null); setError(false);
    const qs = new URLSearchParams({
      type, slots: "1", sort,
      ...(plan ? { plan } : {}), ...(before ? { before } : {}),
      ...(radius ? { radius: String(radius) } : {}),
      ...(spanish ? { language: "Spanish" } : {}),
      ...(lat !== null && lng !== null ? { lat: String(lat), lng: String(lng) } : {}),
    });
    fetch(`/api/providers?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setProviders)
      .catch(() => setError(true));
  }, [plan, type, before, sort, radius, spanish, lat, lng]);

  const switchTab = (t: string) =>
    router.replace(`/providers?${new URLSearchParams({ type: t, ...(plan ? { plan } : {}), ...(before ? { before } : {}) })}`);

  return (
    <Screen nav>
      <h1 className="text-[26px] font-bold text-navy">{type === "therapist" ? R.therapistsTitle : R.psychiatristsTitle}</h1>
      <p className="mb-4 text-sm text-muted">{type === "therapist" ? R.therapistsSub : R.psychiatristsSub}</p>

      <p className="mb-3 rounded-full bg-mist px-4 py-2 text-center text-xs font-bold text-navy">
        {R.chip(plan, before ? fmtShort(before) : "")}
      </p>

      <div className="mb-3 flex rounded-full bg-mist p-1">
        {(["therapist", "psychiatrist"] as const).map((t) => (
          <button key={t} onClick={() => switchTab(t)}
            className={`flex-1 rounded-full py-2 text-sm font-bold ${type === t ? "bg-brand text-white" : "text-navy"}`}>
            {R.tabs[t]}
          </button>
        ))}
      </div>

      {/* Typesense geo sort + geo filter + language facet */}
      <div className="mb-2 flex flex-wrap gap-2">
        <Chip on={sort === "soonest"} onClick={() => setSort("soonest")}>{R.sortSoonest}</Chip>
        <Chip on={sort === "nearest"} onClick={() => setSort("nearest")}>{R.sortNearest}</Chip>
        <Chip on={spanish} onClick={() => setSpanish(!spanish)}>{R.speaksSpanish}</Chip>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {RADII.map((mi) => (
          <Chip key={mi} on={radius === mi} onClick={() => setRadius(mi)}>{mi ? R.within(mi) : R.anyDistance}</Chip>
        ))}
      </div>

      <div className="mb-4"><Notice>{R.demoNotice}</Notice></div>

      {error && <p className="text-sm text-muted">{R.error}</p>}
      {!providers && !error && <p className="text-sm text-muted">{R.loading}</p>}
      {providers?.length === 0 && <Card><p className="text-sm text-muted">{R.empty}</p></Card>}

      <div className="space-y-3">
        {providers?.map((p) => {
          const inPlan = plan && p.insurance_plans.includes(plan);
          const speaks = (p.languages ?? []).filter((l) => l !== "English");
          return (
            <Card key={p.provider_id}>
              <div className="flex gap-3">
                <Avatar name={p.provider_name} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-navy">{p.provider_name}</p>
                  <p className="text-xs text-muted">{p.specialty}{p.telehealth ? ` · ${R.telehealth}` : ""}</p>
                  <p className="text-xs text-muted">{p.distance_miles} {R.milesAway}{speaks.length ? ` · ${speaks.join(", ")}` : ""}</p>
                </div>
              </div>
              <div className="mt-2">
                <Pill tone={inPlan ? "mint" : "attn"}>{inPlan ? R.inNetwork : R.outOfNetwork}</Pill>
              </div>
              {p.slots.length > 0 && (
                <>
                  <Eyebrow className="mt-3 mb-1.5 !text-muted">{R.nextOpen}</Eyebrow>
                  <div className="flex flex-wrap gap-2">
                    {p.slots.map((s) => (
                      <Link key={s.slot_id} href={`/book/${s.slot_id}`}
                        className="rounded-full border-2 border-brand px-3 py-1 text-xs font-bold text-brand hover:bg-mist/50">
                        {fmtSlot(s.slot_start)}{s.telehealth ? ` · ${R.videoShort}` : ""}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </Card>
          );
        })}
      </div>
      <BottomNav active="providers" />
    </Screen>
  );
}
