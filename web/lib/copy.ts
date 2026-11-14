// lib/copy.ts
// IVY OWNS THIS FILE: every word users see lives here (from "Continuity: All On-Screen Copy").
// Change any text between quotes. Don't rename the keys on the left (the code uses them).

// Insurance plans: must match the plan names in the provider data EXACTLY.
export const PLANS = [
  "Aetna Student Health",
  "Blue Cross Blue Shield",
  "Kaiser Permanente",
  "UnitedHealthcare",
  "Cigna",
  "Medicaid",
];

export const COPY = {
  appName: "Continuity",
  tagline: "Your healthcare, handled ahead of time.",
  aiDisclosure: "Continuity is an AI assistant, not a medical professional.",

  welcome: {
    heading: "Welcome to Continuity",
    sub: "Your healthcare, handled ahead of time.",
    cards: [
      { title: "Never miss a refill", body: "Reminders before you run out" },
      { title: "Find local providers", body: "Therapists and psychiatrists nearby" },
      { title: "Appointments that fit", body: "Matched to your calendar" },
    ],
    start: "Get started",
  },

  onboarding: {
    aboutTitle: "About you",
    aboutHelp: "This helps us set things up for you. It takes about a minute.",
    nameLabel: "Name you'd like us to use",
    nameHelp: "We'll use this when we talk to you in the app.",
    phoneLabel: "Mobile number",
    phoneHelp: "We only use this for reminders you choose, and to know it's you on FaceTime.",

    insuranceTitle: "Insurance",
    insuranceHelp: "Add your plan so we can show you visits that are covered.",
    planLabel: "Insurance company",
    planHelp: "Just your plan's name. We never ask for your member ID or card.",
    privacyShort: "Your information is private. We only use it to help with your care.",

    careTitle: "Your care",
    careHelp: "Add what you take so we can tell you when to refill.",
    careTypeLabel: "What care are you keeping up with?",
    careTypes: { psychiatry: "Medication", therapy: "Therapy", both: "Both" },
    medLabel: "Medication",
    medHelp: "A nickname is fine. We keep it private.",
    daysLeftLabel: "Days left",
    refillsLabel: "Refills left",
    expiresLabel: "Prescription expires (if you know)",
    needsApptLabel: "My prescriber needs to see me before renewing",
    leadLabel: "How far out does your psychiatrist book? (days)",
    lastSessionLabel: "Last therapy session",
    cadenceLabel: "How often do you meet?",
    cadences: { 7: "Weekly", 14: "Every 2 weeks", 30: "Monthly" } as Record<number, string>,

    continue: "Continue",
    back: "Back",
    submit: "See my plan",
    saving: "Saving your answers…",
    error: "Something went wrong on our side. Please try again in a moment.",
    missing: (field: string) => `We need a little more here. Please fill in ${field}.`,
  },

  home: {
    greeting: (name: string) => `Welcome, ${name}!`,
    sub: "Here's what's coming up.",
    facetime: "FaceTime Continuity",
    facetimeHelp: "Call to check your plan or book a visit.",
    nextVisit: "Next appointment",
    confirmed: "Confirmed",
    noVisits: "You don't have any visits yet. Let's find one that fits your week.",
    findProvider: "Find a provider",
    refillAlert: "Refill alert",
    daysLeft: (label: string, n: number) => `${label}: ${n} ${n === 1 ? "day" : "days"} left`,
    runsOut: (date: string) => `Runs out ${date}`,
    requestRefill: "Request refill",
    refillSent: "Refill request sent (demo).",
    scheduleBy: "Schedule by",
    scheduleByLine: (date: string) => `${date} · next psychiatry visit`,
    therapyBy: (date: string) => `${date} · next therapy session`,
    noMeds: "No medications yet. Add one and we'll tell you when to refill.",
    setup: "Set up my plan",
  },

  mood: {
    question: "How are you feeling today?",
    choices: ["Low", "Meh", "Okay", "Good", "Great"],
    replies: {
      Low: "Thanks for telling us. That sounds hard. Would you like to book a visit or talk to someone now?",
      Meh: "Thanks for checking in. We're here if you need us.",
      Okay: "Thanks for checking in. We're here if you need us.",
      Good: "Glad to hear it. Thanks for checking in.",
      Great: "Glad to hear it. Thanks for checking in.",
    } as Record<string, string>,
    crisis: "If you're in the US and in crisis, call or text 988 any time.",
  },

  timeline: {
    eyebrow: "Refill timeline",
    title: "What to do and when",
    sub: "Your visits, planned around your refills.",
    nextStep: "Next step",
    today: "You are here",
    visitBooked: (provider: string) => `Appointment with ${provider}`,
    rxNeededBy: "Prescription to your pharmacy",
    rxNeededByBody: "Your prescriber sends the renewal by this date.",
    refillDeadline: "Refill in hand",
    supplyEnd: (label: string) => `${label} runs out`,
    supplyEndBody: "Your refill should be ready by then.",
    bookBy: "Book your next psychiatry visit",
    bookByBody: (label: string) => `This keeps ${label} on track.`,
    therapyBy: "Next therapy session",
    therapyBookBy: "Book your next therapy session",
    findPsychiatrist: "Find a psychiatrist",
    clear: "Nothing to do right now. We'll tell you when something comes up.",
  },

  // Engine action codes -> words (describe the situation, never the student)
  actions: {
    book_today: "Your next visit isn't booked yet. Let's find a time today.",
    book_appointment: "Your next visit isn't booked yet. Want us to find a time?",
    request_refill: "A quick refill now keeps things smooth.",
    all_set: "You have enough medication and your visits are planned.",
    visit_booked: "Your visit is booked. Your refill is on track.",
  },

  status: { green: "You're all set", yellow: "Coming up soon", red: "Let's fix this today" },

  tags: { confirmed: "Confirmed", needsAction: "Needs action", timeSensitive: "Time-sensitive", notBooked: "Not booked yet" },

  renewalReasons: {
    no_refills: "You have no refills left, so you'll need a renewal visit.",
    rx_expires: "Your prescription expires before your next fill.",
    appointment_required: "Your prescriber needs to see you before renewing.",
  },

  results: {
    therapistsTitle: "Therapists near you",
    therapistsSub: "These match your insurance.",
    psychiatristsTitle: "Psychiatrists near you",
    psychiatristsSub: "Psychiatrists can prescribe and manage medication.",
    tabs: { therapist: "Therapists", psychiatrist: "Psychiatrists" },
    chip: (plan: string, before: string) => `${plan || "Any plan"}${before ? ` · open before ${before}` : ""}`,
    demoNotice: "These times are examples. They aren't real openings yet.",
    inNetwork: "In your plan",
    outOfNetwork: "Not in your plan (may cost more)",
    telehealth: "Telehealth",
    videoShort: "video",
    milesAway: "mi",
    nextOpen: "Next open",
    loading: "Looking for providers near you…",
    empty: "No open times before your deadline. Try another type of provider, or a later date.",
    error: "Something went wrong on our side. Please try again in a moment.",
  },

  booking: {
    title: "Request this appointment?",
    body: "We'll share your plan name with this provider when you book.",
    confirm: "Request appointment",
    saving: "Booking your visit. This takes a few seconds.",
    doneTitle: "You're booked",
    doneBody: "Your care plan is updated.",
    labels: { date: "Date", time: "Time", type: "Visit type", length: "Length" },
    video: "Telehealth",
    inPerson: "In person",
    minutes: "min",
    aheadTitle: "Timed ahead of your refill",
    aheadBody: (label: string, date: string, days: number) => `${label} runs out ${date}, ${days} ${days === 1 ? "day" : "days"} after.`,
    reminders: "Reminders: 24 hours and 1 hour before",
    done: "Done",
    takenTitle: "That time was just taken",
    takenBody: "Someone else just took that time. Pick another one.",
    pickAnother: "See other times",
    loading: "Getting things ready…",
    error: "We couldn't book that visit. Nothing was sent. Please try again.",
  },
};
