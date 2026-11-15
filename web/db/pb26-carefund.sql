-- PB-26: Continuity Care Fund. Run once in the Tiger SQL editor.
-- Every payout is an event in a hypertable, so the Insights page can chart it like bookings and calls.
CREATE TABLE IF NOT EXISTS care_fund_payouts (
  paid_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  payout_id      BIGSERIAL,
  user_id        INT,
  slot_id        INT,
  amount_usd     NUMERIC(6,2) NOT NULL,
  amount_lamports BIGINT NOT NULL,
  tx_signature   TEXT NOT NULL,
  network        TEXT NOT NULL DEFAULT 'devnet'
);
SELECT create_hypertable('care_fund_payouts', 'paid_at', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS care_fund_by_slot ON care_fund_payouts (slot_id, paid_at DESC);
