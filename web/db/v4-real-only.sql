-- v4: real data only. Run once in Tiger's SQL editor (safe to re-run).

-- 1) "Not a visit" answers for calendar events like "Appointment with ..." (only the event id, so we don't ask again)
CREATE TABLE IF NOT EXISTS import_dismissed (
user_id INT NOT NULL REFERENCES users,
google_event_id TEXT NOT NULL,
dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
PRIMARY KEY (user_id, google_event_id)
);

-- 2) Sample Insights history and simulated bookings
DELETE FROM booking_events
WHERE event_source LIKE 'demo_history%'
OR slot_id IS NOT NULL;

DELETE FROM call_log
WHERE chert_call_id = 'demo_history';

-- 3) Care Fund test payouts (devnet, not real money)
DELETE FROM care_fund_payouts;

-- 4) Maya, the demo student (user 1, never signed in with Google). Children first.
DELETE FROM care_steps
WHERE user_id IN (SELECT u.user_id FROM users u WHERE u.user_id = 1 AND u.google_sub IS NULL);

DELETE FROM prescriptions
WHERE medication_id IN (SELECT m.medication_id FROM medications m
JOIN users u ON u.user_id = m.user_id
WHERE u.user_id = 1
AND u.google_sub IS NULL);

DELETE FROM medications
WHERE user_id IN (SELECT u.user_id FROM users u WHERE u.user_id = 1 AND u.google_sub IS NULL);

DELETE FROM visits
WHERE user_id IN (SELECT u.user_id FROM users u WHERE u.user_id = 1 AND u.google_sub IS NULL);

DELETE FROM care_team
WHERE user_id IN (SELECT u.user_id FROM users u WHERE u.user_id = 1 AND u.google_sub IS NULL);

DELETE FROM busy_blocks
WHERE user_id IN (SELECT u.user_id FROM users u WHERE u.user_id = 1 AND u.google_sub IS NULL);

DELETE FROM calendar_blocks
WHERE user_id IN (SELECT u.user_id FROM users u WHERE u.user_id = 1 AND u.google_sub IS NULL);

DELETE FROM booking_events
WHERE user_id IN (SELECT u.user_id FROM users u WHERE u.user_id = 1 AND u.google_sub IS NULL);

DELETE FROM call_log
WHERE user_id IN (SELECT u.user_id FROM users u WHERE u.user_id = 1 AND u.google_sub IS NULL);

DELETE FROM users
WHERE user_id = 1
AND google_sub IS NULL;
