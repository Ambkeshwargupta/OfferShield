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

#### 3. Add four GitHub Actions secrets

Open the repository's [Actions secrets](https://github.com/Ambkeshwargupta/OfferShield/settings/secrets/actions) page and add:

| Secret name | Value |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with permission to deploy Workers and access the R2 binding |
| `R2_ACCESS_KEY_ID` | R2 S3 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | R2 S3 Secret Access Key |

The existing `DATA_GOV_API_KEY` repository secret is reused. No key is written to the repository, downloaded dataset, index manifest or workflow output. The Cloudflare API token is used only by the separate Worker deployment workflow; the R2 S3 credentials are used only to upload objects.

#### 4. Deploy the Worker with the R2 binding

The `workers/wrangler.toml` file includes the `COMPANY_INDEX` R2 binding. For a Worker-only deployment, open **GitHub → Actions → Deploy OfferShield intelligence Worker → Run workflow**. That workflow stores `DATA_GOV_API_KEY` as a Worker secret and deploys the Worker using the R2 binding. The full MCA import workflow also deploys the updated Worker automatically after it publishes a complete national index; the `CLOUDFLARE_API_TOKEN` secret is therefore required for a full (`max_records=0`) import.

Alternatively, from the repository's `workers` directory run:

```bash
npx wrangler login
npx wrangler secret put DATA_GOV_API_KEY
npx wrangler deploy
```

The same data.gov.in key is used for both MCA and Udyam API routes. D1 is optional for the national R2-backed company-name search; without D1, caching and database rate limiting are unavailable.

#### 5. Run the national import

Open **GitHub → Actions → MCA national company index import → Run workflow**.

There are two modes:

- **Test:** set \`max_records\` to \`1000\`. This downloads and indexes a small sample, then uploads it to \`staging/index/\`. It does not replace the live search index.
- **Full national import:** set \`max_records\` to \`0\`. This resumes from the checkpoint stored in R2, downloads the remaining MCA snapshot and publishes only after the downloaded source and generated index pass coverage checks.

The workflow is designed for runner restarts:

1. It restores \`ingestion/mca/checkpoint.json\` from R2.
2. It downloads the next OGD page, normalizes it and compresses it.
3. It uploads the page to \`ingestion/mca/pages/\`.
4. Only after the page upload succeeds, it advances and uploads the checkpoint.
5. It restores all persisted pages, assembles the normalized snapshot and builds the search index.
6. It checks the indexed company count against the checkpoint before publishing.

If the GitHub Actions runner is interrupted, run the workflow again with \`max_records=0\`. It resumes from the last successfully persisted page; a page that uploaded before its checkpoint did not will simply be downloaded and overwritten at the same object key.

The index is published under the separate \`index/\` prefix. The \`--delete\` operation is scoped to that prefix and cannot delete the raw ingestion pages or checkpoint. Test runs publish to \`staging/index/\` so they cannot accidentally replace production search data.

The index builder creates one \`manifest.json\` for each token. Each manifest lists all compressed posting shards and the number of company records for that token. This lets the Worker choose a relatively selective token before scanning postings. Very broad tokens can still exceed the Worker request budget; those searches are explicitly marked \`partial\` and should be narrowed with more of the company name.

#### 6. Connect and verify

After the Worker deploys, open OfferShield → **Advanced search & intelligence** → **Intelligence API connection**. Paste the Worker URL and connect it. Then search a company name such as `Infosys` or `Tata Motors`.

The response includes `nationalIndex` metadata: index availability, returned match count, search strategy, selected token and whether the query was capped by the R2 request budget. Each returned MCA result is labelled as a government dataset record and links back to its source catalogue. The national index is complete only for the snapshot that was actually imported and published.

### Optional D1 index

The D1 FTS5 migration and scripts remain available for smaller deployments or test datasets. Apply the migration with:

```bash
npx wrangler --config workers/wrangler.toml d1 execute offershield-intelligence --remote --file=workers/migrations/0002_national_company_index.sql
```

Do not attempt to import the complete national dataset into D1 Free. D1 has a 500 MB per-database limit; the full snapshot and full-text index may exceed it. The R2 workflow is the intended national-scale route.

### Important scope

The MCA master-data resource covers company and LLP master records in its published snapshot. It does not contain every informal business, every brand/alias, directors, filings, financial statements, recruiter employment, vacancies or offer authority. Udyam will be integrated separately after MCA ingestion is validated. A government registry record is evidence of an entry in a dated dataset snapshot, not proof that a particular job offer is genuine.
