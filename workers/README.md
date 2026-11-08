# OfferShield Intelligence API (Cloudflare Workers + D1)

This API is separate from GitHub Pages. GitHub Pages hosts the static premium website; Cloudflare Workers executes server-side integrations and D1 caches official company records.

## Current capabilities

- MCA Company Master Data lookup through the official data.gov.in resource.
- Company name discovery through exact OGD matching plus Wikidata discovery candidates.
- CIN / LLPIN exact lookup.
- Domain intelligence: A, AAAA, MX, TXT, NS and DMARC DNS records.
- Public RDAP registration-data lookup.
- Raw email-header parsing: From, Reply-To, Return-Path, Authentication-Results and DKIM selector/domain extraction.
- Capability reporting and evidence/limitations labels.
- D1 API response cache, company observations, contact evidence registry and hashed-IP rate limiting.

## Free setup

1. Create a free Cloudflare account: https://dash.cloudflare.com/sign-up
2. Install Wrangler locally: `npm install -g wrangler`
3. Authenticate: `wrangler login`
4. Create D1: `wrangler d1 create offershield-intelligence`
5. Copy the returned database ID into `wrangler.toml` and uncomment the D1 binding.
6. Apply schema: `wrangler d1 execute offershield-intelligence --file=workers/schema.sql --remote` (run from the repository root with the path `workers/schema.sql`).
7. Get a data.gov.in key from https://data.gov.in/ after creating a free account. The MCA dataset is https://www.data.gov.in/catalog/company-master-data.
8. Set the key securely: `wrangler secret put DATA_GOV_API_KEY`.
9. From the `workers` directory run `npx wrangler deploy`.

If you do not configure the D1 binding, endpoints still run but cache and rate limiting are unavailable. Configure D1 before public use.

## Attach API to the GitHub Pages UI

After deployment, copy the Worker URL (for example `https://offershield-intelligence.<your-subdomain>.workers.dev`). In OfferShield, open **Advanced Search & Intelligence → API connection**, paste the URL and save. The URL is public and contains no secret. The data.gov.in key remains inside the Cloudflare Worker secret store.

Allowed browser origins are in `api.js`. The default permits the published OfferShield GitHub Pages origin and localhost. Add your own origin only if you control it.

## Official source semantics

The current data.gov.in resource is:
`https://api.data.gov.in/resource/4dbe5667-7b6b-41d7-82af-211562424d9a`

The company master dataset is periodic and exact filters should be used. It is not a live MCA portal query. Name filters should be treated as exact-match only; fuzzy suggestions are community discovery candidates.

The API does not include directors, all filings, charges, full financial statements, or the identity/authority of recruiters. These are not fabricated or inferred.

## Deploy from GitHub

Connect the repository to Cloudflare Workers Builds or deploy with Wrangler from a local clone. Configure the D1 binding and Worker secret in Cloudflare. Never commit API keys, tokens or account identifiers to GitHub.

## Operational notes

- D1 caches OGD responses for 24 hours by default.
- DNS is queried through Google Public DNS-over-HTTPS.
- RDAP is used for registration data; privacy-redacted fields are expected.
- The worker never fetches arbitrary user-supplied web pages, which reduces SSRF risk.
- Rate-limit hashes are derived from Cloudflare's connecting IP; raw IP addresses are not stored.
- Review Cloudflare, data.gov.in, Google Public DNS and RDAP usage terms and quotas before broad public launch.
