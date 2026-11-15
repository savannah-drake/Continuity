// GET /api/carefund/qr?usd=15 -> an SVG QR code for a Solana Pay donation to the Care Fund wallet (devnet demo).
// Scanned with a Solana wallet app (set to devnet), it pre-fills the fund address, the amount and a thank-you memo.
import QRCode from "qrcode";
import { fundSummary } from "@/lib/carefund";

export async function GET(req: Request) {
  const usd = Math.min(Math.max(Number(new URL(req.url).searchParams.get("usd")) || 15, 1), 500);
  try {
    const f = await fundSummary();
    const sol = (usd * f.lamportsPerUsd) / 1e9;
    const url = `solana:${f.address}?${new URLSearchParams({
      amount: String(Number(sol.toFixed(9))),
      label: "Continuity Care Fund",
      message: `Thank you for covering $${usd} of a student's copay`,
      memo: `Continuity Care Fund donation $${usd}`,
    })}`;
    const svg = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#24506E", light: "#FFFFFF" } });
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store", "X-Solana-Pay": url } });
  } catch {
    return new Response("unavailable", { status: 503 });
  }
}
