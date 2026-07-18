-- Persona stream: distinguishes company-page posts from the founder's
-- personal-profile posts. Persona rows use day_seq=4 (company rows are 0-3),
-- so the existing (org_id, publish_date, day_seq) unique index keeps the
-- persona top-up idempotent too.
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'company';
