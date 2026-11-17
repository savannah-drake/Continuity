-- v6: pharmacies, controlled-medication rules, "picked up" and "prescription sent" check-ins, trusted person.
-- Run once in Tiger's SQL editor (safe to re-run).

-- Pharmacies you use; one can be preferred. A medication can name its own, otherwise it uses the preferred one.
CREATE TABLE IF NOT EXISTS pharmacies (
pharmacy_id SERIAL PRIMARY KEY,
user_id INT NOT NULL REFERENCES users ON DELETE CASCADE,
pharmacy_name TEXT NOT NULL,
phone TEXT,
address TEXT,
preferred BOOLEAN NOT NULL DEFAULT false,
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pharmacies_by_user ON pharmacies (user_id);

ALTER TABLE medications ADD COLUMN IF NOT EXISTS pharmacy_id INT REFERENCES pharmacies ON DELETE SET NULL;
-- Schedule II (e.g. Adderall): no refills, a new prescription for every fill. Set from the name when saved.
ALTER TABLE medications ADD COLUMN IF NOT EXISTS controlled BOOLEAN NOT NULL DEFAULT false;
-- How many days one fill lasts, so "Picked up a refill" can restart the countdown
ALTER TABLE medications ADD COLUMN IF NOT EXISTS fill_days INT NOT NULL DEFAULT 30;
-- The day you told Continuity your prescriber sent the new prescription
ALTER TABLE medications ADD COLUMN IF NOT EXISTS rx_sent_on DATE;

-- One trusted person who gets a heads-up email if you've run out and haven't booked
CREATE TABLE IF NOT EXISTS trusted_contacts (
user_id INT PRIMARY KEY REFERENCES users ON DELETE CASCADE,
contact_name TEXT NOT NULL,
email TEXT NOT NULL,
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
