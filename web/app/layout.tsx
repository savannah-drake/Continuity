import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

// Brand kit: mockups use DejaVu Sans as a placeholder; Manrope is the recommended substitute.
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Continuity",
  description: "Your healthcare, handled ahead of time.",
  // Opens full-screen with its own icon after "Add to Home Screen" on iPhone
  appleWebApp: { capable: true, title: "Continuity", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#5AA9D8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>{children}</body>
    </html>
  );
}
