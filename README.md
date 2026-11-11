# OfferShield

**Know who's behind the offer.**

OfferShield is an India-first company and recruitment due-diligence platform. Candidates can investigate company identity, government-published master data, public digital footprint, recruitment guidance, official contacts, technical domains and email headers — then assemble an evidence-led report.

> OfferShield is an investigation aid, not a fraud verdict, legal opinion, background check or guarantee that an offer is genuine. A legal registration, professional profile, convincing document, DNS record or matching email domain does not prove that a specific recruiter or vacancy is authorised.

## Architecture

- **GitHub Pages:** static premium website in `docs/`.
- **Cloudflare Workers:** optional server-side intelligence API in `workers/api.js`.
- **Cloudflare D1:** cache, source registry, company observations, public contact evidence and hashed-IP rate limits in `workers/schema.sql`.
- **Node API:** standalone single-origin prototype in `server.js`.
- **Tests:** Node built-in tests for the Node server, Worker API and browser page.

## Current capability set

### Public website
- Search the curated company profiles.
- Search open-data company candidates through Wikidata.
- Add a manual investigation for companies not found in structured sources.
- Display official government and company-owned source links.
- Analyse pasted offer/recruitment messages and compare domains with available company reference domains.
- Save reports locally in the current browser.

### Advanced intelligence UI
- Search by company name, CIN, LLPIN, GSTIN or domain.
- Connect a Cloudflare Worker backend through the Advanced Search settings.
- Show MCA company master-data records separately from Wikidata discovery candidates.
- Inspect DNS A/AAAA/MX/TXT/NS and DMARC, with public RDAP domain registration information.
- Parse original email headers for From, Reply-To, Return-Path, Authentication-Results and DKIM selector clues.
- Build public recruiter/contact cross-check routes without scraping restricted professional profiles.
- Save combined investigation notes in local browser storage.

### Cloudflare backend
- MCA company master-data lookup through the current official data.gov.in portal API route (free registered API key required).
- Resumable national MCA bulk-data importer and R2 token-search index builder; full import is launched from GitHub Actions after R2 credentials are configured.
- Resumable bulk MCA company/LLP master-data downloader and D1 FTS5 national search-index importer (requires local key and configured D1; no national snapshot is bundled in Git).
- Exact CIN/LLPIN and CompanyName filters.
- Wikidata discovery candidates.
- DNS-over-HTTPS and RDAP lookups.
- Email header parser.
- D1-backed API response cache and rate limit buckets when D1 is configured.

## Run the Node prototype locally

Requirements: Node.js 20 or later.

```bash
git clone https://github.com/Ambkeshwargupta/OfferShield.git
cd OfferShield
npm run check
npm test
npm start
```

Open http://localhost:3000.

The Node prototype stores browser-session report metadata in a local JSON file. It is for development and a single instance, not multi-user production.

## Deploy the scalable intelligence API

Follow [workers/README.md](workers/README.md). In summary:

1. Create a Cloudflare account and authenticate Wrangler.
2. Create a D1 database and apply `workers/schema.sql`.
3. Add the D1 binding to `workers/wrangler.toml`.
4. Obtain a free data.gov.in API key and store it using `wrangler secret put DATA_GOV_API_KEY`.
5. Deploy the Worker.
6. Paste the Worker URL into OfferShield → Advanced Search & Intelligence → API connection.

Never put the government API key in `docs/index.html`, browser local storage or GitHub.

## Data source coverage and limitations

- MCA OGD company master data is a periodic snapshot distributed by data.gov.in. It is not a live MCA portal transaction.
- The OGD name filter is exact; fuzzy matches are discovery candidates and require manual entity resolution.
- The dataset does not authenticate a recruiter or a particular vacancy/offer.
- GST and Udyam checks are linked to official manual portals in this release; no CAPTCHA bypass or unauthorised scraping is implemented.
- EPFO is an official manual lookup link.
- LinkedIn and job boards are linked for manual review; they are not scraped.
- DNS/RDAP/SPF/DMARC signals describe technical records and do not establish company ownership or recruiter authority.
- Pasted raw email headers can be altered; only original mailbox headers should be relied on, and authentication results are not proof of offer authority.
- The GitHub Pages version saves reports in that browser only. Multi-user accounts and central report storage require a separate production backend and authentication layer.

## Deployment options

- GitHub Pages: public static site only.
- Cloudflare Workers + D1: recommended scalable server-side intelligence layer.
- Node server: local development and single-instance self-hosted deployment.

See `DATA_SOURCES.md`, `SECURITY.md`, `PRIVACY.md`, `DEPLOYMENT.md` and `workers/README.md`.

## Project principle

**Evidence before conclusions.** Separate government dataset records, official company statements, third-party discovery candidates, candidate-provided details, conflicting evidence and information not found. Missing data is a coverage gap, not evidence of fraud.
