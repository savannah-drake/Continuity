// lib/controlled.ts: Schedule II medications that need a new prescription for every fill (US rules):
// no refills, and pharmacies generally won't fill them early. Matched by brand or generic name.
// ADHD stimulants are by far the most common for students; a few others are included so the rules still apply.
const SCHEDULE_II = /\b(adderall|mydayis|amphetamine|dextroamphetamine|dexedrine|zenzedi|procentra|evekeo|adzenys|dyanavel|vyvanse|lisdexamfetamine|methylphenidate|ritalin|concerta|metadate|methylin|quillivant|quillichew|cotempla|jornay|relexxii|aptensio|focalin|dexmethylphenidate|azstarys|desoxyn|methamphetamine|oxycodone|oxycontin|percocet|hydrocodone|hysingla|vicodin|norco|morphine|hydromorphone|dilaudid|fentanyl|methadone|tapentadol|nucynta)\b/i;

export const isScheduleII = (label: string) => SCHEDULE_II.test(label);
