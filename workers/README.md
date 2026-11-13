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
- AI-assisted student internship and offer review through POST /v1/investigate: accepts pasted chat/offer text and PDF, DOCX, ODT, HTML, XML, PNG, JPG or WEBP screenshots/documents (up to five files and 12 MB combined). Supported formats include PDF, common image formats (PNG/JPG/WEBP/GIF/BMP/SVG), DOCX, XLS/XLSX, ODS/ODT, CSV, NUMBERS, HTML and XML. TXT/EML content can be pasted into the message field.
- Uses env.AI.toMarkdown() to extract document/screenshot content and Workers AI Llama 3.3 70B JSON mode to return offer terms, stages explicitly mentioned in the student's evidence, typical possible stages (separately labelled), risk indicators, consistency signals, missing details, questions and next steps.
- Checks at most one primary candidate-provided domain per investigation plus MCA indexed-name evidence when available; returns public search routes for company/recruiter footprint follow-up.
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

## Student internship and offer evidence analysis

The public **Investigate an offer** workspace accepts a company name, website, role, recruiter details, job-source URL, pasted chat/email/message text and up to five supporting files (12 MB combined). Supported file types are PDF, DOCX, ODT, HTML, HTM, XML, PNG, JPG/JPEG and WEBP. TXT/EML content can be pasted into the message field.

The Worker calls the Workers AI Markdown Conversion method (env.AI.toMarkdown) to extract text and image descriptions. It then sends the evidence text plus available MCA and primary-domain signals to the configured Workers AI text model for structured analysis. The model output is constrained to offer terms, stages explicitly mentioned in the student's evidence, typical possible stages (shown separately), risk indicators, consistency signals, missing information, questions and next steps.

**Evidence boundaries:** student-submitted screenshots and offer letters are claims supplied by the candidate, not company-published proof. The application never certifies an offer as genuine, does not infer recruiter employment, and does not invent selection stages. A government company record and DNS/RDAP results cannot establish that a recruiter is authorised or that a vacancy exists.

**Processing and privacy:** the OfferShield Worker does not write uploaded file bytes or extracted offer text to D1/R2 or the report store. The file and its extracted content are sent to Cloudflare Workers AI for document conversion/inference. The response contains a summary and file metadata only; the browser may save that summary in local storage. Do not upload Aadhaar, PAN, bank details, passwords, full home addresses or unrelated personal records. Students should blur personal information in screenshots before upload. Review Cloudflare's applicable terms and data-retention settings for the account hosting the Worker.

