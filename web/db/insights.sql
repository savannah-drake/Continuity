-- db/insights.sql (PB-22): Tiger Data continuous aggregates for the Insights dashboard.
-- Run once in Tiger's SQL editor. Safe to re-run.
-- Uses: hypertables (booking_events, call_log) + time_bucket + continuous aggregates with real-time data.

-- 1) Sample history so the dashboard has a few weeks of data (event_source demo_history_*, chert_call_id demo_history).
-- Volume grows over 3 weeks, dips on weekends, and the FaceTime share rises from ~25% to ~75%.
-- The per-day count is computed inside a LATERAL that references the day, so every day gets its own number.
INSERT INTO booking_events (event_time, user_id, slot_id, event_type, event_source)
SELECT b.booked_at, NULL, NULL, t.event_type, b.channel
FROM (SELECT g.day, extract(epoch FROM g.day - (now() - INTERVAL '21 days')) / extract(epoch FROM INTERVAL '20 days') AS progress, extract(isodow FROM g.day) >= 6 AS is_weekend
FROM generate_series(now() - INTERVAL '21 days', now() - INTERVAL '1 day', INTERVAL '1 day') AS g(day)) d
CROSS JOIN LATERAL (SELECT d.day + INTERVAL '9 hours' + random() * INTERVAL '10 hours' AS booked_at, CASE WHEN random() < 0.25 + 0.5 * d.progress THEN 'demo_history_facetime' ELSE 'demo_history_web' END AS channel
FROM generate_series(1, greatest(0, round(1 + 4 * d.progress + random() * 2 - CASE WHEN d.is_weekend THEN 2 ELSE 0 END))::int) AS n(i)) b
CROSS JOIN (VALUES ('requested'), ('confirmed')) AS t(event_type)
WHERE NOT EXISTS (SELECT 1
FROM booking_events v
WHERE v.event_source IN ('demo_history', 'demo_history_web', 'demo_history_facetime'));

INSERT INTO call_log (call_time, user_id, chert_call_id, duration_sec, call_outcome)
SELECT d.day + INTERVAL '9 hours' + random() * INTERVAL '10 hours', NULL, 'demo_history', 60 + floor(random() * 180)::int, CASE WHEN random() < 0.6 THEN 'booked' ELSE 'ended' END
FROM (SELECT g.day, extract(epoch FROM g.day - (now() - INTERVAL '21 days')) / extract(epoch FROM INTERVAL '20 days') AS progress, extract(isodow FROM g.day) >= 6 AS is_weekend
FROM generate_series(now() - INTERVAL '21 days', now() - INTERVAL '1 day', INTERVAL '1 day') AS g(day)) d
CROSS JOIN LATERAL generate_series(1, greatest(0, round(1 + 3 * d.progress + random() * 2 - CASE WHEN d.is_weekend THEN 1 ELSE 0 END))::int) AS n(i)
WHERE NOT EXISTS (SELECT 1
FROM call_log c
WHERE c.chert_call_id = 'demo_history');

-- 2) Continuous aggregate: bookings per day, by event type and channel (web vs FaceTime)
CREATE MATERIALIZED VIEW IF NOT EXISTS booking_daily
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 day', b.event_time) AS bucket_day, b.event_type, b.event_source, count(*) AS event_count
FROM booking_events b
GROUP BY bucket_day, b.event_type, b.event_source
WITH NO DATA;

SELECT add_continuous_aggregate_policy('booking_daily', start_offset => INTERVAL '60 days', end_offset => INTERVAL '1 hour', schedule_interval => INTERVAL '15 minutes', if_not_exists => TRUE);

-- 3) Continuous aggregate: FaceTime calls per day + average call length
CREATE MATERIALIZED VIEW IF NOT EXISTS call_daily
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 day', c.call_time) AS bucket_day, count(*) AS call_count, avg(c.duration_sec) AS avg_duration_sec
FROM call_log c
GROUP BY bucket_day
WITH NO DATA;

SELECT add_continuous_aggregate_policy('call_daily', start_offset => INTERVAL '60 days', end_offset => INTERVAL '1 hour', schedule_interval => INTERVAL '15 minutes', if_not_exists => TRUE);

-- 4) Fill them now (the policies keep them fresh afterwards)
CALL refresh_continuous_aggregate('booking_daily', NULL, NULL);
CALL refresh_continuous_aggregate('call_daily', NULL, NULL);
