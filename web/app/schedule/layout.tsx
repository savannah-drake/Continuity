// app/schedule/layout.tsx: the week view reads today's date, which only exists at request time.
// Suspense lets Next prerender the shell and render the page in the browser.
import { Suspense } from "react";

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
