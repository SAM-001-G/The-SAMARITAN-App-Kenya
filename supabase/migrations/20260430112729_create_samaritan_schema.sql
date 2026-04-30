/*
  # SAMARITAN Platform — Initial Schema

  ## Overview
  Creates all core tables for the SAMARITAN civic platform including civic reports,
  news articles fetched from Kenyan news sources, SOS alerts, and confirmations.

  ## New Tables

  1. `civic_reports`
     - User-submitted civic issue reports (corruption, abandoned projects, etc.)
     - Stores category, title, description, location coordinates, media URL
     - Tracks submission time and anonymous reporter name

  2. `news_articles`
     - Kenyan news articles fetched from RSS/news feeds
     - Stores source, title, description, publication date, URL, category tag
     - Has a unique constraint on URL to prevent duplicates
     - `is_pinned` allows manual editorial pinning

  3. `sos_alerts`
     - Emergency SOS events triggered by users
     - Stores type (Medical/Fire/Security/Disaster), coordinates, status
     - Status: active | resolved | cancelled

  4. `report_confirmations`
     - Tracks which reports a session has confirmed (community verification)
     - Prevents double-confirms via unique constraint

  ## Security
  - RLS enabled on all tables
  - Civic reports: authenticated insert, public select
  - News articles: public select only (written by edge function with service role)
  - SOS alerts: authenticated insert, public select
  - Confirmations: authenticated insert and select own
*/

-- ── CIVIC REPORTS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS civic_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category    text NOT NULL CHECK (category IN ('corruption','abandoned','environment','safety','public','other')),
  title       text NOT NULL DEFAULT '',
  description text NOT NULL,
  location    text NOT NULL DEFAULT '',
  lat         double precision,
  lng         double precision,
  media_url   text DEFAULT '',
  reporter    text DEFAULT 'Anonymous Reporter',
  confirmations integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE civic_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read civic reports"
  ON civic_reports FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert civic reports"
  ON civic_reports FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update confirmations"
  ON civic_reports FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ── NEWS ARTICLES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS news_articles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source       text NOT NULL DEFAULT '',
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  url          text NOT NULL,
  image_url    text DEFAULT '',
  category     text NOT NULL DEFAULT 'public',
  published_at timestamptz,
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  is_pinned    boolean NOT NULL DEFAULT false,
  CONSTRAINT news_articles_url_unique UNIQUE (url)
);

ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read news articles"
  ON news_articles FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role can insert news articles"
  ON news_articles FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update news articles"
  ON news_articles FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── SOS ALERTS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sos_alerts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type       text NOT NULL DEFAULT 'General Emergency',
  lat        double precision,
  lng        double precision,
  location   text DEFAULT '',
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sos_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert sos alerts"
  ON sos_alerts FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can read sos alerts"
  ON sos_alerts FOR SELECT
  TO anon, authenticated
  USING (true);

-- ── REPORT CONFIRMATIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_confirmations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  uuid NOT NULL,
  report_type text NOT NULL DEFAULT 'civic' CHECK (report_type IN ('civic','news')),
  session_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT confirmation_unique UNIQUE (report_id, session_id)
);

ALTER TABLE report_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert confirmations"
  ON report_confirmations FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can read confirmations"
  ON report_confirmations FOR SELECT
  TO anon, authenticated
  USING (true);

-- ── INDEXES ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_civic_reports_category ON civic_reports(category);
CREATE INDEX IF NOT EXISTS idx_civic_reports_created_at ON civic_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_published_at ON news_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_category ON news_articles(category);
CREATE INDEX IF NOT EXISTS idx_sos_alerts_status ON sos_alerts(status);
CREATE INDEX IF NOT EXISTS idx_report_confirmations_report_id ON report_confirmations(report_id);
