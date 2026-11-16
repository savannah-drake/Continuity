// GET /api/cron/alerts: Vercel Cron runs this once a day (vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
// To try it locally: curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/alerts
import { runAllAlerts } from "@/lib/alerts";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await runAllAlerts());
}
