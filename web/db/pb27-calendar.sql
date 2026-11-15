-- PB-27: calendar-aware matching. Run once in the Tiger SQL editor.
-- Busy times only (start + end). No event titles, places or notes are ever stored.
CREATE TABLE IF NOT EXISTS busy_blocks (
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  user_id    INT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'ics',
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
SELECT create_hypertable('busy_blocks', 'starts_at', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS busy_by_user ON busy_blocks (user_id, starts_at);
