-- v2: Google sign-in, Google Calendar sync, several medications, your care team, recurring visits.
-- Run once in Tiger's SQL editor (safe to run again).

-- Accounts: sign in with Google; phone is now optional
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Google Calendar connection (refresh token is encrypted with SESSION_SECRET before it is stored)
CREATE TABLE IF NOT EXISTS google_connections (
user_id INT PRIMARY KEY REFERENCES users,
refresh_token_enc TEXT NOT NULL,
scopes TEXT,
connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
last_synced_at TIMESTAMPTZ,
last_error TEXT
);

-- Several medications: medications/prescriptions already allow many per user; add an "active" flag
ALTER TABLE medications ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE medications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
-- Reminders on Google Calendar: a daily "take your medication" event, and a "book your visit by" deadline
ALTER TABLE medications ADD COLUMN IF NOT EXISTS reminder_time TEXT;
ALTER TABLE medications ADD COLUMN IF NOT EXISTS reminder_event_id TEXT;
ALTER TABLE medications ADD COLUMN IF NOT EXISTS book_by_event_id TEXT;
ALTER TABLE medications ADD COLUMN IF NOT EXISTS book_by_date DATE;

-- Your care team: the providers you found (on Zocdoc, Grow Therapy, Psychology Today or anywhere) and how you book them.
-- A booking link is enough; a name is optional.
CREATE TABLE IF NOT EXISTS care_team (
member_id SERIAL PRIMARY KEY,
user_id INT NOT NULL REFERENCES users,
provider_name TEXT,
source_site TEXT,
role TEXT NOT NULL DEFAULT 'therapist',
npi TEXT,
phone TEXT,
booking_url TEXT,
video BOOLEAN NOT NULL DEFAULT false,
notes TEXT,
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS care_team_by_user ON care_team (user_id);

-- Visits with your care team (one-off or recurring), mirrored to Google Calendar when connected
CREATE TABLE IF NOT EXISTS visits (
visit_id SERIAL PRIMARY KEY,
user_id INT NOT NULL REFERENCES users,
member_id INT REFERENCES care_team ON DELETE SET NULL,
starts_at TIMESTAMPTZ NOT NULL,
duration_min INT NOT NULL DEFAULT 50,
video BOOLEAN NOT NULL DEFAULT false,
repeat_every_weeks INT,
repeat_until DATE,
status TEXT NOT NULL DEFAULT 'scheduled',
google_event_id TEXT,
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visits_by_user ON visits (user_id, starts_at);
