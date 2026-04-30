/*
  # Add Helper Database Functions

  ## Overview
  Adds two utility functions used by the SAMARITAN frontend and edge function.

  1. `increment_confirmations(report_id uuid)` — safely increments the confirmations
     counter on a civic_reports row without a read-modify-write race condition.

  2. `cleanup_old_news()` — removes news_articles rows beyond the most recent 200,
     ordered by published_at descending, to keep the table lean.

  ## Security
  Both functions run with SECURITY DEFINER so they can be called by the anon/
  authenticated roles without needing direct table update permissions beyond
  what RLS already allows.
*/

CREATE OR REPLACE FUNCTION increment_confirmations(report_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE civic_reports
  SET confirmations = confirmations + 1
  WHERE id = report_id;
$$;

CREATE OR REPLACE FUNCTION cleanup_old_news()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM news_articles
  WHERE id NOT IN (
    SELECT id FROM news_articles
    ORDER BY COALESCE(published_at, fetched_at) DESC
    LIMIT 200
  );
$$;
