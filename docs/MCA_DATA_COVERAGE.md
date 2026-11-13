# OfferShield — MCA national data coverage

## Source of truth

OfferShield uses the Ministry of Corporate Affairs (MCA) **Company Master Data** published through the Open Government Data (OGD) Platform India:

- Dataset: https://www.data.gov.in/catalog/company-master-data
- Resource ID: `4dbe5667-7b6b-41d7-82af-211562424d9a`
- Licence: Government Open Data License – India (GODL)
- Source refresh date: read from the live OGD API response and stored in every import/index manifest. The catalogue showed an update on 13 October 2026 when this integration was reviewed.

The national endpoint is paginated. The repository does not commit millions of records to Git: the import workflow stores compressed source pages in the `offershield-company-index` Cloudflare R2 bucket and builds a separate, compressed token index for fast company-name discovery. Git stores the reproducible downloader, index builder, deployment workflow, tests and this attribution/coverage document.

## What the import stores

For each source row with a usable registration identifier and name, OfferShield normalises the fields supplied by OGD, including the registration identifier, legal name, status, class, category, sub-category, incorporation date, state, RoC, authorised capital, paid-up capital, registered office, listing status and industrial classification. The import manifest reports the actual source total, rows downloaded, rows indexed, skipped rows, source update timestamp, token postings and index shards.

Do not assume every row has every optional field populated. Missing values remain missing. The API's `count` field is a page count and is never used as a substitute for the dataset-wide `total`.

## Where data lives

- `ingestion/mca/pages/`: compressed, resumable pages from the official OGD snapshot.
- `ingestion/mca/checkpoint.json`: source total, downloaded count, usable row count, source update timestamp, next offset and completion marker.
- `index/mca/term/<token>/`: compressed searchable posting shards and per-token manifests.
- `index/index-manifest.json`: published index size, source date and coverage metrics.

A new snapshot is built separately and published only after its row count matches the persisted checkpoint. The previous `index/` stays live while a new snapshot is downloading or building. The live Worker exposes `GET /v1/mca/index-status`; the full-import workflow checks that this endpoint reports the same counts and source timestamp before it succeeds.

## Refresh schedule and controls

- A full snapshot refresh is scheduled monthly.
- A one-time push trigger is committed at `scripts/mca-refresh-index.flag` to start the first national import.
- The Actions workflow can also be started from GitHub Actions → **MCA national company index import**.
- For a fresh full snapshot, choose `max_records=0` and `reset_import=true`. For a capped test, choose a positive `max_records`; the test index is published under `staging/index/` and does not replace the live index.
- If a full run stops before completion, its checkpoint and uploaded pages remain in R2. A subsequent manual run with `reset_import=false` resumes from that checkpoint.

## Important limits

This is a periodic **master-data** snapshot, not a live MCA status API. It helps locate a legal-entity record; it does not establish current operations, recruiter identity/authority, whether a vacancy exists, or whether a submitted offer is authentic.

The OGD master-data resource does not itself provide director histories, charge details, full filing documents, financial statements or recruitment records. Do not scrape CAPTCHA-protected MCA pages or imply that such data has been verified. These sections require their own official, public dataset or an appropriately licensed data provider.

## Attribution

Contains Company Master Data provided by the Ministry of Corporate Affairs, Government of India, through the Open Government Data (OGD) Platform India, used under the Government Open Data License – India. MCA and the OGD Platform do not endorse OfferShield.
