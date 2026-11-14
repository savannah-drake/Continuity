-- db/insights.sql (PB-22): Tiger Data continuous aggregates for the Insights dashboard.
-- Run once in Tiger's SQL editor. Safe to re-run.
-- Uses: hypertables (booking_events, call_log) + time_bucket + continuous aggregates with real-time data.

-- 1) Sample history so the dashboard has a few weeks of data (marked event_source = 'demo_history')
INSERT INTO booking_events (event_time, user_id, slot_id, event_type, event_source)
SELECT d.day + (random() * INTERVAL '10 hours') + INTERVAL '9 hours', NULL, NULL, e.event_type, CASE WHEN random() < 0.55 THEN 'demo_history_facetime' ELSE 'demo_history_web' END
FROM generate_series(now() - INTERVAL '21 days', now() - INTERVAL '1 day', INTERVAL '1 day') AS d(day)
CROSS JOIN LATERAL (SELECT unnest(ARRAY['requested', 'confirmed']) AS event_type
FROM generate_series(1, 1 + floor(random() * 4)::int)) e
WHERE NOT EXISTS (SELECT 1
FROM booking_events b
WHERE b.event_source IN ('demo_history', 'demo_history_web', 'demo_history_facetime'));

INSERT INTO call_log (call_time, user_id, chert_call_id, duration_sec, call_outcome)
SELECT d.day + (random() * INTERVAL '10 hours') + INTERVAL '9 hours', NULL, 'demo_history', 45 + floor(random() * 200)::int, CASE WHEN random() < 0.6 THEN 'booked' ELSE 'ended' END
FROM generate_series(now() - INTERVAL '21 days', now() - INTERVAL '1 day', INTERVAL '1 day') AS d(day)
CROSS JOIN generate_series(1, 2) g
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
