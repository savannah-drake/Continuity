// scripts/carefund-setup.ts: PB-26 one-time setup. Makes two devnet wallets (fund + demo clinic),
// airdrops devnet SOL into the fund, and prints the 3 lines to paste into web/.env.local.
// Run: cd web && npx tsx scripts/carefund-setup.ts
// The secret it prints is a key: paste it into .env.local and Vercel (Secret) only, never into chat or git.
import { Connection, Keypair, LAMPORTS_PER_SOL, clusterApiUrl } from "@solana/web3.js";

async function main() {
  const conn = new Connection(clusterApiUrl("devnet"), "confirmed");
  const fund = Keypair.generate();
  const clinic = Keypair.generate();
  console.log("Fund wallet:  ", fund.publicKey.toBase58());
  console.log("Clinic wallet:", clinic.publicKey.toBase58());
  try {
    const sig = await conn.requestAirdrop(fund.publicKey, 2 * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
    console.log("Airdropped 2 devnet SOL.");
  } catch {
    console.log("Airdrop was rate-limited. Paste the fund address into https://faucet.solana.com (Devnet) instead.");
  }
  console.log("\nAdd these to web/.env.local (and Vercel → Environment Variables, marked Secret):\n");
  console.log(`CARE_FUND_SECRET=${JSON.stringify(Array.from(fund.secretKey))}`);
  console.log(`CARE_FUND_CLINIC_PUBKEY=${clinic.publicKey.toBase58()}`);
  console.log(`CARE_FUND_GRANT_USD=25`);
}
main();
