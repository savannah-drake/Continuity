// app/manifest.ts: makes Continuity installable ("Add to Home Screen") with Ivy's brand colors.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Continuity",
    short_name: "Continuity",
    description: "Your healthcare, handled ahead of time.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF6EF",
    theme_color: "#FBF6EF",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
