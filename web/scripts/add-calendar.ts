// scripts/add-calendar.ts: PB-27 demo helper. Loads an .ics file as a user's busy times.
// Run: cd web && npx tsx --env-file=.env.local scripts/add-calendar.ts 1 db/seed/maya-calendar.ics
import { readFileSync } from "node:fs";
import { saveCalendar } from "../lib/busy";
import { pool } from "../lib/db";

const [userId, file] = [Number(process.argv[2]), process.argv[3]];
if (!userId || !file) { console.error("Usage: add-calendar.ts <userId> <file.ics>"); process.exit(1); }
saveCalendar(userId, readFileSync(file, "utf8"))
  .then(({ count, next }) => {
    console.log(`User ${userId}: ${count} busy blocks saved (next 90 days). No event titles stored.`);
    for (const b of next) console.log("  busy", b.start.toLocaleString("en-US", { timeZone: "America/New_York" }), "to", b.end.toLocaleTimeString("en-US", { timeZone: "America/New_York" }));
  })
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
