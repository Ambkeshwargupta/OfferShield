# UDYAM and GSTIN integration — operational guide

## What is implemented

- Existing live UDYAM lookup remains at `GET /v1/udyam/search?state=...&district=...&q=...`.
- `scripts/udyam-download.mjs` downloads the official data.gov.in UDYAM unit-list resource by State + District, writes normalized NDJSON page files, and checkpoints progress.
- `.github/workflows/udyam-dataset-import.yml` provides a manual GitHub Actions runner for a supplied official district manifest and publishes the resulting data as a short-lived workflow artifact.
- GSTIN live verification must use a GSTN-authorised GSP/ASP service. The public GST portal is a manual, CAPTCHA-protected lookup; do not scrape it or bypass CAPTCHA.

## Important UDYAM dataset limits

The official unit-list resource requires both State and District filters. The downloader therefore requires a JSON manifest containing every State/District pair that you intend to include:

```json
[
  { "state": "Madhya Pradesh", "district": "Rewa" },
  { "state": "Delhi", "district": "New Delhi" }
]
```

The example is illustrative, not a complete national list. Obtain and validate the complete current list from the official Local Government Directory (LGD) / government source before running a national import. Keep spellings aligned with the OGD filters. A missing district means a coverage gap, not an unregistered business.

The OGD catalogue indicates that the list is published by the Ministry of MSME and is updated periodically; downloading filtered records may require logging into data.gov.in. Confirm that your API key is authorised for this resource and that the API returns records for the chosen State/District. The resource fields include State, District, PIN code, registration date, enterprise name, communication address and activities. **It does not expose a UDYAM Registration Number.** It is therefore useful for enterprise discovery/name-and-location cross-checks, not certificate-number validation.

### Run locally

```bash
export DATA_GOV_API_KEY="your-data.gov.in-api-key"
node scripts/udyam-download.mjs --districts=data/udyam-districts.json --max-pages-per-district=1
node scripts/udyam-download.mjs --districts=data/udyam-districts.json --resume
```

Use `--max-pages-per-district=1` for a smoke test. Omit the limit for a complete run. The script stores one deterministic NDJSON file per district/page under `.data/udyam/pages/` and a checkpoint at `.data/udyam/checkpoint.json`. Keep the output outside Git; do not commit the national dataset. A changed source total during an import causes a hard stop so that pages from different snapshots are not silently mixed.

### Run through GitHub Actions

1. Add repository secret `DATA_GOV_API_KEY`.
2. Add a reviewed, complete district manifest to the repository or supply its path at workflow dispatch.
3. Run **UDYAM district dataset import** with `max_pages_per_district=1` first.
4. Inspect the artifact and source totals. Then run with `max_pages_per_district=0` for all pages.
5. Download the artifact and retain it in private, access-controlled storage if required. The workflow currently does not publish the dataset to the live API/R2 index; publication should follow a verified national manifest and storage design, not happen automatically from an incomplete district list.

## GSTIN live verification

GST taxpayer profile lookup can expose legal name, trade name, registration date, constitution, principal place of business, cancellation date and return filing information through the official GST portal. The public website requires a human CAPTCHA. GSTN's system APIs are accessed through authorised GSP/ASP arrangements; there is no general-purpose public bulk GSTIN dump or unrestricted developer key.

Before enabling live API calls, choose a GSTN-authorised GSP/ASP and obtain written confirmation of:
- your permitted use case (company identity/fraud-prevention checks);
- API endpoint, authentication scheme, request/response schema and rate limits;
- per-call pricing, free trial/quota, caching/retention rules and production access;
- whether OfferShield may display the returned fields and how attribution must appear.

Do not put provider keys in frontend JavaScript or repository files. Store them as Cloudflare Worker secrets. Do not assume that a GSP's API is interchangeable with another provider's API; implement a provider-specific adapter only after its current documentation and credentials are available. Never cache more data than the provider agreement permits.

Official manual fallback: https://services.gst.gov.in/services/searchtp


### Configure the Worker-side GSP adapter

The Worker exposes `GET /v1/gst/verify?gstin=<15-character-GSTIN>`. It calls only the endpoint configured by you; the browser never receives the API key.

After selecting a provider and receiving its documentation, configure these **Cloudflare Worker secrets/variables**:

- `GST_GSP_LOOKUP_URL` — provider's documented HTTPS single-GSTIN endpoint with the literal placeholder `{gstin}`, for example `https://provider.example/api/taxpayer/{gstin}`. This is a format example only, not a real provider URL.
- `GST_GSP_API_KEY` — provider-issued secret.
- `GST_GSP_AUTH_HEADER` — optional variable naming the provider's API-key header; defaults to `x-api-key`. If the provider requires OAuth, signed requests, multiple headers or a token exchange, its adapter must be extended to that documented contract rather than forcing this simple API-key mode.

The adapter maps common response aliases for legal name, trade name, registration date, constitution, status, cancellation date, principal place of business and taxpayer type. Check the mapping against the provider's real sandbox response before production. The endpoint deliberately returns only a small normalised field set, not the raw provider payload. Successful lookups are cached for one hour; provider-negative responses for five minutes. Change these TTLs only if the provider contract permits it.

Do not configure this adapter with an unverified aggregator or scrape endpoint. Ask the provider to confirm its GSTN authorisation and your right to use/display taxpayer data for OfferShield. If it provides a different authentication flow or response structure, keep the credentials in Worker secrets and implement a provider-specific adapter after testing against its sandbox. Until then, the endpoint correctly returns the official manual lookup link and does not claim live verification.

Example deployment commands (run from `workers/` after reviewing provider terms):

```bash
npx wrangler secret put GST_GSP_API_KEY
npx wrangler secret put GST_GSP_LOOKUP_URL
# GST_GSP_AUTH_HEADER is a non-secret variable if required:
npx wrangler secret put GST_GSP_AUTH_HEADER
npx wrangler deploy
```

Use Cloudflare Dashboard → Workers & Pages → offershield-intelligence → Settings → Variables and Secrets if the URL/header are configured as plain variables. Keep the API key as a secret.

## Recommended unified verification model

For each company, retain independent evidence rows rather than collapsing all sources into one "verified" badge:

| Source | Evidence it can support | What it cannot prove |
|---|---|---|
| MCA OGD | Company/LLP master record in a dated dataset snapshot | Current live status, recruiter authority, offer authenticity |
| UDYAM OGD | Enterprise name/activity/address in the selected State/District dataset | UDYAM number/certificate validity, recruiter authority |
| GST GSP | GSTIN status and permitted taxpayer profile fields returned by provider | Recruiter employment, job vacancy or offer authenticity |
| Company website/contact page | Publicly published company contact and hiring guidance | That a specific message came from that company |
| Submitted offer/chat | What the candidate received | That the document/message is genuine |

A mismatch should be displayed with the exact fields, source, retrieval time and source update date. A missing match is "not found in searched coverage", never a fraud verdict. An active GSTIN or UDYAM listing is not a guarantee that the job offer is genuine.

## Cloudflare cost and operations

Keep the current Cloudflare Worker + D1 + R2 architecture. Use R2 for large immutable UDYAM snapshot/page files and manifests; use D1 for small metadata, lookup cache and source observations. Do not attempt to place the full nationwide UDYAM file in D1. Apply provider-specific cache TTLs only after reviewing the GSP agreement. The current workflow stores UDYAM output as a GitHub Actions artifact for 14 days and is not a production data publisher.
