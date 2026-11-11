# OfferShield

**Know who's behind the offer.**

OfferShield is an India-first company and recruitment due-diligence platform focused on students evaluating internships and fresher job offers, including opportunities advertised by startups and small companies. Students can investigate company identity, upload chat screenshots and offer documents, inspect public domain signals, extract recruitment stages and terms, and receive an evidence-led review with practical questions and next steps.

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
- Paste recruiter conversations and internship descriptions, or upload chat screenshots, offer letters and supporting files (PDF, DOCX, XLS/XLSX, ODS/ODT, CSV, HTML, XML, PNG, JPG, WEBP, GIF, BMP or SVG).
- Use the connected Worker and Workers AI to extract evidence and analyse offer terms, payment requests, recruitment stages, missing details and consistency/risk signals.
- Display stages mentioned in the student's evidence separately from generic possible stages; never present them as company-confirmed.
- Save the analysis summary locally in the current browser. Original uploaded file bytes are not included in the saved report.

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
- Udyam registered-unit discovery through the official data.gov.in resource, filtered by State and District. The dataset does not expose Udyam Registration Numbers, so it is not an exact certificate-verification API.
- Durable page-by-page MCA bulk-data ingestion to Cloudflare R2, with a checkpoint persisted after each successfully uploaded page.
- Bounded-memory national MCA token index with per-token shard manifests and rarest-token search.
- Resumable bulk MCA company/LLP master-data downloader and D1 FTS5 national search-index importer (requires local key and configured D1; no national snapshot is bundled in Git).
- Exact CIN/LLPIN and CompanyName filters.
- Wikidata discovery candidates.
- DNS-over-HTTPS and RDAP lookups.
- Email header parser.
- AI-assisted internship/offer investigation endpoint (POST /v1/investigate) using Workers AI Markdown Conversion and Llama 3.3 70B JSON-mode inference.
- Screenshot/document evidence extraction, domain DNS/RDAP and pasted email-header clues, MCA indexed-name/CIN lookup, regional Udyam enterprise discovery and Wikidata candidates, plus structured student-facing assessment.
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
3. Add the D1 binding to workers/wrangler.toml when using D1 features.
4. Enable the Workers AI binding ([ai] binding = "AI" is included in the supplied Wrangler config) for document conversion and AI offer analysis.
5. Obtain a data.gov.in API key and store it using wrangler secret put DATA_GOV_API_KEY.
6. Deploy the Worker.
6. Paste the Worker URL into OfferShield → Advanced Search & Intelligence → API connection.

Never put the government API key in docs/index.html, browser local storage or GitHub. Workers AI inference is usage-metered; check current Cloudflare pricing and usage before inviting students to upload files.

## Data source coverage and limitations

- MCA OGD company master data is a periodic snapshot distributed by data.gov.in. It is not a live MCA portal transaction.
- The OGD name filter is exact; fuzzy matches are discovery candidates and require manual entity resolution.
- The dataset does not authenticate a recruiter or a particular vacancy/offer.
- GST taxpayer verification remains an official manual lookup. Udyam regional enterprise discovery is available through the OGD dataset, while exact Udyam number/certificate verification remains a manual official-portal step because the dataset does not expose the registration number. No CAPTCHA bypass or unauthorised scraping is implemented.
- EPFO is an official manual lookup link.
- LinkedIn and job boards are linked for manual review; they are not scraped.
- DNS/RDAP/SPF/DMARC signals describe technical records and do not establish company ownership or recruiter authority.
- Pasted raw email headers can be altered; only original mailbox headers should be relied on, and authentication results are not proof of offer authority.
- The GitHub Pages version saves reports in that browser only. Original uploads are processed by the connected Cloudflare Worker/Workers AI and are not persisted by the OfferShield application; the resulting summary can be saved in browser storage. Multi-user accounts and central report storage require a separate production backend and authentication layer.
- AI findings are not independent source verification. Website/job-board searches are presented as follow-up discovery links; restricted professional profiles are not scraped. Recruiter employment and vacancy authorisation remain unverified unless confirmed through an independently sourced employer channel.

## Deployment options

- GitHub Pages: public static site only.
- Cloudflare Workers + D1: recommended scalable server-side intelligence layer.
- Node server: local development and single-instance self-hosted deployment.

See `DATA_SOURCES.md`, `SECURITY.md`, `PRIVACY.md`, `DEPLOYMENT.md` and `workers/README.md`.

## Project principle

**Evidence before conclusions.** Separate government dataset records, official company statements, third-party discovery candidates, candidate-provided details, conflicting evidence and information not found. Missing data is a coverage gap, not evidence of fraud.
