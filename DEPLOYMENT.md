# Deployment options

OfferShield has a static website and a separate intelligence API.

## A. Public website — GitHub Pages

The public frontend is under `docs/` and is published at:

https://ambkeshwargupta.github.io/OfferShield/

GitHub Pages serves static files only. It cannot execute `server.js`, host API keys or provide central database persistence. The site uses browser-side fallbacks until a Worker API is connected.

## B. Scalable API — Cloudflare Workers + D1

See [workers/README.md](workers/README.md).

1. Create a Cloudflare account.
2. Install Wrangler and run `wrangler login`.
3. Create D1 database and apply `workers/schema.sql`.
4. Add the D1 binding in `workers/wrangler.toml`.
5. Store `DATA_GOV_API_KEY` as a Worker secret.
6. Deploy the Worker.
7. Copy the Worker URL into OfferShield → Advanced Search & Intelligence → API connection.
8. Test the API status badge and run a CIN lookup, domain scan and header parse.

The MCA OGD connector is available only when a data.gov.in key is configured. GST/Udyam remain official manual verification flows. D1 caching/rate limiting require the D1 binding.

## C. Local Node prototype

Requirements: Node.js 20+.

```bash
npm run check
npm test
npm start
```

Open http://localhost:3000.

The Node prototype uses a JSON file and browser-session ownership. It is development/single-instance only, not the scalable production backend.

## Production requirements still not supplied by GitHub Pages

- Real user accounts and per-user report storage.
- Custom authentication and access control for saved reports.
- A managed multi-user report database.
- Monitoring, alerting, backup and restore.
- Formal source-refresh jobs and source quality review.
- A data.gov.in account/API key supplied by the owner.
- Cloudflare D1 database ID and Worker deployment URL supplied by the owner.

The repository includes code and instructions for the Worker/D1 setup, but cannot create resources in your Cloudflare account without your login and explicit setup.
