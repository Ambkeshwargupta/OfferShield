# OfferShield Intelligence API (Cloudflare Workers + D1)

This API is separate from GitHub Pages. GitHub Pages hosts the static premium website; Cloudflare Workers executes server-side integrations and D1 caches public company evidence.

## Current capabilities

- MCA Company Master Data lookup through the data.gov.in resource (CIN and exact company-name filters).
- Udyam MSME registered-unit lookup through resource `8b68ae56-84cf-4728-a0a6-1be11028dea7`, filtered by mandatory State and District parameters with optional local enterprise/activity/pincode matching within each returned page.
- Wikidata third-party company discovery candidates.
- CIN recognition and MCA company data query.
- LLPIN recognition with correct manual MCA fallback; LLPIN is **not** sent to a CIN-only OGD filter.
- GSTIN recognition with official manual lookup. Udyam regional enterprise-list lookup uses the data.gov.in resource; exact Udyam number/certificate verification remains an official manual step because this dataset does not expose a Udyam Registration Number field.
- Company/domain/email input classification.
- Domain intelligence: A, AAAA, MX, TXT, NS and DMARC DNS records.
- Public RDAP registration-data lookup.
- Original email-header parsing: From, Reply-To, Return-Path, Authentication-Results and DKIM selector/domain extraction; optional comparison against a company-published domain.
- Company-published recruitment/fraud contact lookup from the D1 source register.
- Evidence labels and explicit limitations.
- D1 API response cache, company claim observations, contact evidence and hashed-IP rate limiting.

## One-time free setup

You need a Cloudflare account and a data.gov.in account. Do not send either account password or API key in chat.

1. Create a free Cloudflare account: https://dash.cloudflare.com/sign-up
2. Install Node.js 20+ if not already installed, then clone this repository.
3. Open a terminal in the repository's `workers` directory:
   `cd OfferShield/workers`
4. Install Wrangler:
   `npm install -g wrangler`
   (Alternatively use `npx wrangler` in each command.)
5. Authenticate with Cloudflare:
   `wrangler login`
6. Create the D1 database:
   `wrangler d1 create offershield-intelligence`
7. Copy the returned database ID into `workers/wrangler.toml`. Uncomment the `[[d1_databases]]` block and replace `REPLACE_WITH_D1_DATABASE_ID` with the ID from Cloudflare. The database name must stay `offershield-intelligence`.
8. Apply the D1 schema from the `workers` directory:
   `wrangler d1 execute offershield-intelligence --file=schema.sql --remote`
9. Create a free account at https://data.gov.in/ and generate an API key from its API/account area. Review the catalogue at https://www.data.gov.in/catalog/company-master-data.
10. Store the same data.gov.in API key used for the MCA resource as a secret (while still in `workers`):
    `wrangler secret put DATA_GOV_API_KEY`
    Paste the key into the terminal prompt. Do not put it in `wrangler.toml`, `.dev.vars.example`, HTML, browser storage or GitHub.
11. Deploy:
    `wrangler deploy`
12. Copy the Worker URL (for example `https://offershield-intelligence.<your-subdomain>.workers.dev`).
13. Open https://ambkeshwargupta.github.io/OfferShield/ → **Advanced search & intelligence** → **Intelligence API connection**. Paste the Worker URL, click **Connect API**, then **Test**.
14. In the **Udyam registered-unit search** card, supply both State and District. The Worker uses the same `DATA_GOV_API_KEY` secret for the MCA and Udyam resource IDs.

The GitHub Pages origin is already allowed in the Worker CORS list. To use a custom domain later, add that exact origin to `ALLOWED_ORIGINS` in `wrangler.toml` and redeploy.

## Optional: change the OGD resource

The Worker defaults to resource ID `4dbe5667-7b6b-41d7-82af-211562424d9a`. If the OGD catalogue presents a replacement resource, set `DATA_GOV_RESOURCE_ID` as a Worker variable and redeploy. The Worker validates the value as a UUID. Confirm the resource schema and field names before changing it.

## Official source semantics

The OGD Company Master Data feed is a periodic government-published snapshot. The Udyam MSME registered-units resource requires both `filters[State]` and `filters[District]`; its returned fields are `LG_ST_Code`, `State`, `LG_DT_Code`, `District`, `Pincode`, `RegistrationDate`, `EnterpriseName`, `CommunicationAddress` and `Activities`. The catalogue schema does not expose a Udyam Registration Number, so OfferShield can discover/list units by location and compare enterprise names, but cannot confirm a specific Udyam certificate/number from this resource alone. It is not a live MCA portal transaction and it does not prove that a specific recruiter, vacancy or offer is authorised. The exact CompanyName filter may miss punctuation, abbreviations or brand/legal-entity variations. Fuzzy suggestions are community discovery candidates only.

This connector does not imply that all MCA filings, directors, charges, financial statements or LLP records are included. GST and Udyam remain official manual lookup flows in this release; no CAPTCHA bypass or restricted scraping is used.

## Free-tier notes

The current published Cloudflare documentation lists these example free-plan quotas (check the linked pages before launch because limits can change):

- Workers Free: 100,000 requests/day and 10 ms CPU time per request; subrequests are capped at 50 per invocation. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
- D1 Free: 500 MB maximum per database, 5 GB total per account, 5 million rows read/day and 100,000 rows written/day. See [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).
- If free D1 daily read/write limits are exceeded, queries fail until the daily reset; cached data is not deleted. See [D1 free-tier enforcement](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/).

