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
