// app/providers/page.tsx
// In-network providers with an opening before your deadline.
// URL: /providers?plan=Aetna%20Student%20Health&type=psychiatrist&before=2026-11-25
// Plain styling for now; Ivy's layout replaces it. Words come from lib/copy.ts.
"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { COPY } from "@/lib/copy";

type Slot = { slot_id: number; slot_start: string; duration_min: number; telehealth: boolean };
type Provider = {
  provider_id: number; provider_name: string; specialty: string; address: string;
  insurance_plans: string[]; telehealth: boolean; distance_miles: number; slots: Slot[];
};

const R = COPY.results;

const fmtSlot = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: "America/New_York",
  });

const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default function ProvidersPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-2xl p-6">{R.loading}</main>}>
      <Results />
    </Suspense>
  );
}

function Results() {
  const params = useSearchParams();
  const plan = params.get("plan") ?? "";
  const type = params.get("type") ?? "";
  const before = params.get("before") ?? "";

  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const qs = new URLSearchParams({ plan, type, before, slots: "1" });
    fetch(`/api/providers?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setProviders)
      .catch(() => setError(true));
  }, [plan, type, before]);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">{R.title}</h1>
      <p className="text-gray-600">
        {R.subtitle(plan, before ? fmtDate(before) : "")}
      </p>
      <p className="mt-2 mb-6 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-600">{R.demoNotice}</p>

      {error && <p className="text-red-600">{R.error}</p>}
      {!providers && !error && <p>{R.loading}</p>}
      {providers?.length === 0 && <p className="rounded-xl border p-4">{R.empty}</p>}

      <div className="space-y-4">
        {providers?.map((p) => (
          <article key={p.provider_id} className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">{p.provider_name}</h2>
                <p className="text-sm text-gray-600">{p.specialty}</p>
                <p className="text-sm text-gray-500">{p.address} · {p.distance_miles} {R.milesAway}</p>
              </div>
              <div className="flex flex-col items-end gap-1 text-xs">
                {plan && p.insurance_plans.includes(plan) && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-800">{R.inNetwork}</span>
                )}
                {p.telehealth && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">{R.telehealth}</span>}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {p.slots.map((s) => (
                <Link key={s.slot_id} href={`/book/${s.slot_id}`}
                  className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50">
                  {fmtSlot(s.slot_start)}{s.telehealth ? ` · ${R.videoShort}` : ""}
                </Link>
              ))}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
