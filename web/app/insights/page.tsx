// app/insights/page.tsx: PB-22, Tiger Data dashboard in Ivy's style.
"use client";
import { useEffect, useState } from "react";
import { Screen, Card, Eyebrow, BottomNav, Notice } from "@/components/ui";

type Day = { day: string; web: number; facetime: number; calls: number };
type Data = { series: Day[]; totals: { booked: number; viaFacetimePct: number; calls: number; avgCallSec: number }; source: string };

const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function Insights() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/insights").then((r) => (r.ok ? r.json() : Promise.reject())).then(setData).catch(() => setError(true));
  }, []);

  const max = Math.max(1, ...(data?.series.map((d) => d.web + d.facetime) ?? [1]));

  return (
    <Screen nav>
      <Eyebrow>Insights</Eyebrow>
      <h1 className="mt-1 font-display text-[34px] font-semibold text-navy">Care, booked ahead</h1>
      <p className="mb-5 text-sm text-muted">Visits booked and FaceTime calls over the last 3 weeks.</p>

      {error && <p className="text-sm text-muted">Something went wrong on our side. Please try again in a moment.</p>}
      {!data && !error && <p className="text-sm text-muted">Getting things ready…</p>}

      {data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            {[
              ["Visits booked", String(data.totals.booked)],
              ["Booked by FaceTime", `${data.totals.viaFacetimePct}%`],
              ["FaceTime calls", String(data.totals.calls)],
              ["Avg call length", `${Math.floor(data.totals.avgCallSec / 60)}m ${data.totals.avgCallSec % 60}s`],
            ].map(([label, value]) => (
              <Card key={label}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</p>
                <p className="mt-1 text-2xl font-bold text-navy">{value}</p>
              </Card>
            ))}
          </div>

          <Card className="mb-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-navy">Visits booked per day</p>
              <div className="flex gap-3 text-[11px] text-muted">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-navy" />FaceTime</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-mist" />Web</span>
              </div>
            </div>
            <div className="flex h-36 items-end gap-[3px]" role="img" aria-label="Bar chart of visits booked per day, split by FaceTime and web">
              {data.series.map((d) => {
                const total = d.web + d.facetime;
                return (
                  <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${fmtDay(d.day)}: ${d.facetime} by FaceTime, ${d.web} on web`}>
                    <div className="w-full rounded-t-sm bg-navy" style={{ height: `${(d.facetime / max) * 100}%` }} />
                    <div className={`w-full bg-mist ${d.facetime ? "" : "rounded-t-sm"}`} style={{ height: `${(d.web / max) * 100}%` }} />
                    {total === 0 && <div className="h-[2px] w-full bg-line" />}
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted">
              <span>{fmtDay(data.series[0].day)}</span><span>Today</span>
            </div>
          </Card>

          <Notice>Powered by {data.source}.</Notice>
        </>
      )}
      <BottomNav active="home" />
    </Screen>
  );
}