The Worker and schema are designed to cache OGD requests and expire operational rows daily, but they cannot bypass provider quotas. Consider a paid plan only after actual usage requires it.
Cloudflare Workers and D1 have free quotas, but their limits, enforcement and prices can change. Check the current [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) before public traffic grows. D1 must be configured for the Worker cache, source observations, contact directory and distributed rate limiting to persist.

## Operational and security notes

- D1 caches OGD responses for 24 hours and records returned claim-level observations with source ID, retrieval time and expiry.
- DNS is queried through Google Public DNS-over-HTTPS.
- RDAP data can be privacy-redacted or unavailable.
- The Worker never fetches arbitrary user-supplied web pages, reducing SSRF risk.
- Rate-limit hashes derive from Cloudflare's connecting IP; raw IPs are not stored.
- Raw email headers pasted into the Worker are processed for the response and are not intentionally persisted; users should still redact personal data and only connect a Worker they control.
- Review Cloudflare, data.gov.in, Google Public DNS and RDAP usage terms and quotas before broad public launch.


## National MCA company search index

The verified MCA OGD resource currently reports 3,738,721 company/LLP master records. The old `api.data.gov.in` host failed to connect during November 2026 testing; the current working route is `https://www.data.gov.in/backend/dataapi/v1/resource/`. The API connection test and a 1,000-record download both succeeded from GitHub Actions using the repository secret `DATA_GOV_API_KEY`.

A 1,000-record sample measured 587,586 raw bytes and 69,966 gzip bytes. This is a planning estimate only; actual full-index size will be recorded in the generated manifest. A full MCA snapshot is too large to store together with a full-text index in one free D1 database. **The national name index therefore uses Cloudflare R2**, while D1 remains optional for cache, rate limits and smaller local indexes.

### Recommended import: Cloudflare R2

#### 1. Create the dedicated R2 bucket

In Cloudflare Dashboard, open **R2 Object Storage → Create bucket** and create:

`offershield-company-index`

A dedicated bucket is important because the import workflow uses `aws s3 sync --delete` to remove stale index shards before replacing them.

Alternatively, after `npx wrangler login`:

```bash
npx wrangler r2 bucket create offershield-company-index
```

#### 2. Create an R2 S3 API token

In Cloudflare R2, create an S3 API token with **Object Read & Write** access scoped to the `offershield-company-index` bucket. Copy the Access Key ID and Secret Access Key when shown. Do not commit them or paste them into chat.

Find your Cloudflare Account ID in the Cloudflare dashboard.

#### 3. Add three GitHub Actions secrets

Open the repository's [Actions secrets](https://github.com/Ambkeshwargupta/OfferShield/settings/secrets/actions) page and add:

| Secret name | Value |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 S3 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | R2 S3 Secret Access Key |

The existing `DATA_GOV_API_KEY` repository secret is reused. No key is written to the repository, downloaded dataset, index manifest or workflow output.

#### 4. Deploy the Worker with the R2 binding

The `workers/wrangler.toml` file now includes the `COMPANY_INDEX` R2 binding. After the bucket exists, from the repository's `workers` directory run:

```bash
npx wrangler login
npx wrangler secret put DATA_GOV_API_KEY
npx wrangler deploy
```

The same data.gov.in key is used for both MCA and Udyam API routes. D1 is optional for the national R2-backed company-name search; without D1, caching and database rate limiting are unavailable.

#### 5. Run the full national import

Open **GitHub → Actions → MCA national company index import → Run workflow**.

For a safe R2 upload test, set `max_records` to `1000`. Once that succeeds, run it again with `max_records` set to `0` to fetch the complete current MCA snapshot. The workflow:

1. Downloads the dataset from the verified OGD portal endpoint in resumable pages.
2. Creates a bounded-memory token index in compressed NDJSON shards.
3. Uploads those shards and an index manifest to the dedicated R2 bucket.
4. Prints counts and the source snapshot date, not the company rows or API key.

The import can take time and is subject to data.gov.in availability and rate limits. If interrupted, the download tool supports `--resume`; rerun the workflow only after checking the previous run and the local checkpoint. A GitHub-hosted runner is ephemeral, so a new run does not automatically retain the previous runner's `.data` directory. The resumable checkpoint is useful for local runs; for a new hosted runner, the workflow currently starts a fresh download.

#### 6. Connect and verify

After the Worker deploys, open OfferShield → **Advanced search & intelligence** → **Intelligence API connection**. Paste the Worker URL and connect it. Then search a company name such as `Infosys` or `Tata Motors`.

The response includes `nationalIndex` metadata: index availability, matched record count, search strategy, and whether a broad token partition was capped. Each returned MCA result is labelled as a government dataset record and links back to its source catalogue.

### Optional D1 index

The D1 FTS5 migration and scripts remain available for smaller deployments or test datasets. Apply the migration with:

```bash
npx wrangler --config workers/wrangler.toml d1 execute offershield-intelligence --remote --file=workers/migrations/0002_national_company_index.sql
```

Do not attempt to import the complete national dataset into D1 Free. D1 has a 500 MB per-database limit; the full snapshot and full-text index may exceed it. The R2 workflow is the intended national-scale route.

### Important scope

The MCA master-data resource covers company and LLP master records in its published snapshot. It does not contain every informal business, every brand/alias, directors, filings, financial statements, recruiter employment, vacancies or offer authority. Udyam will be integrated separately after MCA ingestion is validated. A government registry record is evidence of an entry in a dated dataset snapshot, not proof that a particular job offer is genuine.
