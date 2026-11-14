import { query } from "@/lib/db";

export async function GET() {
  const rows = await query("SELECT now() AS db_time, (SELECT count(*) FROM providers) AS provider_count");
  return Response.json(rows[0]);
}