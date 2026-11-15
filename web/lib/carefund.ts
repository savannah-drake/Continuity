// lib/carefund.ts: PB-26 Continuity Care Fund on Solana devnet.
// A demo fund wallet pays a fixed copay grant to a demo clinic wallet. Each transfer carries a memo
// ("Continuity copay grant · slot 123") so anyone can audit payouts on Solana Explorer.
// Devnet SOL has no value. Nothing here touches real money or a patient's identity.
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction,
  LAMPORTS_PER_SOL, sendAndConfirmTransaction, clusterApiUrl,
} from "@solana/web3.js";
import { query } from "./db";

const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const GRANT_USD = Number(process.env.CARE_FUND_GRANT_USD ?? 25);
// Demo exchange rate so the numbers read naturally on screen: $25 grant = 0.025 devnet SOL.
const LAMPORTS_PER_USD = Number(process.env.CARE_FUND_LAMPORTS_PER_USD ?? 1_000_000);

function connection() {
  return new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl("devnet"), "confirmed");
}

function fundWallet() {
  const raw = process.env.CARE_FUND_SECRET;
  if (!raw) throw new Error("CARE_FUND_SECRET missing (run scripts/carefund-setup.ts)");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function clinicWallet() {
  const raw = process.env.CARE_FUND_CLINIC_PUBKEY;
  if (!raw) throw new Error("CARE_FUND_CLINIC_PUBKEY missing (run scripts/carefund-setup.ts)");
  return new PublicKey(raw);
}

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddress = (addr: string) => `https://explorer.solana.com/address/${addr}?cluster=devnet`;

export async function fundSummary() {
  const fund = fundWallet();
  const lamports = await connection().getBalance(fund.publicKey);
  const [totals] = await query<{ grants: string; usd: string | null }>(
    `SELECT count(*)::text AS grants, sum(amount_usd)::text AS usd FROM care_fund_payouts`,
  );
  const recent = await query<{ paid_at: string; amount_usd: string; tx_signature: string }>(
    `SELECT paid_at, amount_usd::text, tx_signature FROM care_fund_payouts ORDER BY paid_at DESC LIMIT 10`,
  );
  return {
    address: fund.publicKey.toBase58(),
    explorer: explorerAddress(fund.publicKey.toBase58()),
    balanceSol: lamports / LAMPORTS_PER_SOL,
    balanceUsd: Math.floor(lamports / LAMPORTS_PER_USD),
    grants: Number(totals?.grants ?? 0),
    grantedUsd: Number(totals?.usd ?? 0),
    grantUsd: GRANT_USD,
    lamportsPerUsd: LAMPORTS_PER_USD,
    recent: recent.map((r) => ({ ...r, explorer: explorerTx(r.tx_signature) })),
  };
}

export type GrantResult =
  | { ok: true; signature: string; explorer: string; amountUsd: number; already?: boolean }
  | { ok: false; reason: "not_booked" | "empty" | "chain_error"; message?: string };

export async function payCopay(slotId: number, userId: number | null): Promise<GrantResult> {
  // Only for a slot that is actually booked.
  const [slot] = await query<{ slot_status: string }>(
    `SELECT slot_status FROM appointment_slots WHERE slot_id = $1`, [slotId],
  );
  if (!slot || slot.slot_status !== "booked") return { ok: false, reason: "not_booked" };

  // Idempotent: a second tap shows the same receipt instead of paying twice.
  const [prior] = await query<{ tx_signature: string; amount_usd: string }>(
    `SELECT tx_signature, amount_usd::text FROM care_fund_payouts WHERE slot_id = $1 ORDER BY paid_at DESC LIMIT 1`, [slotId],
  );
  if (prior) return { ok: true, signature: prior.tx_signature, explorer: explorerTx(prior.tx_signature), amountUsd: Number(prior.amount_usd), already: true };

  const conn = connection();
  const fund = fundWallet();
  const lamports = Math.round(GRANT_USD * LAMPORTS_PER_USD);
  const balance = await conn.getBalance(fund.publicKey);
  if (balance < lamports + 10_000) return { ok: false, reason: "empty" };

  const tx = new Transaction()
    .add(SystemProgram.transfer({ fromPubkey: fund.publicKey, toPubkey: clinicWallet(), lamports }))
    .add(new TransactionInstruction({
      programId: MEMO_PROGRAM,
      keys: [{ pubkey: fund.publicKey, isSigner: true, isWritable: false }],
      data: Buffer.from(`Continuity copay grant · slot ${slotId}`, "utf8"),
    }));

  try {
    const signature = await sendAndConfirmTransaction(conn, tx, [fund]);
    await query(
      `INSERT INTO care_fund_payouts (user_id, slot_id, amount_usd, amount_lamports, tx_signature) VALUES ($1, $2, $3, $4, $5)`,
      [userId, slotId, GRANT_USD, lamports, signature],
    );
    return { ok: true, signature, explorer: explorerTx(signature), amountUsd: GRANT_USD };
  } catch (e) {
    return { ok: false, reason: "chain_error", message: e instanceof Error ? e.message : String(e) };
  }
}
