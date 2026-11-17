// lib/refillLinks.ts: where to refill online for big pharmacy chains, matched by the pharmacy's name.
// Pages are each chain's own refill / pharmacy page (you sign in there). Independent pharmacies: call instead.
const CHAINS: [RegExp, string][] = [
  [/\bcvs\b|\btarget\b/i, "https://www.cvs.com/content/refill"],
  [/walgreen|duane reade/i, "https://www.walgreens.com/pharmacy"],
  [/walmart/i, "https://www.walmart.com/pharmacy"],
  [/sam'?s club/i, "https://www.samsclub.com/pharmacy"],
  [/kroger|ralphs|fred meyer|mariano|king soopers|harris teeter|city market|fry'?s food|smith'?s food|dillons|qfc|pick ?n ?save/i, "https://www.kroger.com/health/pharmacy"],
  [/publix/i, "https://rx.publix.com"],
  [/costco/i, "https://www.costco.com/pharmacy"],
];

export function refillUrl(pharmacyName: string | null | undefined) {
  if (!pharmacyName) return null;
  return CHAINS.find(([re]) => re.test(pharmacyName))?.[1] ?? null;
}
