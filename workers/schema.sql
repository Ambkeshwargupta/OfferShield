PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS api_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at);

CREATE TABLE IF NOT EXISTS company_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_identifier TEXT NOT NULL,
  source_id TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  claim_value TEXT NOT NULL,
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('official_dataset_record','official_company_source','third_party_candidate','candidate_provided','not_checked','conflicting')),
  source_url TEXT NOT NULL,
  source_updated_at TEXT,
  retrieved_at TEXT NOT NULL,
  expires_at INTEGER,
  UNIQUE(entity_identifier, source_id, claim_type, claim_value)
);
CREATE INDEX IF NOT EXISTS idx_company_observations_identifier ON company_observations(entity_identifier);
CREATE INDEX IF NOT EXISTS idx_company_observations_claim ON company_observations(claim_type);

CREATE TABLE IF NOT EXISTS public_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_identifier TEXT NOT NULL,
  contact_type TEXT NOT NULL,
  contact_value TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_publisher TEXT NOT NULL,
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('official_company_source','third_party_candidate','not_checked')),
  last_checked_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(entity_identifier, contact_type, contact_value, source_url)
);
CREATE INDEX IF NOT EXISTS idx_public_contacts_entity ON public_contacts(entity_identifier);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(key, bucket)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_bucket ON rate_limits(bucket);

CREATE TABLE IF NOT EXISTS source_registry (
  source_id TEXT PRIMARY KEY,
  publisher TEXT NOT NULL,
  source_type TEXT NOT NULL,
  authority_type TEXT NOT NULL,
  url TEXT NOT NULL,
  last_checked_at TEXT,
  notes TEXT
);

INSERT OR IGNORE INTO source_registry (source_id,publisher,source_type,authority_type,url,notes) VALUES
('mca-ogd','Ministry of Corporate Affairs via data.gov.in','Company master data','Official government dataset','https://www.data.gov.in/catalog/company-master-data','Periodic snapshot, not live MCA portal status'),
('gst','GST Portal','Taxpayer lookup','Official government portal','https://services.gst.gov.in/services/searchtp','Manual lookup in this release'),
('udyam','Udyam Registration','MSME registration lookup','Official government portal','https://udyamregistration.gov.in/Udyam_Verify.aspx','Manual lookup; CAPTCHA may apply'),
('epfo','EPFO','Employer establishment lookup','Official government portal','https://unifiedportal-emp.epfindia.gov.in/publicPortal/no-auth/misReport/home/loadEstSearchHome','Manual lookup in this release'),
('wikidata','Wikidata','Entity discovery','Community-maintained third-party','https://www.wikidata.org/','Discovery candidate only; not an official registry');

-- Public contacts are included only when published by the employer on its own website.
-- These are recruitment/fraud-verification contacts, not a directory of individual employees.
INSERT OR IGNORE INTO public_contacts (entity_identifier,contact_type,contact_value,source_url,source_publisher,evidence_status,last_checked_at,active) VALUES
('tcs.com','Recruitment helpline','1800-209-3111','https://www.tcs.com/careers/india/recruitment-fraud-alert','Tata Consultancy Services','official_company_source',NULL,1),
('tcs.com','Recruitment email','careers@tcs.com','https://www.tcs.com/careers/india/recruitment-fraud-alert','Tata Consultancy Services','official_company_source',NULL,1),
('wipro.com','Recruitment fraud helpdesk email','helpdesk.recruitment@wipro.com','https://careers.wipro.com/content/Fraud-Awareness/?locale=en_US','Wipro','official_company_source',NULL,1),
('ril.com','Recruitment fraud contact','recruitment.fraud@ril.com','https://www.ril.com/careers/search-apply/fraud-alert','Reliance Industries','official_company_source',NULL,1);


-- National MCA company/LLP search index (migration 0002).
CREATE TABLE IF NOT EXISTS companies (
  cin TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  status TEXT,
  company_class TEXT,
  category TEXT,
  sub_category TEXT,
  registration_date TEXT,
  state TEXT,
  roc TEXT,
  authorized_capital TEXT,
  paid_up_capital TEXT,
  registered_office TEXT,
  listing_status TEXT,
  industrial_classification TEXT,
  source_updated_at TEXT,
  imported_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_companies_name_normalized ON companies(name_normalized);
CREATE INDEX IF NOT EXISTS idx_companies_state ON companies(state);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);

-- FTS5 is supported by Cloudflare D1. This external-content index avoids
-- duplicating the full company rows while enabling token and prefix search.
CREATE VIRTUAL TABLE IF NOT EXISTS companies_fts USING fts5(
  name,
  name_normalized,
  cin UNINDEXED,
  content='companies',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS companies_fts_insert AFTER INSERT ON companies BEGIN
  INSERT INTO companies_fts(rowid,name,name_normalized,cin)
  VALUES(new.rowid,new.name,new.name_normalized,new.cin);
END;

CREATE TRIGGER IF NOT EXISTS companies_fts_delete AFTER DELETE ON companies BEGIN
  INSERT INTO companies_fts(companies_fts,rowid,name,name_normalized,cin)
  VALUES('delete',old.rowid,old.name,old.name_normalized,old.cin);
END;

CREATE TRIGGER IF NOT EXISTS companies_fts_update AFTER UPDATE ON companies BEGIN
  INSERT INTO companies_fts(companies_fts,rowid,name,name_normalized,cin)
  VALUES('delete',old.rowid,old.name,old.name_normalized,old.cin);
  INSERT INTO companies_fts(rowid,name,name_normalized,cin)
  VALUES(new.rowid,new.name,new.name_normalized,new.cin);
END;

CREATE TABLE IF NOT EXISTS company_index_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
