// lib/engine.ts
// Continuity's countdown engine: pure date math, no database, no UI.
// Dates are "YYYY-MM-DD" strings handled in UTC so time zones can't shift a day.
//
// Three dates are kept separate (from the Continuity blueprint):
//   supply_end_date  when the medication runs out
//   rx_expires_on    when the prescription itself expires (if known)
//   refill_deadline  when the next fill should be in hand
// Zero refills or an expiring Rx makes booking urgent even with supply left.

export type RxInput = {
  daysSupplyRemaining: number;
  supplyAsOf: string;                  // date the supply count was taken
  bufferDays?: number;                 // safety margin before running out (default 3)
  refillsRemaining: number;
  rxExpiresOn?: string | null;
  requiresAppointmentForRenewal: boolean;
  renewalTurnaroundDays?: number;      // prescriber sends a renewal after the visit (default 2)
  pharmacyProcessingDays?: number;     // pharmacy fills it (default 1)
  bookingLeadDays?: number;            // how far out the prescriber books (default 14)
};

export type Status = "green" | "yellow" | "red";

// Codes, not sentences: Ivy's copy deck (lib/copy.ts) turns these into words.
export type NextAction = "book_today" | "book_appointment" | "request_refill" | "all_set";
export type RenewalReason = "no_refills" | "rx_expires" | "appointment_required" | null;

export type Timeline = {
  supplyEndDate: string;
  refillDeadline: string;
  rxNeededBy: string;
  needsRenewal: boolean;
  renewalReason: RenewalReason;
  apptBy: string | null;               // appointment must happen by
  bookApptBy: string | null;           // must be booked by
  daysUntilAction: number;             // days until the most urgent deadline (negative = overdue)
  status: Status;
  nextAction: NextAction;
};

// ---- date helpers (UTC, "YYYY-MM-DD")
const DAY_MS = 86_400_000;
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const toStr = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (s: string, n: number) => toStr(new Date(toDate(s).getTime() + n * DAY_MS));
export const diffDays = (from: string, to: string) =>
  Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS);

// Offices and pharmacies are closed on weekends: move Sat/Sun deadlines back to Friday.
export function shiftWeekendBack(s: string) {
  const day = toDate(s).getUTCDay(); // 0 = Sun, 6 = Sat
  if (day === 6) return addDays(s, -1);
  if (day === 0) return addDays(s, -2);
  return s;
}

export function statusFor(daysUntil: number): Status {
  if (daysUntil <= 2) return "red";
  if (daysUntil <= 7) return "yellow";
  return "green";
}

// ---- medication timeline
export function computeTimeline(rx: RxInput, today: string): Timeline {
  const buffer = rx.bufferDays ?? 3;
  const turnaround = rx.renewalTurnaroundDays ?? 2;
  const processing = rx.pharmacyProcessingDays ?? 1;
  const lead = rx.bookingLeadDays ?? 14;

  const supplyEndDate = addDays(rx.supplyAsOf, rx.daysSupplyRemaining);
  const refillDeadline = addDays(supplyEndDate, -buffer);
  const rxNeededBy = shiftWeekendBack(addDays(refillDeadline, -processing));

  let renewalReason: RenewalReason = null;
  if (rx.refillsRemaining <= 0) renewalReason = "no_refills";
  else if (rx.rxExpiresOn && rx.rxExpiresOn < refillDeadline) renewalReason = "rx_expires";
  else if (rx.requiresAppointmentForRenewal) renewalReason = "appointment_required";
  const needsRenewal = renewalReason !== null;

  if (!needsRenewal) {
    const daysUntilAction = diffDays(today, rxNeededBy);
    return {
      supplyEndDate, refillDeadline, rxNeededBy,
      needsRenewal, renewalReason, apptBy: null, bookApptBy: null,
      daysUntilAction,
      status: statusFor(daysUntilAction),
      nextAction: daysUntilAction <= 7 ? "request_refill" : "all_set",
    };
  }

  const apptBy = shiftWeekendBack(addDays(rxNeededBy, -turnaround));
  const bookApptBy = shiftWeekendBack(addDays(apptBy, -lead));
  const daysUntilAction = diffDays(today, bookApptBy);

  return {
    supplyEndDate, refillDeadline, rxNeededBy,
    needsRenewal, renewalReason, apptBy, bookApptBy,
    daysUntilAction,
    status: statusFor(daysUntilAction),
    nextAction: daysUntilAction <= 0 ? "book_today" : "book_appointment",
  };
}

// ---- therapy-only timeline (recurring sessions, no medication)
export type TherapyInput = {
  lastSessionDate: string;
  cadenceDays: number;                 // 7 weekly, 14 biweekly, 30 monthly
  bookingLeadDays?: number;            // default 7
  nextSessionBooked?: boolean;
};

export function computeTherapyTimeline(t: TherapyInput, today: string) {
  const nextSessionBy = addDays(t.lastSessionDate, t.cadenceDays);
  const bookBy = shiftWeekendBack(addDays(nextSessionBy, -(t.bookingLeadDays ?? 7)));
  const daysUntilAction = diffDays(today, bookBy);
  if (t.nextSessionBooked) {
    return { nextSessionBy, bookBy, daysUntilAction, status: "green" as Status, nextAction: "all_set" as NextAction };
  }
  return {
    nextSessionBy, bookBy, daysUntilAction,
    status: statusFor(daysUntilAction),
    nextAction: (daysUntilAction <= 0 ? "book_today" : "book_appointment") as NextAction,
  };
}