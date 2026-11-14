// lib/typesense.ts
// Server-only Typesense clients. Never import this from a "use client" component.
import Typesense from "typesense";

const node = {
  host: process.env.TYPESENSE_HOST!, // e.g. xxx.a1.typesense.net (no https://)
  port: 443,
  protocol: "https",
};

// Admin key: create collections + import data (scripts only)
export const typesenseAdmin = new Typesense.Client({
  nodes: [node],
  apiKey: process.env.TYPESENSE_ADMIN_KEY!,
  connectionTimeoutSeconds: 10,
});

// Search-only key: used by the API routes
export const typesenseSearch = new Typesense.Client({
  nodes: [node],
  apiKey: process.env.TYPESENSE_SEARCH_KEY!,
  connectionTimeoutSeconds: 5,
});

// Providers with no open slots get this far-future value so "opening before X" filters skip them
export const NO_OPENINGS = 4102444800; // 2100-01-01
