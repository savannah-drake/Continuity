-- v3: auto-import visits from Google Calendar booking confirmations. Run once in Tiger's SQL editor (safe to re-run).
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_import_visits BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE visits ADD COLUMN IF NOT EXISTS google_source_event_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS visits_imported_once ON visits (user_id, google_source_event_id) WHERE google_source_event_id IS NOT NULL;
