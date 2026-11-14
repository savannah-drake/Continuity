// app/api/insights/route.ts
// GET /api/insights -> last 21 days from Tiger continuous aggregates (booking_daily, call_daily).
import { query } from "@/lib/db";

export async function GET() {
  try {
    const bookings = await query<{ day: string; source: string; confirmed: string }>(
`SELECT to_char(bd.bucket_day, 'YYYY-MM-DD') AS day, CASE WHEN bd.event_source LIKE '%facetime%' THEN 'facetime' ELSE 'web' END AS source, sum(bd.event_count) AS confirmed
FROM booking_daily bd
WHERE bd.event_type = 'confirmed'
AND bd.bucket_day > now() - INTERVAL '21 days'
GROUP BY day, source
ORDER BY day`,
    );
    const calls = await query<{ day: string; call_count: string; avg_duration_sec: string | null }>(
`SELECT to_char(cd.bucket_day, 'YYYY-MM-DD') AS day, cd.call_count, cd.avg_duration_sec
FROM call_daily cd
WHERE cd.bucket_day > now() - INTERVAL '21 days'
ORDER BY day`,
    );

    // One row per day for the chart
    const days = new Map<string, { day: string; web: number; facetime: number; calls: number }>();
    for (let i = 20; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      days.set(d, { day: d, web: 0, facetime: 0, calls: 0 });
    }
    for (const b of bookings) {
      const row = days.get(b.day);
      if (row) row[b.source as "web" | "facetime"] += Number(b.confirmed);
    }
    for (const c of calls) {
      const row = days.get(c.day);
      if (row) row.calls = Number(c.call_count);
    }

    const series = [...days.values()];
    const totalBooked = series.reduce((n, d) => n + d.web + d.facetime, 0);
    const viaFacetime = series.reduce((n, d) => n + d.facetime, 0);
    const totalCalls = series.reduce((n, d) => n + d.calls, 0);
    const durations = calls.filter((c) => c.avg_duration_sec !== null);
    const avgCallSec = durations.length
      ? Math.round(durations.reduce((n, c) => n + Number(c.avg_duration_sec) * Number(c.call_count), 0) /
          durations.reduce((n, c) => n + Number(c.call_count), 0))
      : 0;

    return Response.json({
      series,
      totals: { booked: totalBooked, viaFacetimePct: totalBooked ? Math.round((viaFacetime / totalBooked) * 100) : 0, calls: totalCalls, avgCallSec },
      source: "Tiger Data continuous aggregates: booking_daily, call_daily",
    });
  } catch (e) {
    console.error("insights failed", e);
    return Response.json({ error: "insights_failed" }, { status: 500 });
  }
}
