-- v5: refill/booking alerts by push notification and email. Run once in Tiger's SQL editor (safe to re-run).
ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_email BOOLEAN NOT NULL DEFAULT false;

-- One row per phone/browser that turned on notifications (the browser's push address, nothing else)
CREATE TABLE IF NOT EXISTS push_subscriptions (
endpoint TEXT PRIMARY KEY,
user_id INT NOT NULL REFERENCES users ON DELETE CASCADE,
p256dh TEXT NOT NULL,
auth TEXT NOT NULL,
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_by_user ON push_subscriptions (user_id);

-- Which alerts went out, so each one is sent once (alert_key includes the date it's about)
CREATE TABLE IF NOT EXISTS alerts_sent (
user_id INT NOT NULL REFERENCES users ON DELETE CASCADE,
medication_id INT NOT NULL,
alert_key TEXT NOT NULL,
sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
PRIMARY KEY (user_id, medication_id, alert_key)
);
