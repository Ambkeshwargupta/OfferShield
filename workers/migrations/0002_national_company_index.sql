-- National MCA company/LLP search index.
-- Apply once to an existing D1 database:
-- npx wrangler d1 execute offershield-intelligence --remote --file=migrations/0002_national_company_index.sql

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
