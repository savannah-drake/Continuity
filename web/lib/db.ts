import { Pool } from "pg";

// Reuse one connection pool during local dev hot-reloads
const g = globalThis as unknown as { pgPool?: Pool };

export const pool =
  g.pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

if (process.env.NODE_ENV !== "production") g.pgPool = pool;

export async function query<T = any>(text: string, params: unknown[] = []) {
  const res = await pool.query(text, params);
  return res.rows as T[];
}