// lib/engine.test.ts
// Run from the web folder:  npx tsx lib/engine.test.ts
import assert from "node:assert/strict";
import { computeTimeline, computeTherapyTimeline, shiftWeekendBack } from "./engine";

const TODAY = "2026-11-14"; // Saturday of the hackathon

// Maya: 20 days of medication left, 0 refills, psychiatrist books 2 weeks out
const maya = computeTimeline(
  { daysSupplyRemaining: 20, supplyAsOf: TODAY, refillsRemaining: 0,
    requiresAppointmentForRenewal: true, bookingLeadDays: 14 },
  TODAY,
);
assert.equal(maya.supplyEndDate, "2026-12-04");
assert.equal(maya.refillDeadline, "2026-12-01");
assert.equal(maya.rxNeededBy, "2026-11-30");
assert.equal(maya.renewalReason, "no_refills");
assert.equal(maya.apptBy, "2026-11-27");      // Sat 28th shifted back to Fri 27th
assert.equal(maya.bookApptBy, "2026-11-13");  // already passed
assert.equal(maya.status, "red");
assert.equal(maya.nextAction, "book_today");  // 20 days of supply, but booking is overdue

// Sarah: 25 days left, 2 refills, no appointment required: nothing to book yet
const sarah = computeTimeline(
  { daysSupplyRemaining: 25, supplyAsOf: TODAY, refillsRemaining: 2,
    requiresAppointmentForRenewal: false },
  TODAY,
);
assert.equal(sarah.needsRenewal, false);
assert.equal(sarah.bookApptBy, null);
assert.equal(sarah.status, "green");
assert.equal(sarah.nextAction, "all_set");

// Refills left but the prescription expires before the next fill
const expiring = computeTimeline(
  { daysSupplyRemaining: 30, supplyAsOf: TODAY, refillsRemaining: 1,
    rxExpiresOn: "2026-12-01", requiresAppointmentForRenewal: false, bookingLeadDays: 7 },
  TODAY,
);
assert.equal(expiring.renewalReason, "rx_expires");
assert.equal(expiring.status, "green");

// Weekend shift
assert.equal(shiftWeekendBack("2026-11-14"), "2026-11-13"); // Sat -> Fri
assert.equal(shiftWeekendBack("2026-11-15"), "2026-11-13"); // Sun -> Fri
assert.equal(shiftWeekendBack("2026-11-16"), "2026-11-16"); // Mon stays

// Biweekly therapy, last session Nov 6, not booked yet
const therapy = computeTherapyTimeline(
  { lastSessionDate: "2026-11-06", cadenceDays: 14 }, TODAY,
);
assert.equal(therapy.nextSessionBy, "2026-11-20");
assert.equal(therapy.bookBy, "2026-11-13");
assert.equal(therapy.nextAction, "book_today");

console.log("All engine tests passed");