**Enablement:** workers/wrangler.toml includes the Workers AI binding: [ai] binding = "AI". Redeploy the Worker after this binding is added. The health endpoint reports aiConfigured and documentConversionConfigured; the Advanced Search connection test shows whether AI is enabled. Workers AI model inference is metered. Markdown conversion is free for most file conversions, while some image conversion paths may invoke models and use AI allocation. Review current [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) and [Markdown Conversion](https://developers.cloudflare.com/workers-ai/features/markdown-conversion/) before broad public use.


## Public company digital-footprint research (optional Tavily integration)

Set the Cloudflare Worker secret `TAVILY_API_KEY` to enable automated public-web research during `POST /v1/investigate`. The Worker issues a small set of company-only queries for:
- company website and public company profile;
- public LinkedIn company pages;
- company history, leadership, partnerships and news;
- internship/jobs and employee-review references;
- public recruiter-profile references only when the student entered a recruiter name.

Only the company name, supplied website/domain and optional recruiter name are sent to Tavily. Uploaded PDFs/images, pasted chats and recruiter email addresses are not sent to Tavily. Search results are cached in D1 for 12 hours. The report stores/display titles, URLs, short snippets, result categories and dates so students can open and inspect the sources.

Tavily uses a separate search index/API. It is not Google Search and does not scrape logged-in LinkedIn. A returned LinkedIn company page is labelled as a publicly indexed page; OfferShield does not claim LinkedIn has verified it. Follower counts, employee snippets, company profiles, reviews or posts are supporting public signals, not proof of legal status or recruiter authority. Treat all search result content as untrusted evidence and ignore any instructions found in it.

### Enable the search key

1. Create a Tavily account at https://app.tavily.com/ and copy the API key.
2. Add a GitHub Actions repository secret named `TAVILY_API_KEY` at https://github.com/Ambkeshwargupta/OfferShield/settings/secrets/actions.
3. Re-run the `Deploy OfferShield intelligence Worker` workflow. The workflow stores the key as a Cloudflare Worker secret.
4. Check `/v1/health` for `webSearchConfigured: true`.

Tavily's current Researcher plan lists 1,000 API credits per month without a credit card; one basic search query uses one credit. Advanced or extraction options can use more credits. Tavily separately advertises a free-for-students offer; eligibility and terms are controlled by Tavily. Keep the number of search queries per investigation capped and monitor the Tavily usage dashboard. See https://www.tavily.com/pricing.

The default implementation uses five basic company queries (website, LinkedIn page, history/news, ecosystem partners and hiring/reviews) and a sixth optional recruiter-name query. Results are cached for 12 hours. If the key is absent or credits are exhausted, OfferShield shows a clear coverage message and keeps manual search links available; it must not invent footprint findings.

## Community Recruitment Intelligence (D1 required)

The Community Recruitment Intelligence page is an opt-in experience-sharing system for students evaluating internships and fresher jobs. It stores only structured fields: company name/domain, opportunity type, role category, state, work mode, stipend band, duration band, stage checkboxes, payment-request response and application outcome. It does not accept free text, screenshots, offer documents, candidate/recruiter names, emails or phone numbers.

### Enable the D1 table

1. Create the D1 database named offershield-intelligence in Cloudflare.
2. In workers/wrangler.toml, uncomment the D1 binding block, keep binding = "DB" and database_name = "offershield-intelligence", and replace the placeholder with the actual D1 database ID.
3. For a new database, apply the full schema: wrangler d1 execute offershield-intelligence --remote --file=workers/schema.sql
4. For an already-running database that has the existing base schema, apply only the new community migration: wrangler d1 execute offershield-intelligence --remote --file=workers/migrations/0003_community_intelligence.sql
5. Redeploy the Worker. The /v1/health response should show d1Configured: true and communityIntelligenceConfigured: true.

### API and safeguards

- POST /v1/community/reports accepts JSON structured fields with explicit own-experience and consent flags. It stores the submission as pending.
- GET /v1/community/insights?companyName=...&website=... returns aggregated patterns only after at least three approved reports for the matching company key/domain during the previous 365 days.
- DELETE /v1/community/reports/{reportId} deletes a contribution when the one-time 48-character deletion token is supplied. Only the SHA-256 token hash is stored; users must keep the token.
- The community submission endpoint is rate-limited to three reports/hour per hashed network identity, in addition to the regular API limit.
- Individual reports are never returned by a public endpoint. Pending and rejected records are not used by AI.
- The AI receives only approved aggregates (report count, stage frequency, stipend/duration/work-mode bands and outcomes), labelled as self-reported and moderator-reviewed. A single reported payment request is not proof of misconduct.
- This is retrieval-based context (often called RAG), not model fine-tuning. Workers AI inference uses a hosted model; this feature does not update the model's weights.

### Manual moderation

Submissions are private and pending until a moderator reviews them. In Cloudflare Dashboard → D1 → offershield-intelligence → Console, review pending rows:

SELECT id, company_name, company_domain, opportunity_type, role_category,
       state, work_mode, stipend_band, duration_band, payment_request,
       outcome, recruitment_stages_json, created_at
FROM community_reports
WHERE moderation_status = 'pending'
ORDER BY created_at ASC;

Approve only structured reports that appear complete, plausible and policy-compliant:

UPDATE community_reports
SET moderation_status = 'approved', approved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = 'REPORT_UUID' AND moderation_status = 'pending';

Reject spam, duplicates, personal data, attempts to identify individuals, or submissions that are not a first-person experience:

UPDATE community_reports
SET moderation_status = 'rejected', moderation_note = 'Reason for moderation decision'
WHERE id = 'REPORT_UUID' AND moderation_status = 'pending';

Never publish individual submissions. The query/API exposes aggregate counts only, after the three-report threshold. Keep moderation decisions and any grievance process consistent with your published privacy policy.

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
| `CLOUDFLARE_API_TOKEN` | Cloudflare account API token with the Edit Cloudflare Workers permission policy |
| `R2_ACCESS_KEY_ID` | R2 S3 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | R2 S3 Secret Access Key |

The existing `DATA_GOV_API_KEY` repository secret is reused. No key is written to the repository, downloaded dataset, index manifest or workflow output. The Cloudflare API token is used by the separate Worker deployment workflow. The R2 S3 credentials are used only for direct object-storage operations in the full national-index import. Create the R2 bucket before Worker deployment; deploying an R2 binding itself does not require R2 object-list/read/write credentials.

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


## National MCA data index

The full nationwide MCA OGD snapshot is stored in Cloudflare R2 rather than Git. See [MCA data coverage and refresh operations](../docs/MCA_DATA_COVERAGE.md). The Worker endpoint `GET /v1/mca/index-status` reports the actual published record count and source timestamp; an R2 binding alone does not mean that the index is populated.
