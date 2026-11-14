-- PB-37 + PB-39: language + location on users. Run once in Tiger's SQL editor.
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en';
ALTER TABLE users ADD COLUMN IF NOT EXISTS home_zip TEXT;
-- Maya (demo): live near Emory (ZIP 30322) and keep English as her default
UPDATE users
SET home_zip = '30322', home_lat = 33.7925, home_lng = -84.324
WHERE user_id = 1
AND home_lat IS NULL;
