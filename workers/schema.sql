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
  last_checked_at TEXT NOT NULL,
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
