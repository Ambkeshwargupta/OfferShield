-- Community Recruitment Intelligence (structured, opt-in, moderated contributions).
-- Never add raw messages, screenshots, recruiter names, emails, phone numbers or free-text fields here.
CREATE TABLE IF NOT EXISTS community_reports (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  company_key TEXT NOT NULL,
  company_domain TEXT,
  opportunity_type TEXT NOT NULL,
  role_category TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT '',
  work_mode TEXT NOT NULL,
  stipend_band TEXT NOT NULL,
  duration_band TEXT NOT NULL,
  payment_request TEXT NOT NULL,
  outcome TEXT NOT NULL,
  recruitment_stages_json TEXT NOT NULL DEFAULT '[]',
  moderation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending','approved','rejected')),
  consent_version TEXT NOT NULL,
  deletion_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  moderation_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_community_company_key_status_date
  ON community_reports(company_key,moderation_status,created_at);
CREATE INDEX IF NOT EXISTS idx_community_domain_status_date
  ON community_reports(company_domain,moderation_status,created_at);
CREATE INDEX IF NOT EXISTS idx_community_pending_date
  ON community_reports(moderation_status,created_at);
